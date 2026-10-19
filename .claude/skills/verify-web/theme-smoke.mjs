// Light and dark mode, end to end in the browser: the real SPA against a scripted makable-backend (see
// fake-backend.mjs). The theme follows the system until the user picks one, is set before the first paint, survives a
// reload, reaches other tabs and follows the system's setting live; the code view's editor switches with it. Run the
// dev server WITHOUT mock auth. See SKILL.md.
import { join } from 'node:path'
import { expect, fakeSites, launch, ok, routeBackend, siteAnswer, watchErrors } from './fake-backend.mjs'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199'
const OUT_DIR = process.env.OUT_DIR ?? '.'

const site = fakeSites()
const PROVIDERS = [{ id: 'openai', name: 'OpenAI', keysUrl: 'https://platform.openai.com/api-keys' }]
const answer = (method, path, body) => (path === '/ai/providers' ? ok(PROVIDERS) : siteAnswer(site, method, path, body))

const browser = await launch()
// The system is dark.
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' })
const page = await context.newPage()
const errors = watchErrors(page)
await routeBackend(page, answer)
const shot = (name, on = page) => on.screenshot({ path: join(OUT_DIR, name) })
const isDark = (on = page) => on.evaluate(() => document.documentElement.classList.contains('dark'))
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('makable:theme') ?? 'null')?.state?.choice ?? null)
const background = (selector, on = page) => on.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor)
const until = async (check, what, timeout = 10_000) => {
  const end = Date.now() + timeout
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await page.waitForTimeout(50)
  }
}
async function pick(label, on = page) {
  await on.getByRole('button', { name: 'Theme' }).click()
  await on.getByRole('menuitemradio', { name: label }).click()
}
const WHITE = 'rgb(255, 255, 255)'
// The theme's colours are oklch (index.css), the code view's are hex.
const LIGHT_PAGE = ['oklch(1 0 0)', WHITE]

