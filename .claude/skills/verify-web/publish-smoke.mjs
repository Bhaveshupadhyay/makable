// Publishing, end to end in the browser: the real SPA against a scripted makable-backend (see fake-backend.mjs),
// on a site the user already has. Run the dev server WITHOUT mock auth, since publishing needs a signed-in session.
// See SKILL.md. GitHub Pages (making the repo public) is covered by smoke.mjs.
import { join } from 'node:path'
import { expect, fail, fakeSites, launch, ok, REPO_URL, routeBackend, siteAnswer, watchErrors } from './fake-backend.mjs'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199'
const OUT_DIR = process.env.OUT_DIR ?? '.'
const TOKEN = 'vercel-secret-token-9z9z'

const site = fakeSites()
const backend = {
  publishes: [], // publish request bodies
  deploys: [],
  publishAnswers: [], // scripted answers for POST /publish, in order
  deployAnswers: [],
  statusAnswers: [], // scripted runs for GET /status; the last one repeats
  statusSince: [], // the `since` each status check sent
}
const result = (over) => ({
  target: 'vercel',
  repoFullName: 'octocat/crumb-bakery',
  repoUrl: REPO_URL,
  branch: 'main',
  commitSha: site.commit,
  changed: true,
  deploy: 'started',
  deployStartedAt: '2026-10-11T13:45:07Z',
  siteUrl: 'https://octocat-crumb-bakery.vercel.app',
  projectName: 'octocat-crumb-bakery',
  missingSecrets: [],
  secretsUrl: `${REPO_URL}/settings/secrets/actions`,
  actionsUrl: `${REPO_URL}/actions/workflows/makable-deploy.yml`,
  ...over,
})
const runOf = (status, conclusion) => ({ status, conclusion, headSha: site.commit, htmlUrl: `${REPO_URL}/actions/runs/1`, createdAt: new Date().toISOString() })

