import { expect, test } from 'bun:test'
import type { PublishResult } from '../api/publish'
import { emptyChat, type LocalChat } from './chat'
import { awaitingToken, type PublishContext, type PublishEvent, pagesUrl, publishText, reducePublish } from './publish-flow'

const ctx: PublishContext = { login: 'octocat', repoName: 'bakery', published: null }

type Step = PublishEvent | string
const last = (state: LocalChat) => state.messages.at(-1)!
/** Events, or chat text (which must be an answer to the flow). */
const run = (steps: Step[], from: LocalChat = emptyChat(), c: PublishContext = ctx) =>
  steps.reduce<LocalChat>((s, step) => {
    if (typeof step !== 'string') return reducePublish(s, step, c)
    const next = publishText(s, step, c)
    if (!next) throw new Error(`not an answer: ${step}`)
    return next
  }, from)

const result = (over: Partial<PublishResult> = {}): PublishResult =>
  ({
    target: 'vercel',
    repoFullName: 'octocat/bakery',
    repoUrl: 'https://github.com/octocat/bakery',
    branch: 'main',
    commitSha: 'c'.repeat(40),
    changed: true,
    deploy: 'started',
    deployStartedAt: '2026-10-11T13:45:07Z',
    siteUrl: 'https://octocat-bakery.vercel.app',
    projectName: 'octocat-bakery',
    missingSecrets: [],
    secretsUrl: 'https://github.com/octocat/bakery/settings/secrets/actions',
    actionsUrl: 'https://github.com/octocat/bakery/actions/workflows/makable-deploy.yml',
    ...over,
  }) as PublishResult

test('Publish asks where to publish', () => {
  const asked = run([{ type: 'publish' }])

  expect(asked.publish?.stage).toBe('target')
  expect(last(asked).replies).toEqual(['GitHub Pages', 'Vercel', 'Cloudflare Pages', 'Netlify', 'Cancel'])
})

test('GitHub Pages: agree to make the repo public, then run', () => {
  const confirm = run([{ type: 'publish' }, 'GitHub Pages'])
  expect(confirm.publish).toEqual({ stage: 'confirm', target: 'github-pages' })
  expect(last(confirm).text).toContain('public')
  expect(last(confirm).text).toContain('https://octocat.github.io/bakery/')

  const running = run(['Make it public and publish'], confirm)
  expect(running.publish).toMatchObject({ stage: 'running', target: 'github-pages', action: 'publish', makePublic: true })
  expect(running.publish?.runId).toBeString()
})

test('a private Pages repo asks again', () => {
  const running = run([{ type: 'publish' }], emptyChat(), { ...ctx, published: { target: 'github-pages', siteUrl: null } })
  expect(running.publish).toMatchObject({ stage: 'running', target: 'github-pages' })

  const asked = run([{ type: 'publish-failed', code: 'publish_pages_private', message: '' }], running)
  expect(asked.publish?.stage).toBe('confirm')
  expect(last(asked).text).toContain('private')
})

test('the user site repo is served at the root', () => {
  expect(pagesUrl('Octocat', 'octocat.github.io')).toBe('https://octocat.github.io/')
  expect(pagesUrl('octocat', 'bakery')).toBe('https://octocat.github.io/bakery/')
})

test('a pasted token never enters the chat', () => {
  const mode = run([{ type: 'publish' }, 'Vercel'])
  expect(mode.publish?.stage).toBe('token-mode')
  expect(last(mode).text).toContain('VERCEL_TOKEN')

  const asking = run(['Paste it here'], mode)
  expect(awaitingToken(asking.publish)).toBe(true)
  const running = run([{ type: 'publish-token', last4: 'k9Zq' }], asking)
  expect(last(running).text).toBe('Checking the token and publishing…')
  expect(running.messages.at(-2)!.text).toBe('Token ending in k9Zq')
  expect(running.publish).toMatchObject({ stage: 'running', target: 'vercel', paste: true, action: 'publish' })
})

test('adding the secrets on GitHub: publish, then deploy when told', () => {
  const running = run([{ type: 'publish' }, 'Netlify', "I'll add it on GitHub"])
  expect(running.publish).toMatchObject({ stage: 'running', paste: false })

  const waiting = run([{ type: 'publish-done', result: result({ target: 'netlify', deploy: 'waiting_for_secrets', deployStartedAt: null, missingSecrets: ['NETLIFY_AUTH_TOKEN'] } as Partial<PublishResult>) }], running)
  expect(waiting.publish).toEqual({ stage: 'secrets', target: 'netlify' })
  expect(last(waiting).text).toContain('NETLIFY_AUTH_TOKEN')

  const deploy = run(['Deploy now'], waiting)
  expect(deploy.publish).toMatchObject({ stage: 'running', action: 'deploy', paste: false })
  const missing = run([{ type: 'publish-failed', code: 'publish_secrets_missing', message: '', details: { missing: ['NETLIFY_AUTH_TOKEN'], secretsUrl: 'https://x' } }], deploy)
  expect(missing.publish?.stage).toBe('secrets')

  const deploying = run(['Deploy now', { type: 'deploy-started', actionsUrl: 'https://github.com/a', since: '2026-10-11T10:00:00Z' }], missing)
  expect(deploying.publish).toMatchObject({ stage: 'deploying', since: '2026-10-11T10:00:00Z' })
})

