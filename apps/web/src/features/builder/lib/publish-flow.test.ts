import { expect, test } from 'bun:test'
import type { PublishResult } from '../api/publish'
import { type ChatContext, type ChatEvent, type Conversation, initialConversation, isAiRequest, promptFor, reduceConversation } from './conversation'
import { awaitingToken, type Published } from './publish-flow'

const octocat = { login: 'octocat', name: 'The Octocat', avatarUrl: 'https://avatars.example/octocat.png' }
const templates = [{ id: 'minimal', name: 'Minimal' }]
const signedIn: ChatContext = { user: octocat, templates }
const guest: ChatContext = { user: null, templates }

const say = (text: string): ChatEvent => ({ type: 'user-text', text })
const last = (state: Conversation) => state.messages.at(-1)!
const run = (events: ChatEvent[], from: Conversation, ctx: ChatContext = signedIn) => events.reduce((s, e) => reduceConversation(s, e, ctx), from)

/** A finished site: template picked, guided steps done. */
const site: Conversation = run([say('I want a portfolio'), { type: 'select-template', template: 'minimal' }, say('skip')], initialConversation())
const done: Conversation = { ...site, step: 'done' }

const result = (over: Partial<PublishResult> = {}): PublishResult => ({
  target: 'vercel',
  repoFullName: 'octocat/portfolio',
  repoUrl: 'https://github.com/octocat/portfolio',
  branch: 'main',
  commitSha: 'c'.repeat(40),
  deploy: 'started',
  siteUrl: 'https://octocat-portfolio.vercel.app',
  projectName: 'octocat-portfolio',
  missingSecrets: [],
  secretsUrl: 'https://github.com/octocat/portfolio/settings/secrets/actions',
  actionsUrl: 'https://github.com/octocat/portfolio/actions/workflows/makable-deploy.yml',
  ...over,
})

test('Publish is offered when the site is done, and asks where to publish', () => {
  expect(promptFor('done', done.portfolio, signedIn).replies).toContain('Publish')
  const asked = run([{ type: 'publish' }], done)

  expect(asked.publish?.stage).toBe('target')
  expect(last(asked).replies).toEqual(['GitHub Pages', 'Vercel', 'Cloudflare Pages', 'Netlify', 'Cancel'])
  // "publish" typed at the end is a publish request, not an AI edit.
  expect(isAiRequest(done, 'publish my site')).toBe(false)
  expect(run([say('publish my site')], done).publish?.stage).toBe('target')
})

test('GitHub Pages: confirm the public repo, then run', () => {
  const confirm = run([{ type: 'publish' }, say('GitHub Pages')], done)
  expect(confirm.publish).toEqual({ stage: 'confirm', target: 'github-pages' })
  expect(last(confirm).text).toContain('https://octocat.github.io/')
  expect(last(confirm).text).toContain('public')

  const running = run([say('Publish')], confirm)
  expect(running.publish).toMatchObject({ stage: 'running', target: 'github-pages', action: 'publish' })
  expect(running.publish?.runId).toBeString()
})

test('a pasted token never enters the chat', () => {
  const mode = run([{ type: 'publish' }, say('Vercel')], done)
  expect(mode.publish?.stage).toBe('token-mode')
  expect(last(mode).text).toContain('VERCEL_TOKEN')
  expect(last(mode).text).toContain('https://vercel.com/account/tokens')

  const asking = run([say('Paste it here')], mode)
  expect(awaitingToken(asking.publish)).toBe(true)
  // The token box (or the composer, routed by useBuilder) reports only the last 4 characters.
  const running = run([{ type: 'publish-token', last4: 'k9Zq' }], asking)
  expect(last(running).text).toBe('Checking the token and publishing…')
  expect(running.messages.at(-2)!.text).toBe('Token ending in k9Zq')
  expect(running.publish).toMatchObject({ stage: 'running', target: 'vercel', paste: true, action: 'publish' })
})

