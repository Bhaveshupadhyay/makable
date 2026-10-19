// A site's analytics, end to end in the browser: the real SPA against a scripted makable-backend (see
// fake-backend.mjs), on a site the user already has. Google's consent page is answered here, so nothing reaches Google.
// Run the dev server WITHOUT mock auth. See SKILL.md.
import { join } from 'node:path'
import { expect, fail, fakeSites, launch, ok, PROJECT_ID, routeBackend, siteAnswer, watchErrors } from './fake-backend.mjs'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199'
const OUT_DIR = process.env.OUT_DIR ?? '.'
const ANALYTICS = `/analytics/${PROJECT_ID}`
const EMAIL = 'octocat@example.com'
const STREAM = { id: '9876543210', name: 'Crumb Bakery site', measurementId: 'G-CRUMB12345', url: 'https://crumb.example' }

// --- The fake backend ---
const site = fakeSites()
const google = { connected: false, link: null, reports: [], linkBodies: [], refuseToken: false }
const accounts = [
  { id: '555', name: 'Octocat', properties: [{ id: '123456789', name: 'Crumb Bakery' }, { id: '222', name: 'Old blog' }] },
  { id: '777', name: 'Empty account', properties: [] },
]

/** `days` days of visits ending today, rising toward the end. */
function report(range) {
  const days = { '7d': 7, '28d': 28, '90d': 90 }[range]
  const today = new Date()
  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1 - i)))
    const users = 20 + Math.round(15 * Math.sin(i / 2)) + i
    return { date: date.toISOString().slice(0, 10), users, sessions: users + 4, pageViews: users * 3 }
  })
  const sum = (key) => daily.reduce((a, d) => a + d[key], 0)
  const totals = { users: sum('users'), newUsers: sum('users') - 9, sessions: sum('sessions'), pageViews: sum('pageViews'), averageSessionSeconds: 94, bounceRate: 0.42, engagementRate: 0.58 }
  return {
    range,
    startDate: daily[0].date,
    endDate: daily.at(-1).date,
    totals,
    previous: { ...totals, users: Math.round(totals.users * 0.8), pageViews: Math.round(totals.pageViews * 1.1), bounceRate: 0.5 },
    daily,
    topPages: [{ name: '/', value: 420 }, { name: '/menu', value: 180 }, { name: '/order', value: 64 }],
    sources: [{ name: 'Organic Search', value: 210 }, { name: 'Direct', value: 140 }, { name: 'Organic Social', value: 35 }],
    countries: [{ name: 'United Kingdom', value: 160 }, { name: 'India', value: 90 }],
    devices: [{ name: 'mobile', value: 190 }, { name: 'desktop', value: 110 }],
    activeNow: 3,
    fetchedAt: new Date().toISOString(),
  }
}

