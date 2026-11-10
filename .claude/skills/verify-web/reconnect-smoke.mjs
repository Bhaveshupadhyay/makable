// GitHub reconnects, end to end in the browser: makable's GitHub token stops working (the backend answers 401
// `github_reconnect`) and the SPA signs in again by itself, back to the same page, then carries on. The real SPA
// against a scripted makable-backend (see fake-backend.mjs); signing in is a page that goes straight back, as GitHub
// does for an app the user has already allowed. Run the dev server WITHOUT mock auth. See SKILL.md.
import { join } from 'node:path'
import { clickInPreview, expect, fail, fakeSites, launch, ndjson, ok, REPO_URL, routeBackend, siteAnswer, watchErrors } from './fake-backend.mjs'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199'
const OUT_DIR = process.env.OUT_DIR ?? '.'
const LOST = () => fail(401, 'github_reconnect', 'Your GitHub connection has expired. Connect GitHub again.')
const GUARD = 'makable:github-reconnect'
const PROMPT = 'A website for my bakery'
const NAME_QUESTION = { kind: 'project_name', question: 'What should we call your site?', options: ['Crumb Bakery'], allowFreeText: true }

const site = fakeSites()
const seen = { logins: [], refreshes: 0, edits: 0, publishes: [], creates: [] }
// How many of the next requests of each kind GitHub refuses.
const refuse = { load: 0, save: 0, edit: 0, publish: 0, create: 0 }
const refused = (kind) => refuse[kind] > 0 && refuse[kind]-- > 0

function answer(method, path, body) {
  if (path === '/auth/refresh') {
    seen.refreshes += 1
    return { status: 204 }
  }
  if (method === 'GET' && path === `/sites/${site.projectId}` && refused('load')) return LOST()
  if (method === 'PUT' && path === `/sites/${site.projectId}/files` && refused('save')) return LOST()
  const known = siteAnswer(site, method, path, body)
  if (known) return known
  if (method === 'POST' && path === '/ai/edit') {
    seen.edits += 1
    return refused('edit') ? LOST() : ok({ status: 'escalated', runId: '00000000-0000-4000-8000-000000000001', reason: 'Not this time.' })
  }
  if (method === 'POST' && path === `/publish/${site.projectId}`) {
    seen.publishes.push(body)
    if (refused('publish')) return LOST()
    return ok({
      target: 'vercel',
      repoFullName: 'octocat/crumb-bakery',
      repoUrl: REPO_URL,
      branch: 'main',
      commitSha: site.commit,
      changed: false,
      deploy: 'waiting_for_secrets',
      deployStartedAt: null,
      siteUrl: 'https://octocat-crumb-bakery.vercel.app',
      projectName: 'octocat-crumb-bakery',
      missingSecrets: ['VERCEL_TOKEN'],
      secretsUrl: `${REPO_URL}/settings/secrets/actions`,
      actionsUrl: `${REPO_URL}/actions/workflows/makable-deploy.yml`,
    })
  }
  if (method === 'POST' && path === '/ai/create') {
    seen.creates.push(body)
    site.projectId = body.projectId
    // A creation finds out while it streams: making the repo is where GitHub refuses.
    if (refused('create')) {
      return ndjson([
        { type: 'progress', stage: 'setup', message: 'Making your repo' },
        { type: 'error', error: { code: 'github_reconnect', message: 'Your GitHub connection has expired. Connect GitHub again.', details: null } },
      ])
    }
    const runId = '00000000-0000-4000-8000-000000000002'
    site.thread = { projectId: body.projectId, status: 'needs_input', turns: [], run: { runId, mode: 'create', instruction: body.prompt, target: null, question: NAME_QUESTION, steps: [] } }
    return ndjson([{ type: 'result', data: { status: 'needs_input', runId, question: NAME_QUESTION } }])
  }
  return null
}

const browser = await launch()
const errors = []
let page
let analyticsSeen = []

