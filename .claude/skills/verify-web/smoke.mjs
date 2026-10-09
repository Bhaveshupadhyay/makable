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
  // guest: the chat is the first page, no sign-in wall (old /login links land there too)
  await page.goto(`${BASE_URL}/login`)
  await page.waitForURL((url) => url.pathname === '/')
  if (await page.getByRole('button', { name: 'Sign out' }).count()) throw new Error('expected a guest session')
  console.log('✓ auth: guests land on the chat without signing in')

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
  // Guests get no @login quick reply, so type it.
  await say('@octocat')
  await assistantSays('Found you')
  // "Edit with AI" is in the chat's quick replies (first) and the preview toolbar (last).
  const aiEditChat = () => page.getByRole('button', { name: 'Edit with AI' }).first()
  const aiEditToolbar = page.getByRole('button', { name: 'Edit with AI' }).last()
  if ((await page.getByRole('button', { name: 'Edit with AI' }).count()) !== 2) throw new Error('expected Edit with AI in the chat and the toolbar')
  // Mid-flow from the toolbar: guests are asked to connect GitHub, and the headline question stays open.
  await aiEditToolbar.click()
  await assistantSays('connect it first')
  console.log('✓ AI edit: toolbar button asks a guest to connect GitHub mid-flow')
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

  // AI features need GitHub: the chat asks to connect, and the conversation survives the sign-in redirect
  await aiEditChat().click()
  await assistantSays('connect it first')
  const connect = page.getByRole('button', { name: 'Connect GitHub' }).last()
  await connect.scrollIntoViewIfNeeded()
  await shot('connect-github.png')
  await connect.click()
  await assistantSays('Connected as @octocat')
  await page.getByRole('button', { name: 'Sign out' }).waitFor()
  await frame.getByText('Smoke test headline').waitFor({ timeout: 60000 })
  console.log('✓ auth: connect GitHub from the chat, conversation and preview kept')

  // AI edit: signing in from the AI prompt turns AI mode on; clicking a skill opens the AI box next to it
  const aiBox = page.getByRole('textbox', { name: 'Ask AI to make changes' })
  const popover = page.getByRole('form', { name: 'Ask AI' })
  await page.getByText('Click anything in the preview to change it with AI').waitFor()
  const chip = frame.locator('[data-content="skills.0"]')
  await chip.click()
  await page.getByText(/› skills\.0/).waitFor()
  const near = async () => {
    const [el, box] = [await chip.boundingBox(), await popover.boundingBox()]
    const gap = box.y >= el.y ? box.y - (el.y + el.height) : el.y - (box.y + box.height)
    if (gap < 0 || gap > 20) throw new Error(`AI box should sit next to the selected element (gap ${gap}px)`)
    return box.y
  }
  const before = await near()
  if (!(await aiBox.evaluate((el) => el === document.activeElement))) throw new Error('AI box should take focus after a selection')
  // It follows the element when the preview scrolls.
  await frame.locator('html').evaluate(() => window.scrollBy(0, 80))
  await page.waitForTimeout(300)
  if (Math.abs((await near()) - before) < 40) throw new Error('AI box did not follow the element on scroll')
  console.log('✓ AI edit: box opens next to the selected element, focused, and follows it on scroll')
  const skills = frame.locator('[data-content^="skills."]')
  const skillCount = await skills.count()
  // While the AI works, every editor is locked and the box offers Stop instead of Send.
  await aiBox.fill('Remove this skill, slowly')
  await aiBox.press('Enter')
  const stop = page.getByRole('button', { name: 'Stop AI' })
  await stop.waitFor()
  await page.getByText("Editing is paused until it's done").waitFor()
  for (const name of ['Edit text', 'Edit with AI', 'Undo', 'Redo']) {
    if (await page.getByRole('button', { name, exact: true }).last().isEnabled()) throw new Error(`${name} should be disabled while the AI works`)
  }
  await frame.locator('[data-content="profile.name"]').first().click()
  await page.waitForTimeout(300)
  if (!(await page.getByText(/› skills\.0/).isVisible())) throw new Error('clicks in the preview should not change the selection while the AI works')
  await shot('ai-edit-pending.png')
  await stop.click()
  await assistantSays('Stopped. Nothing was changed.')
  await page.getByRole('button', { name: 'Send to AI' }).waitFor()
  if (!(await page.getByRole('button', { name: 'Edit text', exact: true }).isEnabled())) throw new Error('Edit text should be enabled again after Stop')
  // The aborted answer arrives at the mock model's pace; it must not be applied.
  await page.waitForTimeout(5500)
  if ((await skills.count()) !== skillCount) throw new Error('a stopped request should change nothing')
  console.log('✓ AI edit: editing locked while the AI works; Stop cancels it and changes nothing')
  await aiBox.fill('Remove this skill and punch up the headline')
  await shot('ai-edit-popover.png')
  const aiResponse = page.waitForResponse((r) => r.url().endsWith('/api/v1/ai/edit'))
  await aiBox.press('Enter')
  // The backend calls the mock model; its edits are applied to the preview: the content file
  // edit becomes the portfolio, the stylesheet edit an AI-edited file.
  const headline = frame.locator('[data-content="profile.headline"]').first()
  await frame.getByText('AI headline').waitFor({ timeout: 60000 })
  if ((await skills.count()) !== skillCount - 1) throw new Error('the AI should have removed one skill')
  const outline = () => headline.evaluate((el) => getComputedStyle(el).outlineColor)
  for (let i = 0; i < 50 && (await outline()) !== 'rgb(16, 185, 129)'; i++) await page.waitForTimeout(200)
  if ((await outline()) !== 'rgb(16, 185, 129)') throw new Error(`the AI's stylesheet edit should outline the headline, got ${await outline()}`)
  const response = await (await aiResponse).text()
  if (!response.includes('"tier":1') || !response.includes('Content path: skills.0')) throw new Error(`unexpected AI response: ${response.slice(0, 300)}`)
  // The system prompt stays on the server: the browser never sends it or gets it back.
  if (response.includes('You edit a website')) throw new Error('the system prompt reached the browser')
  // No request inspector panel under the preview.
  if (await page.getByRole('region', { name: 'AI request' }).count()) throw new Error('the AI request panel should not be shown')
  await assistantSays('Removed the first skill, rewrote the headline and outlined it')
  await shot('ai-edit.png')
  // Sending closes the box (the selection is used up); the change is one undo step.
  await aiBox.waitFor({ state: 'detached' })
  // Code view: a VS Code-style editor over the same files. Opening it leaves AI mode; the
  // AI-edited stylesheet is marked M and shows the model's rule.
  await page.getByRole('radio', { name: 'Code' }).click()
  const explorer = page.getByRole('navigation', { name: 'Explorer' })
  await explorer.waitFor()
  await page.getByRole('tab', { name: /App\.tsx/ }).waitFor()
  await page.getByText('1 file changed by AI').waitFor()
  const cssItem = explorer.getByTitle('src/index.css')
  if (!(await cssItem.textContent()).includes('M')) throw new Error('the AI-edited stylesheet should be marked M in the Explorer')
  await cssItem.click()
  const code = page.locator('.monaco-editor .view-lines')
  const codeText = async () => ((await code.textContent()) ?? '').replace(/\u00a0/g, ' ')
  for (let i = 0; i < 100 && !(await codeText()).includes('outline: 3px solid'); i++) await page.waitForTimeout(200)
  if (!(await codeText()).includes('outline: 3px solid')) throw new Error('the editor should show the AI-edited stylesheet')
  await page.getByText(/Ln \d+, Col \d+/).waitFor()
  await shot('code-view.png')
  await page.getByRole('radio', { name: 'Preview' }).click()
  await frame.locator('[data-content="profile.headline"]').first().waitFor()
  if ((await aiEditToolbar.getAttribute('aria-pressed')) === 'true') throw new Error('opening the code view should leave AI mode')
  console.log('✓ code view: IDE-style explorer, tabs and editor; AI-edited file marked and shown; back to preview')
  await page.getByRole('button', { name: /Undo/ }).click()
  await frame.getByText('Smoke test headline').waitFor({ timeout: 30000 })
  if ((await skills.count()) !== skillCount) throw new Error('undo should bring the skill back')
  for (let i = 0; i < 50 && (await outline()) === 'rgb(16, 185, 129)'; i++) await page.waitForTimeout(200)
  if ((await outline()) === 'rgb(16, 185, 129)') throw new Error('undo should also revert the stylesheet edit')
  console.log('✓ AI edit: file edits from the model applied to the preview (content + stylesheet), shown in the chat, undone in one step')
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
  // With 6 or fewer templates there's nothing to expand.
  const shortlist = await thumbs.count()
  const showAll = page.getByRole('button', { name: /^Show all \d+ templates$/ }).last()
  if (await showAll.count()) {
    const total = Number((await showAll.textContent()).match(/\d+/)[0])
    if (shortlist !== 6 || total <= 6) throw new Error(`expected a short list of 6 of ${total}, got ${shortlist}`)
    await showAll.click()
    if ((await thumbs.count()) !== total) throw new Error(`Show all should list ${total} templates, got ${await thumbs.count()}`)
    console.log(`✓ picker: ${shortlist} of ${total} catalog templates, then Show all`)
  } else {
    if (shortlist > 6) throw new Error(`${shortlist} templates listed without a Show all toggle`)
    console.log(`✓ picker: all ${shortlist} catalog templates, no Show all needed`)
  }
  await page.getByRole('button', { name: 'Dopefolio template' }).last().click()
  const assets = frame.locator('img[src*="/makable-templates/"]')
  await assets.first().waitFor({ state: 'attached', timeout: 60000 })
  // Static templates reload when their files change; check the images once the content has rendered.
  await frame.getByText('static edited').first().waitFor({ timeout: 30000 })
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

  // sign out: back to a fresh guest chat
  await say('I want a portfolio')
  await page.getByRole('group', { name: 'Templates' }).last().waitFor()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('button', { name: 'I want a portfolio' }).waitFor()
  if (await page.getByRole('group', { name: 'Templates' }).count()) throw new Error("account's chat still shown after sign out")
  console.log('✓ auth: signed out to a fresh guest chat')
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
