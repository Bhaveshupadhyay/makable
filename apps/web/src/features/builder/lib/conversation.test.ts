import { expect, test } from 'bun:test'
import type { GithubData } from '../api/github'
import { portfolioSchema } from '@makable/shared'
import { AI_EDIT, type ChatContext, type ChatEvent, type Conversation, initialConversation, isAiRequest, reduceConversation } from './conversation'

const ctx: ChatContext = {
  user: { login: 'octocat', name: 'The Octocat', avatarUrl: 'https://avatars.example/octocat.png' },
  templates: [
    { id: 'minimal', name: 'Minimal' },
    { id: 'terminal', name: 'Terminal' },
    { id: 'bento', name: 'Bento' },
    { id: 'paper', name: 'Paper' },
    { id: 'clean-dev', name: 'Clean Dev' },
  ],
}

const github: GithubData = {
  profile: {
    login: 'octocat',
    name: 'The Octocat',
    avatarUrl: 'https://avatars.example/octocat.png',
    bio: 'Mascot',
    location: 'San Francisco',
    blog: 'github.blog',
    twitterUsername: null,
    email: null,
    htmlUrl: 'https://github.com/octocat',
  },
  repos: [
    { name: 'a', description: '', repoUrl: 'https://github.com/octocat/a', homepageUrl: '', language: 'TypeScript', stars: 9 },
    { name: 'b', description: '', repoUrl: 'https://github.com/octocat/b', homepageUrl: '', language: 'Go', stars: 3 },
  ],
}

const run = (events: ChatEvent[], from = initialConversation()) =>
  events.reduce((state, event) => reduceConversation(state, event, ctx), from)
const say = (text: string): ChatEvent => ({ type: 'user-text', text })
const last = (state: Conversation) => state.messages.at(-1)!

test('happy path builds a portfolio step by step', () => {
  let state = run([say('I want a portfolio')])
  expect(state.step).toBe('template')
  expect(last(state).widget).toBe('template-picker')
  expect(state.portfolio).toBeNull()

  state = run([{ type: 'select-template', template: 'terminal' }], state)
  expect(state.step).toBe('github')
  expect(state.portfolio?.template).toBe('terminal')
  expect(state.portfolio?.profile.name).toBe('The Octocat')
  expect(last(state).replies).toEqual(['@octocat', AI_EDIT])

  state = run([say('@octocat')], state)
  expect(state.step).toBe('github-loading')
  expect(state.githubLogin).toBe('octocat')
  expect(run([say('ignored while loading')], state)).toBe(state)

  state = run([{ type: 'github-loaded', data: github }], state)
  expect(state.step).toBe('headline')
  expect(state.portfolio?.projects).toHaveLength(2)
  expect(state.portfolio?.skills).toEqual(['TypeScript', 'Go'])
  expect(state.portfolio?.links.website).toBe('https://github.blog')

  state = run([say('Mascot of GitHub'), say('Keep it'), say('octo@example.com'), say('linkedin.com/in/octocat')], state)
  expect(state.step).toBe('done')
  expect(state.portfolio).toMatchObject({
    profile: { headline: 'Mascot of GitHub', bio: 'Mascot' },
    links: { email: 'octo@example.com', linkedin: 'https://linkedin.com/in/octocat' },
    template: 'terminal',
  })
})

test('typing a template name selects it', () => {
  const state = run([say('portfolio please'), say('the bento one')])
  expect(state.portfolio?.template).toBe('bento')
  expect(state.step).toBe('github')
  expect(run([say('portfolio'), say('Clean Dev please')]).portfolio?.template).toBe('clean-dev')
})

test('template names come from the catalog', () => {
  const state = run([say('portfolio'), { type: 'select-template', template: 'clean-dev' }])
  expect(state.messages.at(-2)?.text).toBe('Use the Clean Dev template')
  expect(last(state).text).toMatch(/^Clean Dev it is\./)

  const noCatalog = { ...ctx, templates: [] }
  const atTemplate = reduceConversation(initialConversation(), say('portfolio'), noCatalog)
  expect(reduceConversation(atTemplate, say('bento'), noCatalog).step).toBe('template')
})

