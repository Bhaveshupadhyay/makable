// Smoke test for the builder SPA. See SKILL.md for setup.
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199'
const OUT_DIR = process.env.OUT_DIR ?? '.'
const cache = join(homedir(), 'Library/Caches/ms-playwright')
const shellDir = readdirSync(cache).find((d) => d.startsWith('chromium_headless_shell'))
const executablePath = join(cache, shellDir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))
// Editable contract: content elements carry data-content paths (see edit-template skill).
// Catalog templates may show a field more than once (e.g. the name in nav and hero), hence `exact`.
async function expectEditable(frame, label, { exact = true } = {}) {
  for (const path of ['profile.name', 'profile.headline', 'projects.0.name']) {
    const count = await frame.locator(`[data-content="${path}"]`).count()
    if (exact ? count !== 1 : count < 1) throw new Error(`${label}: expected one [data-content="${path}"], found ${count}`)
  }
  console.log(`✓ ${label} template: content tagged with data-content`)
}

// Visual edit: edit mode → click tagged text → type → Enter, plus cancel, validation and undo/redo.
async function expectVisualEdit(page, frame, label) {
  const name = frame.locator('[data-content="profile.name"]')
  const original = (await name.textContent()).trim()
  const editor = frame.locator('.makable-editor')
  const editName = async (text, key = 'Enter') => {
    await name.click()
    await editor.waitFor()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(text)
    await page.keyboard.press(key)
  }
  const expectName = async (text) => {
    await frame.locator('[data-content="profile.name"]', { hasText: text }).waitFor({ timeout: 30000 })
  }

  await page.getByRole('button', { name: 'Edit text' }).click()
  await page.getByRole('status').filter({ hasText: 'Click any text in the preview to edit it' }).waitFor()
  await editName(`${label} edited`)
  await expectName(`${label} edited`)
  await editName('not saved', 'Escape')
  if ((await name.textContent()).includes('not saved')) throw new Error(`${label}: Escape did not cancel`)
  await editName('')
  await page.getByText(/Couldn't save that edit/).waitFor()
  await expectName(`${label} edited`)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expectName(original)
  await page.getByRole('button', { name: 'Redo' }).click()
  await expectName(`${label} edited`)
  await page.getByRole('button', { name: 'Edit text' }).click()
  console.log(`✓ ${label} template: visual edit, cancel, validation, undo/redo`)
}

const shot = (name, fullPage = false) => page.screenshot({ path: join(OUT_DIR, name), fullPage })

try {
  // auth: unauthenticated → /login → mock sign-in
  await page.goto(BASE_URL)
  await page.waitForURL(/\/login/)
  await shot('login.png')
  await page.getByRole('button', { name: 'Continue with GitHub' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  console.log('✓ auth: redirected to login and signed in')

  // chat: start from a clean conversation
  const startOver = page.getByRole('button', { name: 'Start over' })
  await startOver.waitFor()
  if (await startOver.isEnabled()) await startOver.click()
  const composer = page.getByRole('textbox', { name: 'Message' })
  const say = async (text) => {
    await composer.fill(text)
    await composer.press('Enter')
  }
  const assistantSays = (text) => page.getByText(text).last().waitFor({ timeout: 30000 })
  await shot('chat-start.png')

  await page.getByRole('button', { name: 'I want a portfolio' }).click()
  await page.getByRole('group', { name: 'Templates' }).last().waitFor()
  await page.getByRole('button', { name: 'Terminal template' }).last().click()
  console.log('✓ chat: intent → template picker → template chosen')

  // preview opens beside the chat as soon as a template is picked
  const started = Date.now()
  const status = page.getByText(/Live preview|Preview error/)
  await status.waitFor({ timeout: 60000 })
  if ((await status.textContent()) !== 'Live preview') throw new Error(`preview status: ${await status.textContent()}`)
  const frame = page.frameLocator('iframe[title="Portfolio preview"]')
  await frame.locator('[data-theme="terminal"]').waitFor({ timeout: 30000 })
  console.log(`✓ preview: live in ${Date.now() - started} ms with terminal theme`)

  // details, one question at a time
  await say('not a valid username!')
  await assistantSays("doesn't look like a GitHub username")
  await page.getByRole('button', { name: '@octocat' }).click()
  await assistantSays('Found you')
  await say('Smoke test headline')
  await frame.getByText('Smoke test headline').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: /^(Keep it|Skip)$/ }).click()
  await say('my email is secret')
  await assistantSays("doesn't look like an email")
  await say('smoke@example.com')
  await say('linkedin.com/in/octocat')
  await assistantSays('Your portfolio is ready')
  await frame.getByText('smoke@example.com').waitFor({ timeout: 30000 })
  console.log('✓ chat: GitHub lookup, headline, bio, email, links (with re-asks on bad input)')
  await expectEditable(frame, 'React')
  await expectVisualEdit(page, frame, 'React')
  const title = await frame.locator('html').evaluate(() => document.title)
  if (title !== 'React edited') throw new Error(`React template title should follow profile.name, got "${title}"`)
  console.log('✓ React template: document title follows profile.name')
  await shot('builder.png')

  // conversation and portfolio survive a reload
  await page.reload()
  await assistantSays('Your portfolio is ready')
  await frame.getByText('Smoke test headline').waitFor({ timeout: 60000 })
  console.log('✓ chat: conversation persisted across reload')

  // template switch from the chat: static Paper template, then back to a React one
  await page.getByRole('button', { name: 'Change template' }).click()
  // Undo history is in memory only (gone after the reload above), so make a fresh edit first.
  await page.getByRole('button', { name: 'Edit text' }).click()
  await frame.locator('[data-content="profile.name"]').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Before switch')
  await page.keyboard.press('Enter')
  await frame.locator('[data-content="profile.name"]', { hasText: 'Before switch' }).waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Edit text' }).click()
  if (await page.getByRole('button', { name: 'Undo' }).isDisabled()) throw new Error('expected undo history before the switch')
  await page.getByRole('button', { name: 'Paper template' }).last().click()
  await frame.locator('.page .sidebar').waitFor({ timeout: 60000 })
  // A chat-side change clears visual-edit history, so undo can't revert the template switch.
  if (!(await page.getByRole('button', { name: 'Undo' }).isDisabled())) throw new Error('undo history survived a chat-side change')
  console.log('✓ visual edit: history cleared by chat-side template switch')
  const font = await frame.locator('.sidebar h1').evaluate((el) => getComputedStyle(el).fontFamily)
  if (!font.includes('Georgia')) throw new Error(`static template styles not applied (h1 font: ${font})`)
  await expectEditable(frame, 'static')
  await expectVisualEdit(page, frame, 'static')
  await shot('builder-static.png')
  await say('switch to a different template')
  await page.getByRole('button', { name: 'Bento template' }).last().click()
  await frame.locator('[data-theme="bento"]').waitFor({ timeout: 60000 })
  await frame.getByText('static edited').waitFor()
  console.log('✓ template switch: React → static → React, content kept')

  // catalog template with binary assets: images are served from its hosted demo, not the preview
  await say('show me the templates')
  const picker = page.getByRole('group', { name: 'Templates' }).last()
  const thumbs = picker.locator('img')
  await thumbs.first().evaluate((img) => img.decode())
  // The chat shows a short list of 6 (plus the current template if it's further down).
  const shortlist = await thumbs.count()
  const showAll = page.getByRole('button', { name: /^Show all \d+ templates$/ }).last()
  const total = Number((await showAll.textContent()).match(/\d+/)[0])
  if (shortlist !== 6 || total <= 6) throw new Error(`expected a short list of 6 of ${total}, got ${shortlist}`)
  await showAll.click()
  if ((await thumbs.count()) !== total) throw new Error(`Show all should list ${total} templates, got ${await thumbs.count()}`)
  console.log(`✓ picker: ${shortlist} of ${total} catalog templates, then Show all`)
  await page.getByRole('button', { name: 'Dopefolio template' }).last().click()
  const assets = frame.locator('img[src*="/makable-templates/"]')
  await assets.first().waitFor({ state: 'attached', timeout: 60000 })
  const broken = await assets.evaluateAll(async (imgs) => {
    await Promise.all(imgs.map((img) => img.decode().catch(() => {})))
    return imgs.filter((img) => !img.naturalWidth).map((img) => img.src)
  })
  if (broken.length) throw new Error(`template assets failed to load: ${broken.join(', ')}`)
  await frame.getByText('static edited').first().waitFor()
  await expectEditable(frame, 'Dopefolio', { exact: false })
  await shot('builder-remote-assets.png')
  console.log(`✓ Dopefolio template: ${await assets.count()} hosted assets load, content kept`)
  await say('change template')
  await page.getByRole('button', { name: 'Dopefolio template', pressed: true }).last().waitFor()
  console.log('✓ picker: the current template stays visible in the short list')

  // mobile: chat and preview stack vertically
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(800)
  await shot('builder-mobile.png')
  await page.setViewportSize({ width: 1280, height: 900 })

  // start over: back to the greeting, preview closed
  await page.getByRole('button', { name: 'Start over' }).click()
  await page.getByRole('button', { name: 'I want a portfolio' }).waitFor()
  if (await page.locator('iframe[title="Portfolio preview"]').count()) throw new Error('preview still open after start over')
  console.log('✓ chat: start over')

  // sign out
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL(/\/login/)
  console.log('✓ auth: signed out')
} catch (err) {
  console.error('✗', err.message)
  await shot('failure.png').catch(() => {})
  process.exitCode = 1
} finally {
  if (errors.length) {
    console.error('page errors:', errors)
    process.exitCode = 1
  }
  await browser.close()
}
