import { expect, test } from 'bun:test'
import type { GithubData } from '../api/github'
import { type ChatContext, type ChatEvent, type Conversation, initialConversation, reduceConversation } from './conversation'

const ctx: ChatContext = {
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: 'https://avatars.example/octocat.png',
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
  expect(last(state).replies).toEqual(['@octocat'])

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
  expect(last(reasked).replies).toEqual(['@octocat'])
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