try {
  // 1. A guest with nothing chosen gets the system's theme.
  site.signedIn = false
  await page.goto(BASE_URL)
  await page.getByPlaceholder('Describe the site you want to build…').waitFor()
  expect(await isDark(), 'with no choice, a dark system must give the dark theme')
  expect(!LIGHT_PAGE.includes(await background('body')), 'the dark theme must draw a dark page')
  expect((await page.evaluate(() => document.documentElement.style.colorScheme)) === 'dark', 'form controls and scrollbars must be dark too')
  await shot('theme-landing-dark.png')
  await page.getByRole('button', { name: 'Theme' }).click()
  const system = page.getByRole('menuitemradio', { name: 'System' })
  expect((await system.getAttribute('aria-checked')) === 'true', 'System must be the default choice')
  await shot('theme-menu.png')
  await page.keyboard.press('Escape')
  await page.getByPlaceholder('Describe the site you want to build…').fill('A site for my bakery')
  await page.getByPlaceholder('Describe the site you want to build…').press('Enter')
  await page.getByRole('dialog').getByRole('button', { name: 'Continue with GitHub' }).waitFor()
  await shot('theme-sign-in-dark.png')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await page.evaluate(() => sessionStorage.removeItem('makable:pending-prompt'))
  console.log('✓ no choice: the system’s dark theme (page, controls); System is checked')

  // 2. Light, picked: on screen, remembered, and kept over a reload.
  await pick('Light')
  expect(!(await isDark()), 'Light must take the dark theme off')
  expect(LIGHT_PAGE.includes(await background('body')), `the light theme must draw a white page (${await background('body')})`)
  expect((await stored()) === 'light', `the choice must be saved (${await stored()})`)
  await shot('theme-landing-light.png')
  await page.reload()
  await page.getByPlaceholder('Describe the site you want to build…').waitFor()
  expect(!(await isDark()), 'Light must survive a reload on a dark system')
  console.log('✓ Light: on screen, saved, and kept over a reload')

  // 3. Before the first paint: with the app's script blocked, index.html still sets the saved theme.
  errors.expected = true // the blocked script's failed request
  await page.route('**/src/main.tsx*', (route) => route.abort())
  await page.evaluate(() => localStorage.setItem('makable:theme', JSON.stringify({ state: { choice: 'dark' }, version: 1 })))
  await page.reload()
  expect(await isDark(), 'a saved Dark must be set before the app runs')
  await page.evaluate(() => localStorage.setItem('makable:theme', JSON.stringify({ state: { choice: 'light' }, version: 1 })))
  await page.reload()
  expect(!(await isDark()), 'a saved Light must be set before the app runs (on a dark system)')
  await page.evaluate(() => localStorage.setItem('makable:theme', 'not json'))
  await page.reload()
  expect(await isDark(), 'a broken saved value must fall back to the system')
  await page.unroute('**/src/main.tsx*')
  errors.expected = false
  await page.evaluate(() => localStorage.removeItem('makable:theme'))
  console.log('✓ first paint: index.html sets the saved theme before the app loads (and falls back to the system)')

  // 4. System: follows the system's setting as it changes.
  await page.reload()
  await page.getByPlaceholder('Describe the site you want to build…').waitFor()
  await pick('System')
  await page.emulateMedia({ colorScheme: 'light' })
  await until(async () => !(await isDark()), 'System to follow a light system')
  await page.emulateMedia({ colorScheme: 'dark' })
  await until(isDark, 'System to follow a dark system')
  // A system change is read, never written: it must not put this tab's choice over a newer one another tab saved.
  const newer = JSON.stringify({ state: { choice: 'light' }, version: 1 })
  await page.evaluate((value) => localStorage.setItem('makable:theme', value), newer)
  await page.emulateMedia({ colorScheme: 'light' })
  await until(async () => !(await isDark()), 'System to follow a light system again')
  const after = await page.evaluate(() => localStorage.getItem('makable:theme'))
  expect(after === newer, `a system change must not write the choice (${after})`)
  await page.emulateMedia({ colorScheme: 'dark' })
  await pick('Light')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(200)
  expect(!(await isDark()), 'an explicit Light must ignore the system changing')
  console.log('✓ System follows the system live (without writing the choice); an explicit choice ignores it')

  // A choice that can't be saved (storage full or blocked) still applies, without an error.
  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
  })
  await pick('Dark')
  expect(await isDark(), 'Dark must apply even when it cannot be saved')
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__setItem
  })
  await pick('Light')
  console.log('✓ a choice that can’t be saved still applies, with no error')

  // 5. Another tab follows.
  site.signedIn = true
  const other = await context.newPage()
  const otherErrors = watchErrors(other)
  await routeBackend(other, answer)
  await other.goto(`${BASE_URL}/about`)
  await other.getByRole('heading').first().waitFor()
  expect(!(await isDark(other)), 'a new tab must open with the saved Light')
  // Picked in the first tab: the other one only learns it from the storage event.
  await pick('Dark', page)
  await until(() => isDark(other), 'the other tab to turn dark')
  await other.waitForTimeout(300)
  await shot('theme-about-dark.png', other)
  await other.close()
  errors.push(...otherErrors)
  console.log('✓ another tab follows the choice')

  // 6. Signed in, the workspace and the code view: Monaco and the IDE chrome switch with the theme.
  const heading = page.frameLocator('iframe[title="Site preview"]').getByRole('heading', { name: 'Crumb Bakery' })
  await page.goto(BASE_URL)
  await heading.waitFor({ timeout: 90_000 })
  expect(await isDark(), 'Dark must hold signed in')
  const frameScheme = await page.locator('iframe[title="Site preview"]').evaluate((el) => getComputedStyle(el).colorScheme)
  expect(frameScheme === 'normal', `the preview must not take the app's colour scheme (${frameScheme})`)
  await page.waitForTimeout(1_000)
  await shot('theme-workspace-dark.png')
  await page.getByRole('radio', { name: 'Code' }).click()
  await page.getByText('Editing', { exact: true }).waitFor({ timeout: 60_000 })
  await page.locator('.monaco-editor.vs-dark').first().waitFor({ timeout: 60_000 })
  expect((await background('.mk-code')) === 'rgb(30, 30, 30)', `the code view must be dark (${await background('.mk-code')})`)
  await page.locator('.monaco-editor .line-numbers').first().waitFor()
  await page.waitForTimeout(500)
  await shot('theme-code-dark.png')
  await pick('Light')
  await until(async () => (await page.locator('.monaco-editor.vs-dark').count()) === 0, 'Monaco to switch to its light theme')
  expect((await page.locator('.monaco-editor.vs').count()) > 0, 'Monaco must use its light theme')
  expect((await background('.mk-code')) === WHITE, `the code view must be light (${await background('.mk-code')})`)
  await page.waitForTimeout(300)
  await shot('theme-code-light.png')
  await page.getByRole('radio', { name: 'Preview' }).click()
  await heading.waitFor({ timeout: 60_000 })
  await page.waitForTimeout(500)
  await shot('theme-workspace-light.png')
  console.log('✓ workspace and code view: Monaco and the editor chrome follow the theme')

  // 7. Settings in dark.
  await pick('Dark')
  await page.goto(`${BASE_URL}/settings`)
  await page.getByRole('heading', { name: 'AI models' }).waitFor()
  await page.getByText('No keys yet').waitFor()
  await shot('theme-settings-dark.png')
  console.log('✓ settings in dark')

  // 8. A phone: the theme button fits the header, nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(BASE_URL)
  await heading.waitFor({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Theme' }).waitFor()
  const box = await page.getByRole('button', { name: 'Theme' }).boundingBox()
  expect(box && box.x >= 0 && box.x + box.width <= 390, `the theme button must be on screen (${JSON.stringify(box)})`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow <= 0, `the page must not scroll sideways (${overflow}px)`)
  await page.waitForTimeout(500)
  await shot('theme-workspace-mobile-dark.png')
  site.signedIn = false
  await page.goto(BASE_URL)
  await page.getByPlaceholder('Describe the site you want to build…').waitFor()
  await shot('theme-landing-mobile-dark.png')
  console.log('✓ phone: the theme button fits the header')

  if (errors.length) throw new Error(`page errors:\n${errors.join('\n')}`)
  console.log('\nAll theme checks passed.')
} catch (e) {
  console.error(`✗ ${e.message}`)
  await shot('theme-failure.png').catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