test('a started deploy is followed until it is live, or says why it failed', () => {
  const running = run([{ type: 'publish' }, 'Vercel', "I'll add it on GitHub"])
  const deploying = run([{ type: 'publish-done', result: result() }], running)
  expect(deploying.publish).toMatchObject({ stage: 'deploying', since: '2026-10-11T13:45:07Z', siteUrl: 'https://octocat-bakery.vercel.app' })

  const done = { status: 'completed', headSha: 'c'.repeat(40), htmlUrl: 'https://github.com/run/1', createdAt: '2026-10-11T10:00:00Z' }
  const live = run([{ type: 'deploy-finished', run: { ...done, conclusion: 'success' } }], deploying)
  expect(live.publish).toBeUndefined()
  expect(last(live).text).toContain('live at https://octocat-bakery.vercel.app')

  const broken = run([{ type: 'deploy-finished', run: { ...done, conclusion: 'failure' } }], deploying)
  expect(last(broken).text).toContain('https://github.com/run/1')
  expect(run(['Try again'], broken).publish).toMatchObject({ stage: 'running', action: 'deploy' })
})

test('publishing again goes straight to the same platform', () => {
  const published = { target: 'netlify' as const, siteUrl: 'https://bakery.netlify.app' }
  expect(run([{ type: 'publish' }], emptyChat(), { ...ctx, published }).publish).toMatchObject({ stage: 'running', target: 'netlify', action: 'publish' })
})

test('taken project names, accounts, reconnecting, a lost token, a conflict and cancelling', () => {
  const running = run([{ type: 'publish' }, 'Vercel', 'Paste it here', { type: 'publish-token', last4: 'abcd' }])

  const taken = run([{ type: 'publish-failed', code: 'platform_project_taken', message: '' }], running)
  expect(run(['my-bakery'], taken).publish).toMatchObject({ stage: 'running', projectName: 'my-bakery' })

  const accounts = [{ id: 'a'.repeat(32), name: 'Personal' }, { id: 'b'.repeat(32), name: 'Work' }]
  const pick = run([{ type: 'publish-failed', code: 'platform_account_required', message: 'Which account?', details: { accounts } }], running)
  expect(last(pick).replies).toEqual(['Personal', 'Work', 'Cancel'])
  expect(run(['Work'], pick).publish).toMatchObject({ stage: 'running', accountId: 'b'.repeat(32) })

  const scope = run([{ type: 'publish-failed', code: 'github_missing_scope', message: 'Connect GitHub again.' }], running)
  expect(scope.publish?.stage).toBe('reconnect')
  expect(last(scope).widget).toBe('reconnect-github')

  const lost = run([{ type: 'publish-failed', code: 'token_lost', message: '' }], running)
  expect(lost.publish?.stage).toBe('token')

  const conflict = run([{ type: 'publish-failed', code: 'site_conflict', message: '' }], running)
  expect(conflict.publish).toBeUndefined()

  expect(run([{ type: 'publish' }, 'Cancel']).publish).toBeUndefined()
})

test('while GitHub is connected again, the same run stays running, so it goes again after the sign-in', () => {
  const running = run([{ type: 'publish' }, 'Vercel', "I'll add it on GitHub"])
  const away = run([{ type: 'publish-reconnecting' }], running)

  expect(away.publish).toEqual(running.publish)
  expect(last(away).text).toContain('connecting it again')
  expect(last(away).widget).toBeUndefined()
  // A run that ended meanwhile isn't brought back.
  const cancelled = run([{ type: 'publish' }, 'Cancel'])
  expect(run([{ type: 'publish-reconnecting' }], cancelled)).toBe(cancelled)
})

test('after a failure, other chat is not an answer', () => {
  const running = run([{ type: 'publish' }, 'Vercel', "I'll add it on GitHub"])
  const failed = run([{ type: 'publish-failed', code: 'internal_error', message: 'Boom' }], running)

  expect(publishText(failed, 'make the header blue', ctx)).toBeNull()
  expect(run(['Try again'], failed).publish?.stage).toBe('running')
})
