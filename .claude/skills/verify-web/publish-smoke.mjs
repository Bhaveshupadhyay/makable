// Publishing, end to end in the browser: the real SPA against a scripted makable-backend (Playwright routes
// answer /api/v1). Run the dev server WITHOUT mock auth, since publishing needs a signed-in session. See SKILL.md.
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199'
const OUT_DIR = process.env.OUT_DIR ?? '.'
const cache = join(homedir(), 'Library/Caches/ms-playwright')
const shellDir = readdirSync(cache).find((d) => d.startsWith('chromium_headless_shell'))
const executablePath = join(cache, shellDir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')

const TOKEN = 'vercel-secret-token-9z9z'
const USER = { id: 'u1', login: 'octocat', name: 'The Octocat', avatarUrl: 'https://github.com/octocat.png', role: 'user' }
const REPO = 'https://github.com/octocat/portfolio'
const sha = (n) => n.toString(16).padStart(40, '0')

// --- The fake backend ---
const backend = {
  saves: [], // workspace save bodies
  stateSha: null,
  publishes: [], // publish request bodies
  deploys: [],
  publishAnswers: [], // scripted answers for POST /publish, in order
  deployAnswers: [],
  statusAnswers: [], // scripted runs for GET /status; the last one repeats
}
const ok = (data) => ({ status: 200, body: { success: true, data } })
const fail = (status, code, message, details) => ({ status, body: { success: false, error: { code, message, details } } })
const result = (over) => ({
  target: 'vercel',
  repoFullName: 'octocat/portfolio',
  repoUrl: REPO,
  branch: 'main',
  commitSha: sha(0xc0ffee),
  deploy: 'started',
  siteUrl: 'https://octocat-portfolio.vercel.app',
  projectName: 'octocat-portfolio',
  missingSecrets: [],
  secretsUrl: `${REPO}/settings/secrets/actions`,
  actionsUrl: `${REPO}/actions/workflows/makable-deploy.yml`,
  ...over,
})
const runOf = (status, conclusion, headSha = sha(0xc0ffee)) => ({
  status,
  conclusion,
  headSha,
  htmlUrl: `${REPO}/actions/runs/1`,
  createdAt: new Date().toISOString(),
})

function answer(method, path, body) {
  if (path === '/auth/session') return ok({ user: USER })
  if (path === '/workspace/sessions/latest') return fail(404, 'workspace_session_not_found', 'No saved session on GitHub yet')
  if (method === 'PUT' && path.startsWith('/workspace/sessions/')) {
    backend.saves.push(body)
    if (body.state) backend.stateSha = sha(backend.saves.length)
    return ok({ sha: backend.stateSha, repoUrl: 'https://github.com/octocat/makable-workspace' })
  }
  if (method === 'POST' && /^\/publish\/[^/]+$/.test(path)) {
    backend.publishes.push(body)
    return backend.publishAnswers.shift() ?? fail(500, 'internal_error', 'unscripted publish')
  }
  if (method === 'POST' && path.endsWith('/deploy')) {
    backend.deploys.push(body)
    return backend.deployAnswers.shift() ?? fail(500, 'internal_error', 'unscripted deploy')
  }
  if (method === 'GET' && path.includes('/status')) {
    const run = backend.statusAnswers.length > 1 ? backend.statusAnswers.shift() : backend.statusAnswers[0]
    return ok({ target: 'vercel', siteUrl: null, run: run ?? null })
  }
  return fail(404, 'not_found', `fake backend: no route for ${method} ${path}`)
}

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
// The fake backend answers some requests with errors on purpose (409s, 404s); the browser logs those.
page.on('console', (m) => m.type() === 'error' && !/status of (404|409)/.test(m.text()) && errors.push(`console: ${m.text()}`))
await page.route('**/api/v1/**', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  const body = request.postData() ? JSON.parse(request.postData()) : null
  const { status, body: json } = answer(request.method(), url.pathname.replace('/api/v1', ''), body)
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) })
})

const shot = (name) => page.screenshot({ path: join(OUT_DIR, name) })
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}

