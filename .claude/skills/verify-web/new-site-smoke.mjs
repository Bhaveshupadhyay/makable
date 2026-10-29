// The new site page (`/new`), end to end in the browser: the real SPA against a scripted makable-backend (see
// fake-backend.mjs). The site menu's New site opens it and going back returns to the open site untouched; a prompt
// sent there saves the open site's unsaved edits first (a conflict keeps the prompt and says why, and it's still there
// after going to the site and back), then the builder starts the new site; a guest is asked to sign in (a description
// that's too long is refused first); a prompt back from sign-in with unsaved edits waits on /new. Run the dev server
// WITHOUT mock auth. See SKILL.md.
import { join } from 'node:path'
import { expect, fakeSites, launch, ndjson, PROJECT_ID, routeBackend, sha, siteAnswer, SITE_FILES, siteRead, watchErrors } from './fake-backend.mjs'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199'
const OUT_DIR = process.env.OUT_DIR ?? '.'
const PROMPT = 'A portfolio for my pottery studio'
const NAME_QUESTION = { question: 'What should the site be called?', options: ['Clay Studio'], allowFreeText: true, kind: 'project_name' }
const EDITED = SITE_FILES['src/App.tsx'].replace('Crumb', 'Crumb & Co')

const site = fakeSites()
const creates = []
function answer(method, path, body) {
  if (method === 'POST' && path === '/ai/create') {
    creates.push(body)
    site.thread = { projectId: body.projectId, status: 'needs_input', turns: [], run: { runId: '00000000-0000-4000-8000-000000000001', mode: 'create', instruction: body.prompt, target: null, question: NAME_QUESTION, steps: ['Thinking about your site'] } }
    site.projectId = body.projectId
    return ndjson([
      { type: 'progress', stage: 'brief', message: 'Thinking about your site' },
      { type: 'result', data: { status: 'needs_input', runId: site.thread.run.runId, question: NAME_QUESTION } },
    ])
  }
  return siteAnswer(site, method, path, body)
}

const browser = await launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
const errors = watchErrors(page)
await routeBackend(page, answer)
const shot = (name) => page.screenshot({ path: join(OUT_DIR, name) })
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('makable:site') ?? 'null')?.state)
const prompt = page.getByPlaceholder('Describe the site you want to build…')
const heading = page.getByRole('heading', { name: 'What do you want to build?' })
const until = async (check, what, timeout = 30_000) => {
  const end = Date.now() + timeout
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await page.waitForTimeout(50)
  }
}
// An unsaved edit on the open site, as a past visit leaves it (the page must not have the site store open).
const seedEdits = () =>
  page.evaluate((edited) => {
    const saved = JSON.parse(localStorage.getItem('makable:site'))
    saved.state.dirty = { 'src/App.tsx': edited }
    localStorage.setItem('makable:site', JSON.stringify(saved))
  }, EDITED)