test('adding the secrets on GitHub: publish, then deploy when told', () => {
  const running = run([{ type: 'publish' }, say('Netlify'), say("I'll add it on GitHub")], done)
  expect(running.publish).toMatchObject({ stage: 'running', paste: false })

  const waiting = run(
    [{ type: 'publish-done', result: result({ target: 'netlify', deploy: 'waiting_for_secrets', missingSecrets: ['NETLIFY_AUTH_TOKEN'] }) }],
    running,
  )
  expect(waiting.publish).toEqual({ stage: 'secrets', target: 'netlify', repoName: 'portfolio' })
  expect(last(waiting).text).toContain('NETLIFY_AUTH_TOKEN')
  expect(last(waiting).text).toContain('https://github.com/octocat/portfolio/settings/secrets/actions')

  const deploy = run([say('Deploy now')], waiting)
  expect(deploy.publish).toMatchObject({ stage: 'running', action: 'deploy', repoName: 'portfolio', paste: false })
  const missing = run([{ type: 'publish-failed', code: 'publish_secrets_missing', message: '', details: { missing: ['NETLIFY_AUTH_TOKEN'], secretsUrl: 'https://x' } }], deploy)
  expect(missing.publish?.stage).toBe('secrets')

  const deploying = run([say('Deploy now'), { type: 'deploy-started', actionsUrl: 'https://github.com/a', since: '2026-10-11T10:00:00Z' }], missing)
  expect(deploying.publish).toMatchObject({ stage: 'deploying', since: '2026-10-11T10:00:00Z' })
})

test('a started deploy is followed until it is live, or says why it failed', () => {
  const running = run([{ type: 'publish' }, say('Vercel'), say("I'll add it on GitHub")], done)
  const deploying = run([{ type: 'publish-done', result: result() }], running)
  expect(deploying.publish).toMatchObject({ stage: 'deploying', commitSha: 'c'.repeat(40), siteUrl: 'https://octocat-portfolio.vercel.app' })
  expect(last(deploying).text).toContain('https://octocat-portfolio.vercel.app')

  const run_ = { status: 'completed', headSha: 'c'.repeat(40), htmlUrl: 'https://github.com/run/1', createdAt: '2026-10-11T10:00:00Z' }
  const live = run([{ type: 'deploy-finished', run: { ...run_, conclusion: 'success' } }], deploying)
  expect(live.publish).toBeUndefined()
  expect(last(live).text).toContain('live at https://octocat-portfolio.vercel.app')

  const broken = run([{ type: 'deploy-finished', run: { ...run_, conclusion: 'failure' } }], deploying)
  expect(last(broken).text).toContain('https://github.com/run/1')
  // Trying again re-runs the deploy: the code is already on GitHub.
  expect(run([say('Try again')], broken).publish).toMatchObject({ stage: 'running', action: 'deploy' })
})

test('publishing again goes straight to the same platform and repo', () => {
  const published: Published = { target: 'netlify', repoName: 'my-site', siteUrl: 'https://my-site.netlify.app' }
  const again = run([{ type: 'publish' }], done, { ...signedIn, published })
  expect(again.publish).toMatchObject({ stage: 'running', target: 'netlify', repoName: 'my-site', action: 'publish' })

  expect(run([say('Publish somewhere else')], done, { ...signedIn, published }).publish?.stage).toBe('target')

  const unchanged = run([{ type: 'publish-done', result: result({ deploy: 'unchanged' }) }], again, { ...signedIn, published })
  expect(unchanged.publish).toBeUndefined()
  expect(last(unchanged).text).toContain('Nothing changed')
})

