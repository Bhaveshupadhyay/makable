// Settings → AI models and the model menu in the AI box, end to end in the browser: the real SPA against a
// scripted makable-backend (Playwright routes answer /api/v1). Run the dev server WITHOUT mock auth. See SKILL.md.
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199'
const OUT_DIR = process.env.OUT_DIR ?? '.'
const cache = join(homedir(), 'Library/Caches/ms-playwright')
const shellDir = readdirSync(cache).find((d) => d.startsWith('chromium_headless_shell'))
const executablePath = join(cache, shellDir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')

const USER = { id: 'u1', login: 'octocat', name: 'The Octocat', avatarUrl: 'https://github.com/octocat.png', role: 'user' }
const GOOD_KEY = 'sk-proj-good-key-7f3a'
const KEY_ID = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b'
const AVAILABLE = ['gpt-4.1-mini', 'gpt-5', 'o4-mini']
const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', keysUrl: 'https://platform.openai.com/api-keys' },
  { id: 'groq', name: 'Groq', keysUrl: 'https://console.groq.com/keys' },
]

// --- The fake backend ---
// `makableModel: false` is a backend without AI_BASE_URL: users need their own key.
const backend = { makableModel: false, key: null, keyBodies: [], edits: [], editAnswers: [] }
const ok = (data) => ({ status: 200, body: { success: true, data } })
const fail = (status, code, message) => ({ status, body: { success: false, error: { code, message } } })
const options = () => [
  ...(backend.makableModel ? [{ keyId: null, provider: null, model: 'auto' }] : []),
  ...(backend.key?.status === 'valid' ? backend.key.models.map((model) => ({ keyId: KEY_ID, provider: 'openai', model })) : []),
]

