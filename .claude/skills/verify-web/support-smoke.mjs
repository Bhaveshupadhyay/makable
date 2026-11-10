// The Support menu, end to end in the browser: the real SPA against a scripted makable-backend (see fake-backend.mjs).
// The header's Support menu is on every page, guests too: WhatsApp first (a chat with the support number, in a new
// tab), email support (a mailto link, the user's mail app) and a 1:1 call on Cal.com (a new tab); the landing page's
// footer has the same three links; the header still fits with the workspace's own actions, from a phone to a desktop.
// Run the dev server WITHOUT mock auth and with VITE_ANALYTICS_DEBUG=true: each click's analytics event is checked,
// and the run fails if the console logger is off (ANALYTICS=off skips those checks, and says so). See SKILL.md.
import { join } from 'node:path'
import { expect, fakeSites, launch, siteAnswer, routeBackend, watchErrors } from './fake-backend.mjs'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199'
const OUT_DIR = process.env.OUT_DIR ?? '.'
const EMAIL = 'support@makable.tech'
const MEETING_URL = 'https://cal.com/bhavesh-upadhyay-iubvet'
const WHATSAPP_URL = 'https://wa.me/15053709823'
const WHATSAPP_NUMBER = '+1 (505) 370-9823'

const site = fakeSites()
const browser = await launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
// Cal.com and WhatsApp are answered here, so nothing leaves the machine.
for (const site of ['https://cal.com/**', 'https://wa.me/**']) {
  await context.route(site, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>elsewhere</title>' }))
}
const page = await context.newPage()
const errors = watchErrors(page)
await routeBackend(page, (method, path, body) => siteAnswer(site, method, path, body))
const shot = (name, on = page) => on.screenshot({ path: join(OUT_DIR, name) })

/** Waits for `check()` to hold; past `timeout` ms, fails with `what()`. */
async function until(check, what, timeout = 5_000) {
  for (const deadline = Date.now() + timeout; !(await check()); await new Promise((r) => setTimeout(r, 50))) {
    expect(Date.now() < deadline, what())
  }
}

// The analytics events, read from the console logger. Checked unless ANALYTICS=off: whether the logger is on is
// decided once, by waiting for the first page's page_view, never by what happens to have arrived when a check runs.
const CHECK_ANALYTICS = process.env.ANALYTICS !== 'off'
const events = []
page.on('console', (m) => {
  if (!m.text().startsWith('%c[analytics]')) return
  Promise.all(m.args().map((arg) => arg.jsonValue().catch(() => null))).then(([, , name, props]) => events.push({ name, props }))
})
const seenEvents = () => [...new Set(events.map((e) => e.name))].join(', ')
async function expectAnalyticsOn() {
  if (!CHECK_ANALYTICS) return console.log('… analytics checks skipped (ANALYTICS=off)')
  await until(
    () => events.some((e) => e.name === 'page_view'),
    () => 'analytics: no page_view from the console logger. Start the dev server with VITE_ANALYTICS_DEBUG=true, or run with ANALYTICS=off',
    10_000,
  )
}
async function expectEvent(name, match = {}) {
  if (!CHECK_ANALYTICS) return
  const seenIt = () => events.some((e) => e.name === name && Object.entries(match).every(([k, v]) => e.props?.[k] === v))
  await until(seenIt, () => `analytics: no ${name} ${JSON.stringify(match)} (seen: ${seenEvents()})`)
}

const supportButton = () => page.getByRole('banner').getByRole('button', { name: 'Support' })
const menu = () => page.getByRole('menu')
async function openSupport() {
  await supportButton().click()
  await menu().waitFor()
}
/** Clicks a link that opens `url` in a new tab. */
async function opensTab(link, url) {
  const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()])
  await popup.waitForLoadState()
  expect(popup.url() === url, `the link must open ${url} in a new tab (${popup.url()})`)
  await popup.close()
}
/**
 * The header's two groups don't overlap and nothing sticks out of the window or makes the page scroll sideways. It's
 * measured until it fits (≤ 2 s), since the layout settles after a resize, then the last measure is checked.
 */