/** A tab on the scripted backend, where signing in goes straight back to `returnTo`. */
async function openTab() {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  errors.push(watchErrors(tab))
  // The event's name is in the message's text, read at once: its properties may be gone with the page that's leaving.
  tab.on('console', (m) => m.text().startsWith('%c[analytics]') && analyticsSeen.push(m.text()))
  await routeBackend(tab, answer)
  // Registered last, so it answers before the backend's routes.
  await tab.route('**/api/v1/auth/github/login**', (route) => {
    const returnTo = new URL(route.request().url()).searchParams.get('returnTo')
    seen.logins.push(returnTo)
    // No Content cancels the navigation: the page that left stays, as a back/forward cache restore brings it back.
    if (leaveUnfinished) return route.fulfill({ status: 204 })
    return route.fulfill({ status: 200, contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(returnTo)})</script>` })
  })
  return tab
}
let leaveUnfinished = false

const shot = (name) => page.screenshot({ path: join(OUT_DIR, name) })
const frame = () => page.frameLocator('iframe[title="Site preview"]')
const siteShown = (text = 'Crumb Bakery') => frame().getByText(text).first().waitFor({ timeout: 90_000 })
const chatSays = (text, timeout = 30_000) => page.getByText(text).last().waitFor({ timeout })
const until = async (check, what, timeout = 30_000) => {
  const end = Date.now() + timeout
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await page.waitForTimeout(100)
  }
}
/** Lets the next refusal reconnect again, as if the last reconnect was long ago. */
const forgetLastReconnect = () => page.evaluate((key) => sessionStorage.removeItem(key), GUARD)
const saveNow = async () => {
  await page.getByRole('button', { name: /^Saving to GitHub/ }).click()
  await page.getByRole('menuitem', { name: 'Save now' }).click()
  await page.keyboard.press('Escape')
}

try {
  page = await openTab()

  // 1. Opening a site whose GitHub token stopped working: the browser signs in again and the site opens.
  refuse.load = 1
  await page.goto(BASE_URL)
  await siteShown()
  expect(seen.logins.length === 1 && seen.logins[0] === '/', `one sign-in, back to the same page: ${JSON.stringify(seen.logins)}`)
  expect(seen.refreshes === 0, `a GitHub refusal must not refresh the session (${seen.refreshes} refreshes)`)
  expect(analyticsSeen.length === 0 || analyticsSeen.some((t) => t.includes('github_reconnect_needed')), 'analytics: github_reconnect_needed')
  console.log('✓ load: a refused GitHub token signs in again by itself, back to the site, without a session refresh')

  // 2. Refused again right after: no loop. The user gets Connect GitHub again, which works.
  refuse.load = 1
  await page.reload()
  const connect = page.getByRole('button', { name: 'Connect GitHub again' })
  await connect.waitFor({ timeout: 30_000 })
  await page.getByText('Your GitHub connection has expired. Connect GitHub again.').first().waitFor()
  expect(seen.logins.length === 1, `no second automatic sign-in right after the first: ${JSON.stringify(seen.logins)}`)
  await shot('reconnect-manual.png')
  await connect.click()
  await siteShown()
  expect(seen.logins.length === 2, `Connect GitHub again signs in: ${JSON.stringify(seen.logins)}`)
  console.log('✓ load: refused again right after, it asks instead of looping, and Connect GitHub again works')

  // 2b. Back from GitHub's page instead of signing in: the browser can bring the page back from its back/forward cache,
  // mid-reconnect. Playwright turns that cache off, so the sign-in is cancelled (the page that left stays) and the page
  // gets the `pageshow` a restore fires. It loads afresh and offers Connect GitHub again, since the reconnect just went.
  // Playwright's own calls wait for the cancelled navigation to finish, so these go through the DevTools protocol.
  await forgetLastReconnect()
  leaveUnfinished = true
  refuse.load = 2
  await page.reload()
  await until(() => seen.logins.length === 3, 'the sign-in after the refused load')
  leaveUnfinished = false
  const cdp = await page.context().newCDPSession(page)
  const run = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result.value
  expect(await run("document.body.innerText.includes('Connecting to GitHub again')"), 'the page that left is mid-reconnect')
  await run("window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))")
  await page.getByRole('button', { name: 'Connect GitHub again' }).waitFor({ timeout: 30_000 })
  expect(refuse.load === 0 && seen.logins.length === 3, `loaded afresh, without another sign-in: ${refuse.load} refusals left, ${seen.logins.length} sign-ins`)
  await page.getByRole('button', { name: 'Connect GitHub again' }).click()
  await siteShown()
  console.log('✓ load: back from GitHub instead of signing in, the page loads afresh and offers Connect GitHub again')

  // 3. Saving edits: the save is refused, the browser signs in again, and the edits come back with it and are saved.
  await forgetLastReconnect()
  await page.getByRole('button', { name: 'Edit text' }).click()
  await clickInPreview(page, frame().getByText('Fresh bread every morning'))
  const editor = frame().getByRole('textbox', { name: 'Edit text' })
  await editor.fill('Warm bread all day')
  await editor.press('Enter')
  await frame().getByText('Warm bread all day').waitFor({ timeout: 30_000 })
  refuse.save = 1
  const savesBefore = site.saves.length
  let logins = seen.logins.length
  await saveNow()
  await until(() => seen.logins.length === logins + 1, 'the sign-in after the refused save')
  await siteShown('Warm bread all day')
  await saveNow()
  await until(() => site.saves.length > savesBefore, 'the save after coming back')
  const saved = site.saves.at(-1)
  expect(saved.files['src/App.tsx']?.includes('Warm bread all day'), `the edit must be saved after the reconnect: ${JSON.stringify(saved)}`)
  console.log('✓ save: a refused save signs in again; the edits are kept across it and saved after')

  // 4. An AI request: the chat keeps it and says to send it again; it isn't sent twice.
  await forgetLastReconnect()
  refuse.edit = 1
  const composer = page.getByRole('textbox', { name: 'Message' })
  await composer.fill('Make the heading blue')
  logins = seen.logins.length
  await composer.press('Enter')
  await until(() => seen.logins.length === logins + 1, 'the sign-in after the refused AI request')
  await siteShown()
  await chatSays('Send your request again once you’re back.')
  await chatSays('Make the heading blue')
  expect(seen.edits === 1, `the AI request must go once (${seen.edits})`)
  expect(seen.refreshes === 0, `no session refresh (${seen.refreshes})`)
  await shot('reconnect-ai.png')
  console.log('✓ AI: a refused request signs in again; the chat keeps it and says to send it again')

  // 5. Publishing: refused, the browser signs in again, and the publish carries on by itself once the site is loaded.
  await forgetLastReconnect()
  refuse.publish = 1
  await page.getByRole('button', { name: 'Publish', exact: true }).first().click()
  await chatSays('Where should I publish your site?')
  await page.getByRole('button', { name: 'Vercel', exact: true }).last().click()
  logins = seen.logins.length
  await page.getByRole('button', { name: "I'll add it on GitHub", exact: true }).last().click()
  await until(() => seen.logins.length === logins + 1, 'the sign-in after the refused publish')
  await until(() => seen.publishes.length === 2, 'the publish going again once back', 90_000)
  await chatSays("Your site's deploy is set up in")
  expect(seen.publishes[1].baseCommit === site.commit, `the resumed publish builds on the site's commit: ${seen.publishes[1].baseCommit}`)
  await chatSays('I’ll carry on once you’re back.')
  await shot('reconnect-publish.png')
  console.log('✓ publish: a refused publish signs in again and carries on by itself, on the loaded site')

  // 5b. Still refused once back (the site doesn't load): the waiting publish asks to connect GitHub again, instead of
  // a vague "couldn't save" error.
  await forgetLastReconnect()
  refuse.publish = 1
  refuse.load = 1
  logins = seen.logins.length
  await page.getByRole('button', { name: 'Publish', exact: true }).first().click()
  await until(() => seen.logins.length === logins + 1, 'the sign-in after the refused publish')
  await chatSays('Connect GitHub again, then try again.')
  expect(seen.publishes.length === 3 && seen.logins.length === logins + 1, `the publish waits for the reconnect: ${seen.publishes.length} publishes, ${seen.logins.length - logins} sign-ins`)
  await page.getByRole('button', { name: 'Connect GitHub again' }).first().click()
  await siteShown()
  console.log('✓ publish: refused again once back, it asks to connect GitHub again')

  // 6. A creation, in a new tab with no sites: refused while it builds, the browser signs in again, Try again builds it.
  site.sites = []
  site.files = null
  site.commit = null
  site.thread = { projectId: site.projectId, status: 'idle', turns: [], run: null }
  await page.close()
  page = await openTab()
  refuse.create = 1
  await page.goto(BASE_URL)
  await page.getByPlaceholder('Describe the site you want to build…').fill(PROMPT)
  logins = seen.logins.length
  await page.getByPlaceholder('Describe the site you want to build…').press('Enter')
  await until(() => seen.logins.length === logins + 1, 'the sign-in after the refused creation')
  await chatSays('Try again once you’re back.')
  await page.waitForTimeout(1_000)
  expect(seen.creates.length === 1, `coming back must not build it again by itself (${seen.creates.length} creations)`)
  await shot('reconnect-create.png')
  await page.getByRole('button', { name: 'Try again', exact: true }).last().click()
  await chatSays(NAME_QUESTION.question)
  expect(seen.creates.length === 2 && seen.creates[1].prompt === PROMPT, `Try again builds the same prompt: ${JSON.stringify(seen.creates)}`)
  console.log('✓ create: a refused creation signs in again; Try again builds the same prompt')
} catch (err) {
  console.error('✗', err.message)
  await shot('reconnect-failure.png').catch(() => {})
  process.exitCode = 1
} finally {
  const all = errors.flat()
  if (all.length) {
    console.error('page errors:', all)
    process.exitCode = 1
  }
  await browser.close()
}