function answer(method, path, body, query) {
  const known = siteAnswer(site, method, path, body)
  if (known) return known
  if (method === 'POST' && path === `/publish/${site.projectId}`) {
    backend.publishes.push(body)
    const scripted = backend.publishAnswers.shift()
    if (!scripted) return fail(500, 'internal_error', 'unscripted publish')
    // A publish that set up the deploy commits it: the SPA builds on the answer's commit.
    if (scripted.body.success && scripted.body.data.changed) {
      scripted.body.data.commitSha = site.commitChanges({ '.github/workflows/makable-deploy.yml': `name: deploy ${backend.publishes.length}\n` })
    } else if (scripted.body.success) {
      scripted.body.data.commitSha = site.commit
    }
    return scripted
  }
  if (method === 'POST' && path === `/publish/${site.projectId}/deploy`) {
    backend.deploys.push(body)
    return backend.deployAnswers.shift() ?? fail(500, 'internal_error', 'unscripted deploy')
  }
  if (method === 'GET' && path === `/publish/${site.projectId}/status`) {
    backend.statusSince.push(query.get('since'))
    const run = backend.statusAnswers.length > 1 ? backend.statusAnswers.shift() : backend.statusAnswers[0]
    return ok({ target: 'vercel', siteUrl: null, run: run ?? null })
  }
  return null
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
// Analytics must never carry a token or key. Mixpanel's requests are answered here (start the dev server with
// VITE_ANALYTICS_DEBUG=true, and optionally a dummy VITE_MIXPANEL_TOKEN with VITE_MIXPANEL_LOCAL=true, to check them).
const analyticsSeen = []
const analyticsNames = new Set()
// The console logger passes the event's properties as a separate argument, so read the arguments, not just the text.
const consoleReads = []
page.on('console', (m) => {
  if (!m.text().startsWith('%c[analytics]')) return
  consoleReads.push(
    Promise.all(m.args().map((arg) => arg.jsonValue().catch(() => null))).then((args) => {
      analyticsNames.add(args[2])
      analyticsSeen.push(JSON.stringify(args))
    }),
  )
})
await page.route(/mixpanel\.com/, (route) => {
  // Mixpanel sends `data` as JSON or base64 depending on the host: keep both readings.
  const body = route.request().postData() ?? ''
  const data = new URLSearchParams(body).get('data') ?? ''
  let decoded = data
  try {
    JSON.parse(data)
  } catch {
    decoded = Buffer.from(data, 'base64').toString('utf8')
  }
  analyticsSeen.push(body, data, decoded)
  return route.fulfill({ status: 200, body: '1' })
})
let analyticsChecked = false
process.on('beforeExit', async () => {
  if (analyticsChecked) return
  analyticsChecked = true
  await Promise.all(consoleReads)
  const all = analyticsSeen.join('\n')
  const leaked = [TOKEN].filter((s) => all.includes(s))
  console.log('analytics events:', [...analyticsNames].join(', '))
  console.log(leaked.length ? `✗ SECRET LEAKED to analytics: ${leaked}` : '✓ analytics: no token/key in any event')
  if (leaked.length) process.exitCode = 1
})
const errors = watchErrors(page)
await routeBackend(page, answer)

const shot = (name) => page.screenshot({ path: join(OUT_DIR, name) })
const composer = page.getByRole('textbox', { name: 'Message' })
const say = async (text) => {
  await composer.fill(text)
  await composer.press('Enter')
}
const assistantSays = (text, timeout = 30000) => page.getByText(text).last().waitFor({ timeout })
const reply = (name) => page.getByRole('button', { name, exact: true }).last().click()

try {
  // The user's site opens by itself (their newest).
  await page.goto(BASE_URL)
  await page.frameLocator('iframe[title="Site preview"]').getByRole('heading', { name: 'Crumb Bakery' }).waitFor({ timeout: 90_000 })
  const publish = page.getByRole('button', { name: 'Publish', exact: true }).first()

  // 1. Vercel with a token pasted in the chat.
  const before = site.commit
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
  await assistantSays('Publishing to Vercel!')
  const [sent] = backend.publishes
  expect(sent.target === 'vercel' && sent.credentials?.token === TOKEN, `publish body: ${JSON.stringify(sent)}`)
  expect(sent.baseCommit === before, `publish must send the site's commit (${sent.baseCommit} vs ${before})`)
  await page.locator('a[href="https://octocat-crumb-bakery.vercel.app"]').first().waitFor()
  console.log("✓ publish: published on the site's commit with the pasted token; links are clickable")

  await assistantSays('Your site is live at https://octocat-crumb-bakery.vercel.app', 30000)
  await shot('publish-live.png')
  expect(backend.statusSince.every((since) => since === '2026-10-11T13:45:07Z'), `status checks must follow the deploy's start: ${backend.statusSince}`)
  console.log('✓ publish: the deploy is followed (by its start time) until it is live')

  const stored = await page.evaluate(() => JSON.stringify(localStorage))
  expect(!stored.includes(TOKEN), 'the token must not be stored in the browser')
  expect(!(await page.getByText(TOKEN).count()), 'the token must not be shown in the chat')
  console.log('✓ publish: the token is not in the chat or localStorage')

  // 2. Publishing again goes straight to Vercel, on the commit the last publish made; with nothing new, it still
  // deploys (only Publish deploys; pushes don't).
  backend.publishAnswers.push(ok(result({ changed: false, deployStartedAt: '2026-10-11T14:00:00Z' })))
  const live = 'Your site is live at https://octocat-crumb-bakery.vercel.app'
  const liveBefore = await page.getByText(live).count()
  await publish.click()
  await assistantSays('Publishing your changes to Vercel')
  await page.getByText(live).nth(liveBefore).waitFor({ timeout: 30000 })
  const again = backend.publishes[1]
  expect(!again.credentials && again.target === 'vercel', `republish body: ${JSON.stringify(again)}`)
  expect(again.baseCommit === site.commit, `republish must build on the first publish's commit: ${again.baseCommit} vs ${site.commit}`)
  expect(backend.statusSince.at(-1) === '2026-10-11T14:00:00Z', `the redeploy must be followed by its own start: ${backend.statusSince.at(-1)}`)
  console.log('✓ publish: republish goes to the same platform, builds on the last commit, and deploys even with nothing new')

  // 3. Another platform, with the secret added on GitHub by the user.
  backend.publishAnswers.push(
    ok(result({ target: 'netlify', deploy: 'waiting_for_secrets', deployStartedAt: null, missingSecrets: ['NETLIFY_AUTH_TOKEN'], siteUrl: 'https://octocat-crumb-bakery.netlify.app' })),
  )
  backend.deployAnswers.push(
    fail(409, 'publish_secrets_missing', 'Add the deploy secrets first.', { missing: ['NETLIFY_AUTH_TOKEN'], secretsUrl: `${REPO_URL}/settings/secrets/actions` }),
    ok({ repoUrl: REPO_URL, actionsUrl: `${REPO_URL}/actions/workflows/makable-deploy.yml`, startedAt: '2026-10-11T14:05:00Z' }),
  )
  backend.statusAnswers.length = 0
  backend.statusAnswers.push(runOf('completed', 'failure'))
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
  expect(!backend.deploys.at(-1).credentials, `deploy body: ${JSON.stringify(backend.deploys.at(-1))}`)
  await page.waitForTimeout(6000)
  expect(backend.statusSince.at(-1) === '2026-10-11T14:05:00Z', `a re-run must be followed by its start: ${backend.statusSince.at(-1)}`)
  await assistantSays("The deploy didn't finish (failure)", 30000)
  await shot('publish-failed.png')
  console.log('✓ publish: secrets added on GitHub, deploy refused until they are there, a failed deploy links its log')

  // 4. The site changed somewhere else: publishing says so instead of overwriting.
  backend.publishAnswers.push(fail(409, 'site_conflict', 'Changed elsewhere', { commitSha: site.commit }))
  await reply('Cancel')
  await say('publish somewhere else')
  await assistantSays('Where should I publish your site?')
  await reply('Vercel')
  await reply("I'll add it on GitHub")
  await assistantSays('Choose which version to keep')
  console.log('✓ publish: a site changed elsewhere is a conflict, not an overwrite')
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
