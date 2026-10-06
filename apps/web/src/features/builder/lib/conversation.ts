import type { Portfolio, TemplateId } from '@makable/shared'
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
  widget?: 'template-picker' | 'connect-github'
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
  /** A guest asked for an AI feature and was asked to connect GitHub. */
  awaitingSignIn?: boolean
}

export type ChatEvent =
  | { type: 'user-text'; text: string }
  | { type: 'select-template'; template: TemplateId }
  | { type: 'github-loaded'; data: GithubData }
  | { type: 'github-failed'; login: string }
  /** GitHub got connected while `awaitingSignIn`. */
  | { type: 'signed-in' }
  /** The "Edit with AI" button outside the chat (preview toolbar). */
  | { type: 'ai-edit' }
  /** An AI edit request went out from the box under the preview. `target` labels the selected element. */
  | { type: 'ai-sent'; instruction: string; target: string | null }

export type TemplateOption = { id: TemplateId; name: string }

export type ChatUser = { login: string; name: string | null; avatarUrl: string }

/**
 * The signed-in user (null for a guest), used for first-draft content before GitHub
 * is looked up, and the published templates (empty until the catalog loads).
 */
export type ChatContext = { user: ChatUser | null; templates: readonly TemplateOption[] }

const id = () => crypto.randomUUID()
const user = (text: string): ChatMessage => ({ id: id(), role: 'user', text })
const assistant = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: id(), role: 'assistant', text, ...extra })

const WANTS_PORTFOLIO = /\b(portfolio|site|website|cv|resume|yes|yeah|sure|ok|okay|start)\b/i
const LINK_LABELS = { linkedin: 'LinkedIn', x: 'X', website: 'your website' } as const
/** Quick reply and toolbar label for AI edits. Offered at every step once the preview is open. */
export const AI_EDIT = 'Edit with AI'
const AI_HOWTO = 'Click the part of the preview you want to change, then describe the change in the box under the preview.'
const CONNECT_GITHUB = "AI edits run on your GitHub account, so connect it first. Everything you've built so far stays here."
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
        replies: ctx.user ? [`@${ctx.user.login}`, AI_EDIT] : [AI_EDIT],
      })
    case 'headline':
      return assistant(
        'What do you do? This becomes the headline under your name, e.g. “Full-stack engineer building developer tools”.',
        { replies: [AI_EDIT] },
      )
    case 'bio':
      return portfolio?.profile.bio
        ? assistant('I used the bio from your GitHub profile. Send a new one to replace it, or keep it.', { replies: ['Keep it', AI_EDIT] })
        : assistant('Tell me a little about yourself in a sentence or two. It goes in the About section.', { replies: ['Skip', AI_EDIT] })
    case 'email':
      return assistant('Which email should visitors use to contact you?', {
        replies: portfolio?.links.email ? [portfolio.links.email, 'Skip', AI_EDIT] : ['Skip', AI_EDIT],
      })
    case 'links':
      return assistant('Any other links to show? Paste your LinkedIn, X or personal site, all in one message.', {
        replies: ['Skip', AI_EDIT],
      })
    case 'done':
      return assistant(
        'Your portfolio is ready. Click any text in the preview to edit it, or pick a different template anytime.',
        { replies: [AI_EDIT, 'Change template'] },
      )
    case 'intent':
    case 'github-loading':
      return assistant('')
  }
}

/** Placeholder content until the GitHub step fills it in. Guests get generic values. */
function firstDraft(template: TemplateId, { user }: ChatContext): Portfolio {
  return {
    profile: {
      name: user ? (user.name ?? user.login) : 'Your name',
      headline: 'Software developer',
      bio: '',
      location: '',
      avatarUrl: user?.avatarUrl ?? '',
    },
    links: { github: `https://github.com/${user?.login ?? ''}`, linkedin: '', x: '', website: '', email: '' },
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

/**
 * An AI edit request, from any step after the preview opens. Guests are asked to connect GitHub.
 * Signed-in users are told how to use the AI box (the caller opens it). Either way the current
 * step's question stays open.
 */
function requestAiEdit(state: Conversation, ctx: ChatContext, text: string): Conversation {
  // Repeated button clicks shouldn't stack up sign-in prompts. Typed requests are always kept.
  if (!ctx.user && text === AI_EDIT && state.messages.at(-1)?.widget === 'connect-github') return state
  const s = { ...state, messages: [...state.messages, user(text)] }
  const { replies } = promptFor(state.step, state.portfolio, ctx)
  if (!ctx.user) {
    return reply({ ...s, awaitingSignIn: true }, CONNECT_GITHUB, {
      widget: 'connect-github',
      replies: replies?.filter((r) => r !== AI_EDIT),
    })
  }
  return reply(s, `${AI_HOWTO}${resumeStep(state, ctx)}`, { replies })
}

/** Repeats the open question after a detour, so the guided flow carries on. */
function resumeStep(state: Conversation, ctx: ChatContext): string {
  return state.step === 'done' ? '' : ` Meanwhile: ${promptFor(state.step, state.portfolio, ctx).text}`
}

function matchTemplate(text: string, templates: readonly TemplateOption[]): TemplateId | undefined {
  const lower = text.toLowerCase()
  return templates.find((t) => lower.includes(t.id) || lower.includes(t.name.toLowerCase()))?.id
}

export function reduceConversation(state: Conversation, event: ChatEvent, ctx: ChatContext): Conversation {
  switch (event.type) {
    case 'select-template': {
      const name = ctx.templates.find((t) => t.id === event.template)?.name ?? event.template
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

    case 'signed-in': {
      if (!state.awaitingSignIn || !ctx.user) return state
      const resumed = { ...state, awaitingSignIn: false }
      return reply(resumed, `Connected as @${ctx.user.login}. ${AI_HOWTO}${resumeStep(resumed, ctx)}`, {
        replies: promptFor(state.step, state.portfolio, ctx).replies,
      })
    }

    case 'ai-sent': {
      if (!state.portfolio) return state
      const context = event.target ? ` with “${event.target}” as context` : ''
      return reply(
        { ...state, messages: [...state.messages, user(event.instruction)] },
        `Sent to the AI${context}. It can't apply changes yet, so the preview stays the same. The panel under the preview shows exactly what it received.`,
        { replies: promptFor(state.step, state.portfolio, ctx).replies },
      )
    }

    case 'ai-edit': {
      if (!state.portfolio || state.step === 'github-loading') return state
      return requestAiEdit(state, ctx, AI_EDIT)
    }

    case 'user-text': {
      const text = event.text.trim()
      if (!text || state.step === 'github-loading') return state
      if (state.portfolio && text.toLowerCase() === AI_EDIT.toLowerCase()) return requestAiEdit(state, ctx, AI_EDIT)
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
          const template = matchTemplate(text, ctx.templates)
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

        // Anything said after the guided steps is a request for the AI agent, which needs GitHub.
        case 'done':
          return requestAiEdit(state, ctx, text)
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