function answer(method, path, body) {
  if (path === '/auth/session') return ok({ user: USER })
  if (path === '/workspace/sessions/latest') return fail(404, 'workspace_session_not_found', 'No saved session on GitHub yet')
  if (method === 'PUT' && path.startsWith('/workspace/sessions/')) return ok({ sha: 'a'.repeat(40), repoUrl: 'https://github.com/octocat/makable-workspace' })
  if (path === '/ai/providers') return ok(PROVIDERS)
  if (method === 'GET' && path === '/ai/keys') return ok(backend.key ? [backend.key] : [])
  if (method === 'GET' && path === '/ai/models') return ok(options())
  if (method === 'POST' && path === '/ai/keys') {
    backend.keyBodies.push(body)
    if (body.apiKey !== GOOD_KEY) return fail(422, 'ai_key_invalid', "The AI provider didn't accept your API key. Check it in Settings.")
    const now = new Date().toISOString()
    backend.key = { id: KEY_ID, provider: body.provider, keyHint: body.apiKey.slice(-4), status: 'valid', checkedAt: now, models: [], createdAt: now }
    return { status: 201, body: { success: true, data: { key: backend.key, availableModels: AVAILABLE } } }
  }
  if (method === 'PATCH' && path === `/ai/keys/${KEY_ID}`) {
    backend.key = { ...backend.key, models: body.models }
    return ok(backend.key)
  }
  if (method === 'POST' && path === '/ai/edit') {
    backend.edits.push(body)
    const next = backend.editAnswers.shift() ?? ok({ tier: 2, reason: 'Needs the navbar too.' })
    if (next.body.error?.code === 'ai_key_invalid') backend.key = { ...backend.key, status: 'invalid' }
    return next
  }
  return fail(404, 'not_found', `fake backend: no route for ${method} ${path}`)
}

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
// The fake backend answers some requests with errors on purpose; the browser logs those.
page.on('console', (m) => m.type() === 'error' && !/status of (404|422)/.test(m.text()) && errors.push(`console: ${m.text()}`))
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
  // 1. No makable model and no key yet: AI mode asks for a key up front and leads to Settings.
  await page.goto(BASE_URL)
  await page.getByRole('button', { name: 'Account menu' }).waitFor()
  const startOver = page.getByRole('button', { name: 'Start over' })
  if (await startOver.isEnabled()) await startOver.click()
  await page.getByRole('button', { name: 'I want a portfolio' }).click()
  await page.getByRole('button', { name: 'Terminal template' }).last().click()
  const frame = page.frameLocator('iframe[title="Portfolio preview"]')
  await frame.locator('[data-theme="terminal"]').waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: 'Edit with AI' }).last().click()
  await page.getByText('AI edits run on your own API key').waitFor()
  await frame.locator('[data-content]').first().click()
  const popover = page.getByRole('form', { name: 'Ask AI' })
  await popover.getByRole('link', { name: 'Add an API key' }).waitFor()
  expect((await page.getByRole('textbox', { name: 'Ask AI to make changes' }).count()) === 0, 'no text box without a model')
  await shot('ai-needs-key.png')
  await popover.getByRole('link', { name: 'Add an API key' }).click()
  await page.getByRole('heading', { name: 'AI models' }).waitFor()
  await page.getByText('No keys yet').waitFor()
  console.log('✓ no model: AI mode asks for an API key (hint and box) and links to Settings')

  const keyInput = page.getByLabel('API key', { exact: true })
  await keyInput.fill('sk-wrong')
  await page.getByRole('button', { name: 'Add key' }).click()
  await page.getByText("didn't accept your API key").waitFor()
  expect((await keyInput.inputValue()) === 'sk-wrong', 'a refused key should stay in the box to fix')
  console.log('✓ settings: a refused key shows the provider error')

  await keyInput.fill(`  ${GOOD_KEY}\n`.trim())
  await page.getByRole('button', { name: 'Add key' }).click()
  const models = page.getByRole('list', { name: 'Models' })
  await models.waitFor()
  expect((await keyInput.inputValue()) === '', 'the key should be cleared once it was saved')
  expect(backend.keyBodies.at(-1).apiKey === GOOD_KEY, 'the key should be sent trimmed')
  await models.getByLabel('gpt-5').check()
  await models.getByLabel('o4-mini').check()
  await page.getByText('2 of 20 shown in the chat').waitFor()
  await shot('ai-settings-choose.png')
  // From here on the backend has its own model too, to check the menu with both.
  backend.makableModel = true
  await page.getByRole('button', { name: 'Save models' }).click()
  await page.getByText('In the chat: gpt-5, o4-mini').waitFor()
  await page.getByText('••••7f3a').waitFor()
  expect(!(await page.content()).includes(GOOD_KEY), 'the key must not be on the page')
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(!stored.includes(GOOD_KEY), 'the key must not be in localStorage')
  await shot('ai-settings.png')
  console.log('✓ settings: a checked key is added, models chosen and saved; only its last 4 characters are shown')

  // 2. The builder's AI box offers the models and sends the pick.
  await page.getByRole('link', { name: 'Back to the builder' }).click()
  await frame.locator('[data-theme="terminal"]').waitFor({ timeout: 60000 })
  // AI mode is still on from before Settings, now with a model to use.
  await page.getByText('Click anything in the preview to change it with AI').waitFor()
  await frame.locator('[data-content]').first().click()
  const aiBox = page.getByRole('textbox', { name: 'Ask AI to make changes' })
  await aiBox.waitFor()

  const picker = page.getByRole('button', { name: /^AI model:/ })
  // With models of their own, those come first: makable default only when picked.
  expect((await picker.getAttribute('aria-label')) === 'AI model: gpt-5', 'the user’s first model should be used, not makable default')
  await aiBox.fill('Make it bold')
  await aiBox.press('Enter')
  await page.getByText(/needs a deeper edit/).last().waitFor()
  const sent = backend.edits.at(-1).model
  expect(sent?.keyId === KEY_ID && sent?.model === 'gpt-5', `the user’s model should be sent, got ${JSON.stringify(sent)}`)

  // A finished request closes the box; select again.
  await frame.locator('[data-content]').first().click()
  await picker.click()
  await page.getByRole('menuitem', { name: 'Manage models' }).waitFor()
  await shot('ai-model-menu.png')
  await page.getByRole('menuitem', { name: 'makable default' }).click()
  await page.getByRole('button', { name: 'AI model: makable default' }).waitFor()
  await aiBox.fill('Make it bold')
  await aiBox.press('Enter')
  await page.getByText(/needs a deeper edit/).nth(1).waitFor()
  expect(!('model' in backend.edits.at(-1)), 'makable’s own model is sent as no model')
  console.log('✓ AI box: the user’s own model is used first; makable default only when picked, sent as no model')

  // 3. Picks survive a reload, and a refused key drops back to makable's own.
  await page.reload()
  await page.getByRole('button', { name: 'Edit with AI' }).last().click()
  await frame.locator('[data-theme="terminal"]').waitFor({ timeout: 60000 })
  await frame.locator('[data-content]').first().click()
  await page.getByRole('button', { name: 'AI model: makable default' }).waitFor()
  await picker.click()
  await page.getByRole('menuitem', { name: 'o4-mini' }).click()
  await page.getByRole('button', { name: 'AI model: o4-mini' }).waitFor()
  backend.editAnswers.push(fail(422, 'ai_key_invalid', "The AI provider didn't accept your API key. Check it in Settings."))
  await aiBox.fill('Make it bold')
  await aiBox.press('Enter')
  await page.getByText("didn't accept your API key").waitFor()
  expect(backend.edits.at(-1).model?.model === 'o4-mini', 'the new pick should be sent')
  await popover.getByRole('link', { name: 'Manage AI models' }).waitFor()
  await page.getByRole('button', { name: 'AI model: makable default' }).waitFor()
  console.log('✓ AI box: picks are remembered; a refused key links to Settings and falls back to makable default')

  expect(errors.length === 0, `page errors:\n${errors.join('\n')}`)
  console.log('All AI model checks passed')
} catch (err) {
  await shot('ai-models-failure.png').catch(() => {})
  console.error(`✗ ${err.message}`)
  if (errors.length) console.error(errors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