try {
  await page.goto(BASE_URL)
  await page.getByRole('button', { name: 'Account menu' }).waitFor()
  const startOver = page.getByRole('button', { name: 'Start over' })
  if (await startOver.isEnabled()) await startOver.click()
  const composer = page.getByRole('textbox', { name: 'Message' })
  const say = async (text) => {
    await composer.fill(text)
    await composer.press('Enter')
  }
  const assistantSays = (text, timeout = 30000) => page.getByText(text).last().waitFor({ timeout })
  const reply = (name) => page.getByRole('button', { name, exact: true }).last().click()

  await page.getByRole('button', { name: 'I want a portfolio' }).click()
  await page.getByRole('button', { name: 'Terminal template' }).last().click()
  const publish = page.getByRole('button', { name: 'Publish', exact: true }).first()
  await publish.waitFor()
  console.log('✓ publish: the button appears once a template is picked')

  // 1. Vercel with a token pasted in the chat.
  backend.publishAnswers.push(ok(result()))
  backend.statusAnswers.push(runOf('in_progress', null), runOf('completed', 'success'))
  await publish.click()
  await assistantSays('Where should I publish your site?')
  await reply('Vercel')
  await assistantSays('VERCEL_TOKEN')
  await reply('Paste it here')
  const tokenBox = page.getByLabel('Vercel token')
  await tokenBox.fill(TOKEN)
  await shot('publish-token.png')
  await page.getByRole('button', { name: 'Use token' }).click()
  await assistantSays('Token ending in 9z9z')
  await assistantSays('Published to Vercel!')
  const [sent] = backend.publishes
  expect(sent.target === 'vercel' && sent.credentials?.token === TOKEN, `publish body: ${JSON.stringify(sent)}`)
  expect(sent.stateSha && sent.stateSha === backend.stateSha, `publish must send the saved state's SHA (${sent.stateSha} vs ${backend.stateSha})`)
  expect(backend.saves.length > 0, 'the session must be saved before publishing')
  await page.locator('a[href="https://octocat-portfolio.vercel.app"]').first().waitFor()
  console.log('✓ publish: saved first, then published with the saved SHA and the pasted token; links are clickable')

  await assistantSays('Your site is live at https://octocat-portfolio.vercel.app', 30000)
  await shot('publish-live.png')
  console.log('✓ publish: the deploy is followed until it is live')

  const stored = await page.evaluate(() => localStorage.getItem('makable:builder') ?? '')
  expect(!stored.includes(TOKEN), 'the token must not be stored in the browser')
  expect(!JSON.stringify(backend.saves).includes(TOKEN), 'the token must not be saved to the workspace')
  expect(!(await page.getByText(TOKEN).count()), 'the token must not be shown in the chat')
  console.log('✓ publish: the token is not in the chat, localStorage or the workspace saves')

  // 2. Publishing again: straight to Vercel; a change on GitHub needs the user's OK.
  backend.publishAnswers.push(
    fail(409, 'publish_changed_on_github', 'Changed on GitHub', { headSha: sha(0xbeef), paths: ['src/App.tsx'] }),
    ok(result({ deploy: 'unchanged' })),
  )
  await publish.click()
  await assistantSays('Publishing your changes to Vercel')
  await assistantSays('src/App.tsx')
  await reply('Overwrite')
  await assistantSays('Nothing changed since your last publish')
  const [, first, overwrite] = backend.publishes
  expect(!first.credentials && first.target === 'vercel', `republish body: ${JSON.stringify(first)}`)
  expect(overwrite.confirmOverwrite === sha(0xbeef), `overwrite body: ${JSON.stringify(overwrite)}`)
  console.log('✓ publish: republish goes to the same platform; a change on GitHub asks before overwriting')

  // 3. Another platform, with the secret added on GitHub by the user.
  backend.publishAnswers.push(ok(result({ target: 'netlify', deploy: 'waiting_for_secrets', missingSecrets: ['NETLIFY_AUTH_TOKEN'], siteUrl: 'https://octocat-portfolio.netlify.app' })))
  backend.deployAnswers.push(
    fail(409, 'publish_secrets_missing', 'Add the deploy secrets first.', { missing: ['NETLIFY_AUTH_TOKEN'], secretsUrl: `${REPO}/settings/secrets/actions` }),
    ok({ repoUrl: REPO, actionsUrl: `${REPO}/actions/workflows/makable-deploy.yml` }),
  )
  backend.statusAnswers.length = 0
  backend.statusAnswers.push(runOf('completed', 'failure', sha(1)))
  await say('publish somewhere else')
  await assistantSays('Where should I publish your site?')
  await reply('Netlify')
  await reply("I'll add it on GitHub")
  await assistantSays('NETLIFY_AUTH_TOKEN')
  expect(!backend.publishes.at(-1).credentials, 'no token when the user adds it on GitHub')
  await reply('Deploy now')
  await assistantSays("The repo doesn't have NETLIFY_AUTH_TOKEN yet")
  await reply('Deploy now')
  await assistantSays('Deploying now')
  expect(backend.deploys.at(-1).repoName === 'portfolio', `deploy body: ${JSON.stringify(backend.deploys.at(-1))}`)
  await assistantSays("The deploy didn't finish (failure)", 30000)
  await shot('publish-failed.png')
  console.log('✓ publish: secrets added on GitHub, deploy refused until they are there, a failed deploy links its log')
} catch (err) {
  console.error('✗', err.message)
  await shot('publish-failure.png').catch(() => {})
  process.exitCode = 1
} finally {
  if (errors.length) {
    console.error('page errors:', errors)
    process.exitCode = 1
  }
  await browser.close()
}