try {
  // 1. The site menu's New site opens the page; going back returns to the open site, its unsaved edits kept.
  await page.goto(BASE_URL)
  const siteMenu = page.getByRole('button', { name: 'Crumb Bakery' })
  await siteMenu.waitFor({ timeout: 90_000 })
  await until(async () => (await stored())?.commitSha === sha(1), 'the site’s files to load')
  await page.goto(`${BASE_URL}/about`)
  await seedEdits()
  await page.goto(BASE_URL)
  await siteMenu.waitFor({ timeout: 90_000 })
  await siteMenu.click()
  await page.getByRole('menuitem', { name: 'New site' }).click()
  await heading.waitFor()
  expect(new URL(page.url()).pathname === '/new', `New site must open /new, not ${page.url()}`)
  await shot('new-site.png')
  await page.getByRole('link', { name: 'Back to Crumb Bakery' }).click()
  await siteMenu.waitFor()
  const back = await stored()
  expect(back.projectId === PROJECT_ID && back.dirty['src/App.tsx'] === EDITED, `going back must keep the open site and its edits: ${JSON.stringify(back)}`)
  console.log('✓ New site opens /new, and going back returns to the open site with its unsaved edits')

  // 2. A description that's too long stays in the box with why.
  await page.goto(`${BASE_URL}/new`)
  await prompt.fill('x'.repeat(4_001))
  await prompt.press('Enter')
  await page.getByText(/Keep the description under/).waitFor()
  expect((await prompt.inputValue()).length === 4_001, 'a refused prompt must stay in the box')
  expect(creates.length === 0, 'a refused prompt must not start a site')
  console.log('✓ a too-long description stays in the box')

  // 3. GitHub moved past the open site's edits: the save is a conflict, so the prompt waits with why.
  site.commit = sha(9)
  const savesBefore = site.saves.length
  await prompt.fill(PROMPT)
  await prompt.press('Enter')
  await page.getByText("Your edits to Crumb Bakery aren't saved yet, so the new site waits. It changed on GitHub since.").waitFor()
  const conflicted = site.saves.at(-1)
  expect(site.saves.length === savesBefore + 1 && conflicted.baseCommit === sha(1), `the edits must be saved on their commit: ${JSON.stringify(site.saves)}`)
  expect((await prompt.inputValue()) === PROMPT, 'the prompt must stay in the box while the edits wait')
  expect(creates.length === 0, 'the new site must wait for the edits')
  expect(Object.keys((await stored()).dirty).length === 1, 'the edits must be kept')
  await shot('new-site-conflict.png')
  // Going to the site to sort it out and back keeps the prompt.
  await page.getByRole('link', { name: 'Open Crumb Bakery to sort it out' }).click()
  await siteMenu.waitFor()
  await siteMenu.click()
  await page.getByRole('menuitem', { name: 'New site' }).click()
  await heading.waitFor()
  expect((await prompt.inputValue()) === PROMPT, 'the prompt must still be in the box after going to the site and back')
  console.log('✓ unsaved edits that can’t be saved keep the prompt waiting, with why, also after going to the site and back')

  // 4. Saved this time: then the builder starts the new site with the prompt, on a new id.
  site.commit = sha(1)
  await prompt.press('Enter')
  await page.getByText(NAME_QUESTION.question).waitFor({ timeout: 30_000 })
  expect(new URL(page.url()).pathname === '/', `the builder must take over, not ${page.url()}`)
  const saved = site.saves.at(-1)
  expect(saved.baseCommit === sha(1) && saved.files['src/App.tsx'] === EDITED, `the edits must be saved first: ${JSON.stringify(saved)}`)
  expect(site.files['src/App.tsx'] === EDITED, 'the old site must have the edits on GitHub')
  expect(creates.length === 1 && creates[0].prompt === PROMPT, `create body: ${JSON.stringify(creates[0])}`)
  expect(creates[0].projectId !== PROJECT_ID, 'the new site must get a new id')
  const after = await stored()
  expect(after.projectId === creates[0].projectId && after.site === null && Object.keys(after.dirty).length === 0, `store: ${JSON.stringify(after)}`)
  expect((await page.evaluate(() => sessionStorage.getItem('makable:new-site-draft'))) === null, 'the draft must be gone once sent')
  await page.getByText(PROMPT, { exact: true }).waitFor()
  await shot('new-site-created.png')
  console.log('✓ the edits are saved first, then the new site is built from the prompt')

  // 5. A guest: a description that's too long is refused before sign-in; another is asked to sign in, kept for after.
  site.signedIn = false
  await page.goto(`${BASE_URL}/new`)
  await heading.waitFor()
  expect((await page.getByRole('link', { name: 'Back', exact: true }).count()) === 1, 'a guest has nothing to go back to but the home page')
  await prompt.fill('x'.repeat(4_001))
  await prompt.press('Enter')
  await page.getByText(/Keep the description under/).waitFor()
  expect((await page.getByRole('dialog').count()) === 0, 'a refused prompt must not ask to sign in')
  await prompt.fill(PROMPT)
  await prompt.press('Enter')
  await page.getByRole('dialog').getByRole('button', { name: 'Continue with GitHub' }).waitFor()
  expect((await page.evaluate(() => sessionStorage.getItem('makable:pending-prompt'))) === PROMPT, 'the prompt must wait through sign-in')
  expect(creates.length === 1, 'a guest must not start a site')
  await shot('new-site-guest.png')
  console.log('✓ a guest: too long is refused before sign-in; otherwise they’re asked to sign in, the prompt kept for after')

  // 5b. Back from signing in to an account whose open site has unsaved edits: the prompt isn't dropped, the new
  // site's page has it, to save the edits first.
  site.projectId = PROJECT_ID
  site.thread = { projectId: PROJECT_ID, status: 'idle', turns: [], run: null }
  site.signedIn = true
  await page.evaluate(
    ({ crumb, edited, commit }) => {
      const saved = JSON.parse(localStorage.getItem('makable:site'))
      saved.state = { ...saved.state, login: 'octocat', projectId: crumb.projectId, site: crumb, commitSha: commit, dirty: { 'src/App.tsx': edited + '\n' } }
      localStorage.setItem('makable:site', JSON.stringify(saved))
    },
    { crumb: siteRead(), edited: EDITED, commit: site.commit },
  )
  await page.goto(BASE_URL)
  await heading.waitFor({ timeout: 30_000 })
  expect(new URL(page.url()).pathname === '/new', `the prompt must go to /new, not ${page.url()}`)
  expect((await prompt.inputValue()) === PROMPT, 'the prompt must be in the box')
  expect((await page.getByRole('link', { name: 'Back to Crumb Bakery' }).count()) === 1, 'the open site must be kept')
  expect(creates.length === 1, 'no site must start while the edits wait')
  console.log('✓ a prompt back from sign-in with unsaved edits goes to /new, in the box')

  // 6. A phone.
  site.signedIn = true
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE_URL}/new`)
  await heading.waitFor()
  expect((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, 'no sideways scroll on a phone')
  await shot('new-site-mobile.png')
  console.log('✓ a phone')

  expect(errors.length === 0, `page errors:\n${errors.join('\n')}`)
  console.log('\nall new-site checks passed')
} finally {
  await browser.close()
}