test('conflicts and taken names are answered in the chat', () => {
  const running = run([{ type: 'publish' }, say('GitHub Pages'), say('Publish')], done)

  const overwrite = run([{ type: 'publish-failed', code: 'publish_changed_on_github', message: '', details: { headSha: 'h'.repeat(40), paths: ['src/App.tsx'] } }], running)
  expect(last(overwrite).text).toContain('src/App.tsx')
  expect(run([say('Overwrite')], overwrite).publish).toMatchObject({ stage: 'running', confirmOverwrite: 'h'.repeat(40) })

  const taken = run([{ type: 'publish-failed', code: 'publish_repo_taken', message: 'You already have that repo.' }], running)
  expect(run([say('../x')], taken).publish?.stage).toBe('repo-name')
  expect(run([say('my-site')], taken).publish).toMatchObject({ stage: 'running', repoName: 'my-site' })

  const accounts = [{ id: 'a'.repeat(32), name: 'Personal' }, { id: 'b'.repeat(32), name: 'Work' }]
  const pick = run([{ type: 'publish-failed', code: 'platform_account_required', message: 'Which account?', details: { accounts } }], running)
  expect(last(pick).replies).toEqual(['Personal', 'Work', 'Cancel'])
  expect(run([say('Work')], pick).publish).toMatchObject({ stage: 'running', accountId: 'b'.repeat(32) })
})

test('errors that need GitHub again, a lost token, a sync conflict and cancelling', () => {
  const running = run([{ type: 'publish' }, say('Vercel'), say('Paste it here'), { type: 'publish-token', last4: 'abcd' }], done)

  const scope = run([{ type: 'publish-failed', code: 'github_missing_scope', message: 'Connect GitHub again to let makable set up your deploy workflow.' }], running)
  expect(scope.publish?.stage).toBe('reconnect')
  expect(run([say('Try again')], scope).publish?.stage).toBe('running')

  const lost = run([{ type: 'publish-failed', code: 'token_lost', message: '' }], running)
  expect(lost.publish?.stage).toBe('token')
  expect(last(lost).text).toContain("don't keep tokens")

  const conflict = run([{ type: 'publish-failed', code: 'workspace_conflict', message: '' }], running)
  expect(conflict.publish).toBeUndefined()
  expect(last(conflict).text).toContain('another device')

  const cancelled = run([{ type: 'publish' }, say('Cancel')], done)
  expect(cancelled.publish).toBeUndefined()
  expect(last(cancelled).text).toContain("won't publish")
})

test('a guest connects GitHub first, then picks a platform', () => {
  const asked = run([{ type: 'publish' }], done, guest)
  expect(asked).toMatchObject({ awaitingSignIn: true, signInFor: 'publish' })
  expect(last(asked).widget).toBe('connect-github')
  // Clicking again doesn't stack prompts.
  expect(run([{ type: 'publish' }], asked, guest)).toBe(asked)

  const back = run([{ type: 'signed-in' }], asked)
  expect(back.awaitingSignIn).toBe(false)
  expect(last(back).text).toBe('Connected as @octocat. Where should I publish your site?')
  expect(back.publish?.stage).toBe('target')
})

test('nothing to publish before a template is picked', () => {
  const fresh = initialConversation()
  expect(run([{ type: 'publish' }], fresh)).toBe(fresh)
})

test('after a failed publish, other chat is ordinary chat and drops the failed flow', () => {
  const running = run([{ type: 'publish' }, say('GitHub Pages'), say('Publish')], done)
  const failed = run([{ type: 'publish-failed', code: 'internal_error', message: 'Boom' }], running)
  expect(failed.publish?.stage).toBe('failed')

  // An AI request opens AI mode (useBuilder asks isAiRequest first) and the failed flow is gone.
  expect(isAiRequest(failed, 'make the header blue')).toBe(true)
  const moved = run([say('make the header blue')], failed)
  expect(moved.publish).toBeUndefined()
  expect(moved.messages.at(-2)!.text).toBe('make the header blue')

  // Its own replies and publish requests still answer it.
  expect(isAiRequest(failed, 'Try again')).toBe(false)
  expect(run([say('Try again')], failed).publish?.stage).toBe('running')
  expect(run([say('publish')], failed).publish?.stage).toBe('running')

  const reconnect = run([{ type: 'publish-failed', code: 'github_reconnect', message: 'Connect again.' }], running)
  expect(run([say('Change template')], reconnect).publish).toBeUndefined()
})
