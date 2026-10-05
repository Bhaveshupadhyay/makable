import { templateCatalog, templateIds, type Portfolio, type TemplateId } from '@makable/shared'
import type { GithubData } from '../api/github'
import { applyGithubData } from './github-content'
import { isSkip, parseEmail, parseGithubLogin, parseLinks } from './parse'

// The guided chat that builds a portfolio. A pure reducer: (state, event) → state.
// It stands in for the AI agent (plan §3) until that exists, and keeps the same
// shape: the user chats, and the portfolio (and so the preview) changes.

export type Step = 'intent' | 'template' | 'github' | 'github-loading' | 'headline' | 'bio' | 'email' | 'links' | 'done'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Inline UI rendered under the text. */
  widget?: 'template-picker'
  /** Quick replies. Only the latest message's are offered. */
  replies?: string[]
}

export type Conversation = {
  step: Step
  messages: ChatMessage[]
  /** Null until a template is picked; the preview opens once it exists. */
  portfolio: Portfolio | null
  /** The GitHub login being looked up while `step` is `github-loading`. */
  githubLogin?: string
}

export type ChatEvent =
  | { type: 'user-text'; text: string }
  | { type: 'select-template'; template: TemplateId }
  | { type: 'github-loaded'; data: GithubData }
  | { type: 'github-failed'; login: string }

/** The signed-in user, used for first-draft content before GitHub is looked up. */
export type ChatContext = { login: string; name: string | null; avatarUrl: string }

const id = () => crypto.randomUUID()
const user = (text: string): ChatMessage => ({ id: id(), role: 'user', text })
const assistant = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: id(), role: 'assistant', text, ...extra })

const WANTS_PORTFOLIO = /\b(portfolio|site|website|cv|resume|yes|yeah|sure|ok|okay|start)\b/i
const LINK_LABELS = { linkedin: 'LinkedIn', x: 'X', website: 'your website' } as const
const CHANGE_TEMPLATE = /\b(change|switch|another|different|show)\b.*\b(template|design|look|theme)s?\b|^templates?$/i

export function initialConversation(): Conversation {
  return {
    step: 'intent',
    portfolio: null,
    messages: [
      assistant('Hi! I build developer portfolios and publish them to GitHub Pages. What would you like to make?', {
        replies: ['I want a portfolio'],
      }),
    ],
  }
}

/** The question for a step. Exported so the UI and tests can match on it. */
export function promptFor(step: Step, portfolio: Portfolio | null, ctx: ChatContext): ChatMessage {
  switch (step) {
    case 'template':
      return assistant("Let's build your portfolio. Pick a template to start. You can switch anytime.", {
        widget: 'template-picker',
      })
    case 'github':
      return assistant("What's your GitHub username? I'll pull in your profile and top repositories.", {
        replies: [`@${ctx.login}`],
      })
    case 'headline':
      return assistant(
        'What do you do? This becomes the headline under your name, e.g. “Full-stack engineer building developer tools”.',
      )
    case 'bio':
      return portfolio?.profile.bio
        ? assistant('I used the bio from your GitHub profile. Send a new one to replace it, or keep it.', { replies: ['Keep it'] })
        : assistant('Tell me a little about yourself in a sentence or two. It goes in the About section.', { replies: ['Skip'] })
    case 'email':
      return assistant('Which email should visitors use to contact you?', {
        replies: portfolio?.links.email ? [portfolio.links.email, 'Skip'] : ['Skip'],
      })
    case 'links':
      return assistant('Any other links to show? Paste your LinkedIn, X or personal site, all in one message.', {
        replies: ['Skip'],
      })
    case 'done':
      return assistant(
        'Your portfolio is ready. Click any text in the preview to edit it, or pick a different template anytime.',
        { replies: ['Change template'] },
      )
    case 'intent':
    case 'github-loading':
      return assistant('')
  }
}

function firstDraft(template: TemplateId, ctx: ChatContext): Portfolio {
  return {
    profile: { name: ctx.name ?? ctx.login, headline: 'Software developer', bio: '', location: '', avatarUrl: ctx.avatarUrl },
    links: { github: `https://github.com/${ctx.login}`, linkedin: '', x: '', website: '', email: '' },
    skills: [],
    projects: [],
    template,
  }
}

/** Appends the user's message and the assistant's reply, then moves to `step`. */
function advance(state: Conversation, ctx: ChatContext, step: Step, patch: Partial<Conversation> = {}, lead?: string) {
  const next = { ...state, ...patch, step }
  const prompt = promptFor(step, next.portfolio, ctx)
  const message = lead ? { ...prompt, text: `${lead} ${prompt.text}` } : prompt
  return { ...next, messages: [...next.messages, message] }
}

function reply(state: Conversation, text: string, extra?: Partial<ChatMessage>): Conversation {
  return { ...state, messages: [...state.messages, assistant(text, extra)] }
}