function answer(method, path, body, query) {
  const status = () => ok({ connection: { configured: true, connected: google.connected, email: google.connected ? EMAIL : null }, link: google.link, createUrl: 'https://analytics.google.com/analytics/web/#/provision' })
  if (method === 'GET' && path === `/sites/${PROJECT_ID}/analytics`) return status()
  if (method === 'POST' && path === '/analytics/google/connect') {
    expect(body.returnTo === ANALYTICS, `connect should come back to the page, got ${body.returnTo}`)
    return ok({ authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=smoke-state&scope=analytics.readonly' })
  }
  if (method === 'DELETE' && path === '/analytics/google') {
    google.connected = false
    return { status: 204 }
  }
  if (method === 'GET' && path === '/analytics/google/properties') return google.connected ? ok(accounts) : fail(409, 'google_not_connected', 'Connect Google Analytics first.')
  if (method === 'GET' && path === '/analytics/google/properties/123456789/streams') return ok([STREAM])
  if (method === 'GET' && path === '/analytics/google/properties/222/streams') return ok([])
  if (method === 'PUT' && path === `/sites/${PROJECT_ID}/analytics`) {
    google.linkBodies.push(body)
    google.link = { propertyId: body.propertyId, propertyName: 'Crumb Bakery', streamId: body.streamId, streamName: STREAM.name, measurementId: STREAM.measurementId, streamUrl: STREAM.url, timeZone: 'Europe/London', tagPublished: false }
    return ok(google.link)
  }
  if (method === 'DELETE' && path === `/sites/${PROJECT_ID}/analytics`) {
    google.link = null
    return { status: 204 }
  }
  if (method === 'GET' && path === `/sites/${PROJECT_ID}/analytics/report`) {
    const range = query.get('range')
    google.reports.push(range)
    if (google.refuseToken) {
      google.connected = false
      return fail(409, 'google_reconnect', 'makable can’t read your Google Analytics any more. Connect Google again.')
    }
    return ok(report(range))
  }
  return siteAnswer(site, method, path, body)
}

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = watchErrors(page)
await routeBackend(page, answer)
// Google's consent page: the user agrees, and Google sends them back (the real callback then redirects to the SPA).
await page.route('https://accounts.google.com/**', (route) => {
  google.connected = true
  return route.fulfill({ status: 302, headers: { location: `${BASE_URL}${ANALYTICS}?analytics=connected` } })
})

const shot = (name) => page.screenshot({ path: join(OUT_DIR, name), fullPage: true })

try {
  // 1. From the builder's header to the site's analytics, then connect Google.
  await page.goto(BASE_URL)
  await page.getByRole('link', { name: 'Analytics' }).click({ timeout: 60_000 })
  await page.getByRole('heading', { name: /Analytics · Crumb Bakery/ }).waitFor()
  await page.getByRole('heading', { name: 'See who visits your site' }).waitFor()
  await shot('analytics-connect.png')
  await page.getByRole('button', { name: 'Connect Google Analytics' }).click()
  await page.getByText(`Google Analytics is connected (${EMAIL})`).waitFor()
  expect(!page.url().includes('analytics=connected'), 'the redirect’s query should be cleared from the address')
  console.log('✓ connect: the header links to the site’s analytics; Google’s consent page comes back connected')

  // 2. Pick the property and its web stream (one stream: picked by itself).
  await page.getByRole('heading', { name: 'Pick where this site reports' }).waitFor()
  await page.getByText(`Properties in ${EMAIL}`).waitFor()
  await page.getByLabel(/Old blog/).check()
  await page.getByText('This property has no web stream').waitFor()
  await page.getByLabel(/^Crumb Bakery/).check()
  await page.getByLabel(/Crumb Bakery site/).waitFor()
  expect(await page.getByLabel(/Crumb Bakery site/).isChecked(), 'the only web stream should be picked')
  await shot('analytics-picker.png')
  await page.getByRole('button', { name: 'Use this stream' }).click()
  await page.getByText('Publish your site to start counting visits').waitFor()
  expect(google.linkBodies.at(-1).streamId === STREAM.id && google.linkBodies.at(-1).propertyId === '123456789', 'the stream should be linked')
  console.log('✓ picker: properties by account, a property without a web stream says so, the stream is linked')

  // 3. The dashboard: numbers against the days before, the chart's hover, ranges, the table view, the lists.
  await page.getByText('on the site in the last 30 minutes').waitFor()
  const visitors = page.getByRole('button', { name: /Visitors/ })
  await visitors.waitFor()
  expect((await visitors.getAttribute('aria-pressed')) === 'true', 'visitors is the chart’s first metric')
  await page.getByText('+25%').first().waitFor()
  await page.getByRole('heading', { name: 'Visitors per day' }).waitFor()
  const chart = page.getByRole('img', { name: /Visitors per day/ })
  const box = await chart.boundingBox()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2)
  await page.getByRole('status').filter({ hasText: 'Visitors ·' }).waitFor()
  await shot('analytics-dashboard.png')
  await page.getByRole('button', { name: /Page views/ }).click()
  await page.getByRole('heading', { name: 'Page views per day' }).waitFor()
  await page.getByRole('radio', { name: 'Last 7 days' }).click()
  await page.getByRole('img', { name: /Page views per day/ }).waitFor()
  expect(google.reports.includes('7d') && google.reports.includes('28d'), `both ranges should be read, got ${google.reports}`)
  await page.getByRole('button', { name: 'Show table' }).click()
  expect((await page.locator('table tbody tr').count()) === 7, 'the table lists every day')
  await page.getByRole('button', { name: 'Show chart' }).click()
  for (const title of ['Top pages', 'Traffic sources', 'Countries', 'Devices']) await page.getByRole('region', { name: title }).waitFor()
  await page.getByRole('region', { name: 'Devices' }).getByText('Mobile').waitFor()
  console.log('✓ dashboard: totals with changes, the chart’s hover, metrics and ranges, the table view and the top lists')

  // 4. A phone.
  await page.setViewportSize({ width: 390, height: 844 })
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width <= 390, `no sideways scrolling on a phone, the page is ${width}px wide`)
  await shot('analytics-mobile.png')
  await page.setViewportSize({ width: 1280, height: 900 })
  console.log('✓ phone: the dashboard fits')

  // 5. Stop analytics for the site: back to the picker. Then Google refuses the token: connect again.
  await page.getByRole('button', { name: 'More analytics options' }).click()
  await page.getByRole('menuitem', { name: 'Stop analytics for this site' }).click()
  await page.getByRole('button', { name: 'Stop analytics' }).click()
  await page.getByRole('heading', { name: 'Pick where this site reports' }).waitFor()
  await page.getByLabel(/^Crumb Bakery/).check()
  await page.getByRole('button', { name: 'Use this stream' }).click()
  await page.getByText('on the site in the last 30 minutes').waitFor()
  google.refuseToken = true
  await page.getByRole('radio', { name: 'Last 90 days' }).click()
  await page.getByRole('heading', { name: 'Connect Google Analytics again' }).waitFor()
  console.log('✓ unlink goes back to the picker; a refused Google token asks to connect again')

  // 6. Google's errors come back in the address and are explained.
  google.refuseToken = false
  await page.goto(`${BASE_URL}${ANALYTICS}?analyticsError=google_scope_missing`)
  await page.getByText('Tick “See your Google Analytics data”').waitFor()
  expect(!page.url().includes('analyticsError'), 'the error’s query should be cleared from the address')
  console.log('✓ a failed connect explains what to do')

  expect(errors.length === 0, `page errors:\n${errors.join('\n')}`)
  console.log('All analytics checks passed')
} catch (err) {
  await shot('analytics-failure.png').catch(() => {})
  console.error(`✗ ${err.message}`)
  if (errors.length) console.error(errors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