async function expectHeaderFits(width) {
  const measure = () => page.evaluate(() => {
    const [left, right] = document.querySelector('header').children
    const edge = (el, side) => Math.max(...[...el.querySelectorAll('a, button')].map((c) => c.getBoundingClientRect()[side]))
    return {
      leftEnd: edge(left, 'right'),
      rightStart: Math.min(...[...right.querySelectorAll('a, button')].map((c) => c.getBoundingClientRect().left)),
      rightEnd: edge(right, 'right'),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  const fits = (f) => f.leftEnd <= f.rightStart && f.rightEnd <= width && f.overflow <= 0
  let fit = await measure()
  for (const deadline = Date.now() + 2_000; !fits(fit) && Date.now() < deadline; fit = await measure()) await page.waitForTimeout(50)
  expect(fit.leftEnd <= fit.rightStart, `at ${width}px the header's links must not run into its buttons (${JSON.stringify(fit)})`)
  expect(fit.rightEnd <= width, `at ${width}px the header's buttons must be on screen (${JSON.stringify(fit)})`)
  expect(fit.overflow <= 0, `at ${width}px the page must not scroll sideways (${fit.overflow}px)`)
}

try {
  // 1. A guest on the landing page: the Support menu and its three links, WhatsApp first.
  site.signedIn = false
  await page.goto(BASE_URL)
  await page.getByPlaceholder('Describe the site you want to build…').waitFor()
  await expectAnalyticsOn()
  expect(await supportButton().isVisible(), 'guests must see Support in the header')
  await openSupport()
  const whatsappItem = menu().getByRole('menuitem', { name: /Chat on WhatsApp/ })
  expect((await whatsappItem.getAttribute('href')) === WHATSAPP_URL, `WhatsApp must link to a chat with the number (${await whatsappItem.getAttribute('href')})`)
  expect((await whatsappItem.getAttribute('target')) === '_blank' && (await whatsappItem.getAttribute('rel')) === 'noreferrer', 'WhatsApp must open in a new tab')
  expect(await whatsappItem.getByText(WHATSAPP_NUMBER).isVisible(), 'the menu must show the WhatsApp number')
  const emailItem = menu().getByRole('menuitem', { name: /Email support/ })
  expect((await emailItem.getAttribute('href')) === `mailto:${EMAIL}`, `Email support must be a mailto link (${await emailItem.getAttribute('href')})`)
  expect((await emailItem.getAttribute('target')) === null, 'the email link must not open a blank tab')
  expect(await emailItem.getByText(EMAIL).isVisible(), 'the menu must show the address')
  const callItem = menu().getByRole('menuitem', { name: /Book a 1:1 call/ })
  expect((await callItem.getAttribute('href')) === MEETING_URL, `Book a 1:1 call must link to Cal.com (${await callItem.getAttribute('href')})`)
  expect((await callItem.getAttribute('target')) === '_blank' && (await callItem.getAttribute('rel')) === 'noreferrer', 'Cal.com must open in a new tab')
  const items = await menu().getByRole('menuitem').allTextContents()
  expect(items.length === 3 && items[0].startsWith('Chat on WhatsApp'), `the menu must be WhatsApp, then the email and the call (${JSON.stringify(items)})`)
  await shot('support-menu.png')
  console.log('✓ guest: Support menu with WhatsApp on top, the mailto link and Cal.com')

  await opensTab(menu().getByRole('menuitem', { name: /Chat on WhatsApp/ }), WHATSAPP_URL)
  await expectEvent('support_contact_clicked', { channel: 'whatsapp', placement: 'header' })
  await openSupport()

  const before = page.url()
  await menu().getByRole('menuitem', { name: /Email support/ }).click()
  await expectEvent('support_contact_clicked', { channel: 'email', placement: 'header' })
  expect(page.url() === before, `the email link must leave the page where it was (${page.url()})`)
  await openSupport()
  await opensTab(menu().getByRole('menuitem', { name: /Book a 1:1 call/ }), MEETING_URL)
  await expectEvent('support_contact_clicked', { channel: 'call', placement: 'header' })
  console.log('✓ guest: WhatsApp opens a chat in a new tab, the email link stays on the page, the call opens Cal.com')

  // 2. The landing page's footer has a Support column.
  const footer = page.getByRole('contentinfo')
  const supportColumn = footer.getByRole('navigation', { name: 'Support' })
  await supportColumn.scrollIntoViewIfNeeded()
  const footerEmail = supportColumn.getByRole('link', { name: EMAIL })
  expect((await footerEmail.getAttribute('href')) === `mailto:${EMAIL}` && (await footerEmail.getAttribute('target')) === null, 'the footer must have the mailto link, in the same tab')
  await page.waitForTimeout(300)
  await footer.screenshot({ path: join(OUT_DIR, 'support-footer.png') })
  const footerLinks = await supportColumn.getByRole('link').allTextContents()
  expect(footerLinks[0] === 'Chat on WhatsApp', `the footer's Support column must start with WhatsApp (${JSON.stringify(footerLinks)})`)
  await opensTab(supportColumn.getByRole('link', { name: 'Chat on WhatsApp' }), WHATSAPP_URL)
  await expectEvent('support_contact_clicked', { channel: 'whatsapp', placement: 'footer' })
  await opensTab(supportColumn.getByRole('link', { name: 'Book a 1:1 call' }), MEETING_URL)
  await expectEvent('support_contact_clicked', { channel: 'call', placement: 'footer' })
  for (const width of [390, 700]) {
    await page.setViewportSize({ width, height: 900 })
    await supportColumn.scrollIntoViewIfNeeded()
    const box = await footerEmail.boundingBox()
    expect(box && box.x + box.width <= width, `at ${width}px the footer's address must fit (${JSON.stringify(box)})`)
    await expectHeaderFits(width)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await shot('support-landing-mobile.png')
  await page.setViewportSize({ width: 1280, height: 900 })
  console.log('✓ footer: WhatsApp, the address and the call, on a desktop and a phone')

  // 3. Signed in, in the workspace: Support beside the save state and Publish, at every width.
  site.signedIn = true
  await page.goto(BASE_URL)
  await page.getByRole('banner').getByRole('button', { name: /Publish/ }).waitFor({ timeout: 30_000 })
  for (const width of [1280, 1024, 768, 640, 390, 360]) {
    await page.setViewportSize({ width, height: 844 })
    await until(() => supportButton().isVisible(), () => `at ${width}px the workspace must show Support`, 2_000)
    await expectHeaderFits(width)
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.waitForTimeout(300)
  await page.getByRole('banner').screenshot({ path: join(OUT_DIR, 'support-workspace-header.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await openSupport()
  const box = await menu().boundingBox()
  expect(box && box.x >= 0 && box.x + box.width <= 390, `on a phone the menu must be on screen (${JSON.stringify(box)})`)
  await shot('support-menu-mobile.png')
  await page.keyboard.press('Escape')
  console.log('✓ workspace: Support fits the header from 360px to 1280px; the menu fits a phone')

  // 4. Dark mode.
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await openSupport()
  await page.waitForTimeout(300)
  await shot('support-menu-dark.png')
  await page.keyboard.press('Escape')
  console.log('✓ dark mode')

  if (errors.length) throw new Error(`page errors:\n${errors.join('\n')}`)
  console.log('\nAll support checks passed.')
} catch (e) {
  console.error(`✗ ${e.message}`)
  await shot('support-failure.png').catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