test('off-topic intent and invalid answers re-ask without advancing', () => {
  expect(run([say('build me a game')]).step).toBe('intent')
  const atGithub = run([say('portfolio'), { type: 'select-template', template: 'minimal' }])
  const reasked = run([say('not a username!')], atGithub)
  expect(reasked.step).toBe('github')
  expect(last(reasked).replies).toEqual(['@octocat', AI_EDIT])
  const failed = run([say('ghost'), { type: 'github-failed', login: 'ghost' }], atGithub)
  expect(failed.step).toBe('github')
  expect(last(failed).text).toContain('@ghost')
})

test('email: invalid re-asks, skip clears', () => {
  const atEmail = run([say('portfolio'), { type: 'select-template', template: 'minimal' }, say('octocat'), { type: 'github-loaded', data: github }, say('Engineer'), say('skip')])
  expect(atEmail.step).toBe('email')
  expect(run([say('nope@')], atEmail).step).toBe('email')
  const skipped = run([say('Skip')], atEmail)
  expect(skipped.step).toBe('links')
  expect(skipped.portfolio?.links.email).toBe('')
})

test('template can be changed later without losing content', () => {
  const done = run([say('portfolio'), { type: 'select-template', template: 'minimal' }, say('octocat'), { type: 'github-loaded', data: github }, say('Engineer'), say('skip'), say('skip'), say('skip')])
  expect(done.step).toBe('done')
  const picker = run([say('Change template')], done)
  expect(last(picker).widget).toBe('template-picker')
  const switched = run([{ type: 'select-template', template: 'paper' }], picker)
  expect(switched.step).toBe('done')
  expect(switched.portfolio).toMatchObject({ template: 'paper', profile: { headline: 'Engineer' } })
})

test('stale GitHub results are ignored', () => {
  const atHeadline = run([say('portfolio'), { type: 'select-template', template: 'minimal' }, say('octocat'), { type: 'github-loaded', data: github }])
  expect(run([{ type: 'github-loaded', data: github }], atHeadline)).toBe(atHeadline)
})

const guest: ChatContext = { ...ctx, user: null }
const runAsGuest = (events: ChatEvent[], from = initialConversation()) =>
  events.reduce((state, event) => reduceConversation(state, event, guest), from)
const finish = [say('portfolio'), { type: 'select-template', template: 'minimal' }, say('octocat'), { type: 'github-loaded', data: github }, say('Engineer'), say('skip'), say('skip'), say('skip')] satisfies ChatEvent[]

test('guests can build a portfolio without signing in', () => {
  const atGithub = runAsGuest([say('portfolio'), { type: 'select-template', template: 'minimal' }])
  expect(atGithub.step).toBe('github')
  expect(atGithub.portfolio?.profile.name).toBe('Your name')
  // No GitHub link until the lookup, and the draft is still valid content.
  expect(atGithub.portfolio?.links.github).toBe('')
  expect(portfolioSchema.safeParse(atGithub.portfolio).success).toBe(true)
  expect(last(atGithub).replies).toEqual([AI_EDIT])

  const done = runAsGuest(finish)
  expect(done.step).toBe('done')
  expect(done.portfolio?.profile.name).toBe('The Octocat')
  expect(last(done).replies).toContain('Edit with AI')
})

test('AI requests ask guests to connect GitHub, then pick up after sign-in', () => {
  const asked = runAsGuest([say('Edit with AI')], runAsGuest(finish))
  expect(asked.awaitingSignIn).toBe(true)
  // A typed request is never dropped, even while the sign-in prompt is showing.
  expect(runAsGuest([say('make it blue')], asked).messages.at(-2)?.text).toBe('make it blue')
  expect(last(asked).widget).toBe('connect-github')
  expect(asked.step).toBe('done')

  // Guests can still use the non-AI parts while they decide.
  expect(last(runAsGuest([say('Change template')], asked)).widget).toBe('template-picker')

  // A stray sign-in event without a user, or when nothing is pending, changes nothing.
  expect(runAsGuest([{ type: 'signed-in' }], asked)).toBe(asked)
  const done = run(finish)
  expect(run([{ type: 'signed-in' }], done)).toBe(done)

  const resumed = run([{ type: 'signed-in' }], asked)
  expect(resumed.awaitingSignIn).toBe(false)
  expect(last(resumed).text).toMatch(/^Connected as @octocat\./)
  expect(resumed.portfolio).toEqual(asked.portfolio)
})