/** Re-asks the current step after an answer that didn't fit, keeping its quick replies. */
function reask(state: Conversation, ctx: ChatContext, text: string): Conversation {
  return reply(state, text, { replies: promptFor(state.step, state.portfolio, ctx).replies })
}

function matchTemplate(text: string): TemplateId | undefined {
  const lower = text.toLowerCase()
  return templateIds.find((t) => lower.includes(t) || lower.includes(templateCatalog[t].name.toLowerCase()))
}

export function reduceConversation(state: Conversation, event: ChatEvent, ctx: ChatContext): Conversation {
  switch (event.type) {
    case 'select-template': {
      const name = templateCatalog[event.template].name
      const portfolio = state.portfolio ? { ...state.portfolio, template: event.template } : firstDraft(event.template, ctx)
      const withChoice = { ...state, portfolio, messages: [...state.messages, user(`Use the ${name} template`)] }
      if (state.step === 'intent' || state.step === 'template') {
        return advance(withChoice, ctx, 'github', {}, `${name} it is. The preview is on the right.`)
      }
      return reply(withChoice, `Switched to ${name}.`)
    }

    case 'github-loaded': {
      if (state.step !== 'github-loading' || !state.portfolio) return state
      const portfolio = applyGithubData(state.portfolio, event.data)
      const count = portfolio.projects.length
      const lead = count
        ? `Found you, ${portfolio.profile.name}! I added ${count} of your top projects and languages to the preview.`
        : `Found you, ${portfolio.profile.name}! You have no public repos yet, so I left out the projects section.`
      return advance(state, ctx, 'headline', { portfolio, githubLogin: undefined }, lead)
    }

    case 'github-failed': {
      if (state.step !== 'github-loading') return state
      return reask({ ...state, step: 'github', githubLogin: undefined }, ctx, `I couldn't load @${event.login} from GitHub. Check the spelling and try again.`)
    }

    case 'user-text': {
      const text = event.text.trim()
      if (!text || state.step === 'github-loading') return state
      const s = { ...state, messages: [...state.messages, user(text)] }

      if (state.portfolio && CHANGE_TEMPLATE.test(text)) {
        return reply(s, 'Here are the templates. Pick one:', { widget: 'template-picker' })
      }

      switch (state.step) {
        case 'intent':
          return WANTS_PORTFOLIO.test(text)
            ? advance(s, ctx, 'template')
            : reply(s, 'Right now I can only build developer portfolios. Want to start one?', { replies: ['Build my portfolio'] })

        case 'template': {
          const template = matchTemplate(text)
          return template
            ? reduceConversation(state, { type: 'select-template', template }, ctx)
            : reply(s, 'Pick one of the templates above, or type its name.')
        }

        case 'github': {
          const login = parseGithubLogin(text)
          return login
            ? reply({ ...s, step: 'github-loading', githubLogin: login }, `Looking up @${login} on GitHub…`)
            : reask(s, ctx, "That doesn't look like a GitHub username. Try something like @octocat.")
        }

        case 'headline':
          if (text.length > 120) return reask(s, ctx, 'Keep it to one short line, under 120 characters.')
          return advance(s, ctx, 'bio', { portfolio: withProfile(s.portfolio!, { headline: text }) }, 'Nice.')

        case 'bio':
          return advance(s, ctx, 'email', isSkip(text) ? {} : { portfolio: withProfile(s.portfolio!, { bio: text }) })

        case 'email': {
          if (isSkip(text)) return advance(s, ctx, 'links', { portfolio: withLinks(s.portfolio!, { email: '' }) })
          const email = parseEmail(text)
          return email
            ? advance(s, ctx, 'links', { portfolio: withLinks(s.portfolio!, { email }) })
            : reask(s, ctx, "That doesn't look like an email address. Try again, or skip.")
        }

        case 'links': {
          if (isSkip(text)) return advance(s, ctx, 'done')
          const links = parseLinks(text)
          const found = (Object.keys(links) as (keyof typeof links)[]).map((key) => LINK_LABELS[key])
          if (!found.length) return reask(s, ctx, "I couldn't find a link in that. Paste the full URL, or skip.")
          return advance(s, ctx, 'done', { portfolio: withLinks(s.portfolio!, links) }, `Added ${found.join(', ')}.`)
        }

        case 'done':
          return reply(
            s,
            "Soon you'll be able to ask me for changes like that. For now, click any text in the preview to edit it, or change the template.",
            { replies: ['Change template'] },
          )
      }
    }
  }
}

function withProfile(portfolio: Portfolio, patch: Partial<Portfolio['profile']>): Portfolio {
  return { ...portfolio, profile: { ...portfolio.profile, ...patch } }
}

function withLinks(portfolio: Portfolio, patch: Partial<Portfolio['links']>): Portfolio {
  return { ...portfolio, links: { ...portfolio.links, ...patch } }
}