test('signed-in users get the AI reply without a sign-in prompt', () => {
  const state = run([say('make my bio funnier')], run(finish))
  expect(state.awaitingSignIn).toBeUndefined()
  expect(last(state).widget).toBeUndefined()
  expect(last(state).text).toMatch(/^Click the part of the preview/)
})

test('Edit with AI works mid-flow and keeps the current question open', () => {
  const atBio = runAsGuest([say('portfolio'), { type: 'select-template', template: 'minimal' }, say('octocat'), { type: 'github-loaded', data: { ...github, profile: { ...github.profile, bio: null } } }, say('Engineer')])
  expect(atBio.step).toBe('bio')
  expect(last(atBio).replies).toEqual(['Skip', AI_EDIT])

  // From the toolbar button: guests get the sign-in prompt, still offered the step's other replies.
  const asked = runAsGuest([{ type: 'ai-edit' }], atBio)
  expect(asked.messages.at(-2)?.text).toBe(AI_EDIT)
  expect(asked.step).toBe('bio')
  expect(asked.awaitingSignIn).toBe(true)
  expect(last(asked)).toMatchObject({ widget: 'connect-github', replies: ['Skip'] })
  expect(runAsGuest([{ type: 'ai-edit' }], asked)).toBe(asked)
  expect(runAsGuest([say(AI_EDIT)], asked)).toBe(asked)
  expect(runAsGuest([say('skip')], asked).step).toBe('email')

  // After signing in, the bio question is asked again.
  const resumed = run([{ type: 'signed-in' }], asked)
  expect(last(resumed).text).toContain('Meanwhile: Tell me a little about yourself')
  expect(last(resumed).replies).toEqual(['Skip', AI_EDIT])

  // Signed-in users get the same answer from the quick reply, without a sign-in prompt.
  const signedIn = run([say(AI_EDIT)], atBio)
  expect(signedIn.step).toBe('bio')
  expect(last(signedIn).widget).toBeUndefined()
  expect(last(signedIn).text).toMatch(/^Click the part of the preview.*Meanwhile: Tell me/)
})

test('Edit with AI needs an open preview and is ignored during a GitHub lookup', () => {
  const start = initialConversation()
  expect(run([{ type: 'ai-edit' }], start)).toBe(start)
  const loading = run([say('portfolio'), { type: 'select-template', template: 'minimal' }, say('octocat')])
  expect(loading.step).toBe('github-loading')
  expect(run([{ type: 'ai-edit' }], loading)).toBe(loading)
})

test('sent AI requests are logged in the chat without moving the flow', () => {
  const atBio = run([say('portfolio'), { type: 'select-template', template: 'minimal' }, say('octocat'), { type: 'github-loaded', data: { ...github, profile: { ...github.profile, bio: null } } }, say('Engineer')])
  const sent = run([{ type: 'ai-sent', instruction: 'Remove the skills section', target: 'Skills › skills.0', result: 'Removed 3 skills.' }], atBio)
  expect(sent.step).toBe('bio')
  expect(sent.messages.at(-2)).toMatchObject({ role: 'user', text: 'Remove the skills section' })
  expect(last(sent).text).toBe('Removed 3 skills.')
  expect(last(sent).replies).toEqual(['Skip', AI_EDIT])
  const start = initialConversation()
  expect(run([{ type: 'ai-sent', instruction: 'x', target: null, result: 'y' }], start)).toBe(start)
})

test('isAiRequest matches what the reducer treats as an AI request', () => {
  const atBio = run([say('portfolio'), { type: 'select-template', template: 'minimal' }, say('octocat'), { type: 'github-loaded', data: github }, say('Engineer')])
  expect(isAiRequest(initialConversation(), AI_EDIT)).toBe(false)
  expect(isAiRequest(atBio, '  edit WITH ai ')).toBe(true)
  expect(isAiRequest(atBio, 'I write compilers')).toBe(false)

  const done = run(finish)
  expect(isAiRequest(done, 'Make the header blue')).toBe(true)
  expect(isAiRequest(done, 'change template')).toBe(false)
  expect(isAiRequest({ ...done, step: 'github-loading' }, AI_EDIT)).toBe(false)
})
