// Settings → AI models and the model menu in the AI box, end to end in the browser: the real SPA against a
// scripted makable-backend (see fake-backend.mjs), on a site the user already has. Run the dev server WITHOUT mock
// auth. See SKILL.md.
import { join } from 'node:path'
import { clickInPreview, expect, fail, fakeSites, launch, ok, routeBackend, siteAnswer, watchErrors } from './fake-backend.mjs'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5199'
const OUT_DIR = process.env.OUT_DIR ?? '.'

const GOOD_KEY = 'sk-proj-good-key-7f3a'
// The chat's reply to a message sent with no AI model.
const NEEDS_KEY = 'Almost there! Add your API key'
const KEY_ID = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b'
const AVAILABLE = ['gpt-4.1-mini', 'gpt-5', 'o4-mini']
const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', keysUrl: 'https://platform.openai.com/api-keys' },
  { id: 'groq', name: 'Groq', keysUrl: 'https://console.groq.com/keys' },
  { id: 'gemini', name: 'Google Gemini', keysUrl: 'https://aistudio.google.com/apikey' },
]
const GEMINI_KEYS = PROVIDERS[2].keysUrl

// --- The fake backend ---
// `makableModel: false` is a backend without AI_BASE_URL: users need their own key.
const site = fakeSites()
const backend = { makableModel: false, key: null, keyBodies: [], edits: [], editAnswers: [], creates: [] }
let runs = 0
/** An AI edit the backend escalates (the chat shows its turn). */
const escalated = () => {
  site.turn({ instruction: 'Make it bold', outcome: 'escalated', reply: 'That needs a deeper edit: the navbar too.', commitSha: null })
  return ok({ status: 'escalated', runId: `00000000-0000-4000-8000-${String(++runs).padStart(12, '0')}`, reason: 'Needs the navbar too.' })
}
const options = () => [
  ...(backend.makableModel ? [{ keyId: null, provider: null, model: 'auto' }] : []),
  ...(backend.key?.status === 'valid' ? backend.key.models.map((model) => ({ keyId: KEY_ID, provider: 'openai', model })) : []),
]

function answer(method, path, body) {
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
  if (method === 'POST' && path === '/ai/create') {
    backend.creates.push(body)
    return fail(422, 'ai_model_required', 'Add your own API key in Settings to use AI edits.')
  }
  if (method === 'POST' && path === '/ai/edit') {
    backend.edits.push(body)
    const next = backend.editAnswers.shift() ?? escalated()
    if (next.body.error?.code === 'ai_key_invalid') backend.key = { ...backend.key, status: 'invalid' }
    return next
  }
  return siteAnswer(site, method, path, body)
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
  const leaked = [GOOD_KEY, 'sk-wrong'].filter((s) => all.includes(s))
  console.log('analytics events:', [...analyticsNames].join(', '))
  console.log(leaked.length ? `✗ SECRET LEAKED to analytics: ${leaked}` : '✓ analytics: no token/key in any event')
  if (leaked.length) process.exitCode = 1
})
const errors = watchErrors(page)
await routeBackend(page, answer)

const shot = (name) => page.screenshot({ path: join(OUT_DIR, name) })
const frame = page.frameLocator('iframe[title="Site preview"]')
const heading = frame.getByRole('heading', { name: 'Crumb Bakery' })
const element = frame.getByText('Fresh bread every morning')

try {
  // 1. No makable model and no key yet: a message in the chat isn't sent; the chat says the key isn't connected, and
  // its button leads to Settings. The user's site opens by itself (their newest).
  await page.goto(BASE_URL)
  await heading.waitFor({ timeout: 90_000 })
  const composer = page.getByRole('textbox', { name: 'Message' })
  await composer.fill('Make the headline bigger')
  await composer.press('Enter')
  await page.getByText(NEEDS_KEY).waitFor()
  await page.getByText('Make the headline bigger', { exact: true }).waitFor()
  const chatAddKey = page.getByRole('link', { name: 'Add an API key' })
  expect((await chatAddKey.count()) === 1, 'the chat’s reply offers the way to Settings')
  expect(backend.edits.length === 0, 'nothing is sent without a model')
  await shot('chat-needs-key.png')
  // What an API key is, for people who don't know, is one click away rather than in the reply.
  await page.getByRole('button', { name: 'What’s an API key?' }).click()
  const keyHelp = page.getByRole('dialog').filter({ hasText: 'A private code from an AI company' })
  await keyHelp.waitFor()
  // The free option, and each company's own page for making a key, so nobody has to search for it.
  const freeKey = keyHelp.getByRole('link', { name: 'Get a free Gemini key' })
  expect((await freeKey.getAttribute('href')) === GEMINI_KEYS, 'the free tip links to Gemini’s page for making a key')
  const providerLinks = keyHelp.getByRole('list', { name: 'Where to get an API key' }).getByRole('link')
  expect(
    JSON.stringify(await providerLinks.evaluateAll((links) => links.map((a) => a.getAttribute('href')))) === JSON.stringify(PROVIDERS.map((p) => p.keysUrl)),
    'each company links to its own page for making a key',
  )
  await page.context().route(/^https:\/\/aistudio\.google\.com\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>AI Studio</title>' }))
  const [studio] = await Promise.all([page.waitForEvent('popup'), freeKey.click()])
  expect(studio.url() === GEMINI_KEYS, `the free tip opens Gemini’s key page, got ${studio.url()}`)
  await studio.close()
  await shot('chat-api-key-help.png')
  await page.keyboard.press('Escape')
  await keyHelp.waitFor({ state: 'detached' })
  await chatAddKey.click()
  await page.getByRole('heading', { name: 'AI models' }).waitFor()
  await page.getByRole('link', { name: 'Back to the builder' }).click()
  await heading.waitFor({ timeout: 90_000 })
  console.log('✓ no model: a chat message asks for an API key instead of going out, and its button opens Settings')

  // A new site's first prompt, on the landing page, isn't sent either: the chat asks for a key, and Try again waits for one.
  const siteMenu = page.getByRole('button', { name: 'Crumb Bakery' })
  await siteMenu.click()
  await page.getByRole('menuitem', { name: 'New site' }).click()
  const prompt = page.getByPlaceholder('Describe the site you want to build…')
  await prompt.fill('A site for my bakery')
  await prompt.press('Enter')
  await page.getByText(NEEDS_KEY).waitFor()
  await page.getByText('A site for my bakery', { exact: true }).waitFor()
  expect((await chatAddKey.count()) === 1, 'the landing prompt’s reply offers the way to Settings')
  expect((await page.getByRole('button', { name: 'Try again' }).count()) === 0, 'Try again waits for a model')
  expect(backend.creates.length === 0, 'a site isn’t built without a model')
  await shot('create-needs-key.png')
  await page.getByRole('button', { name: 'New site' }).click()
  await page.getByRole('menuitem', { name: 'Crumb Bakery' }).click()
  await heading.waitFor({ timeout: 90_000 })
  console.log('✓ no model: a new site’s prompt asks for an API key instead of going out')

  // AI mode asks for a key up front and leads to Settings too.
  await page.getByRole('button', { name: 'Edit with AI' }).last().click()
  await page.getByText('AI edits run on your own API key').waitFor()
  await clickInPreview(page, element)
  const popover = page.getByRole('form', { name: 'Ask AI' })
  await popover.getByRole('link', { name: 'Add an API key' }).waitFor()
  expect((await page.getByRole('textbox', { name: 'Ask AI to make changes' }).count()) === 0, 'no text box without a model')
  await shot('ai-needs-key.png')
  await popover.getByRole('link', { name: 'Add an API key' }).click()
  await page.getByRole('heading', { name: 'AI models' }).waitFor()
  await page.getByText('No keys yet. Add one above to start building.').waitFor()
  // With no key yet, Settings suggests the free option too, and the form links to the chosen company's key page.
  await page.getByText('Want it free?').waitFor()
  expect((await page.getByRole('option', { name: 'Google Gemini (free tier)' }).count()) === 1, 'Gemini is marked as free in the list')
  expect((await page.getByRole('link', { name: 'Get your OpenAI API key' }).getAttribute('href')) === PROVIDERS[0].keysUrl, 'the form links to OpenAI’s key page')
  await page.getByLabel('Provider').selectOption('gemini')
  expect((await page.getByRole('link', { name: 'Get your Google Gemini API key' }).getAttribute('href')) === GEMINI_KEYS, 'the link follows the chosen company')
  await shot('ai-settings-no-keys.png')
  await page.getByLabel('Provider').selectOption('openai')
  console.log('✓ no model: AI mode asks for an API key (hint and box) and links to Settings, which suggests Gemini’s free tier')

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
  await heading.waitFor({ timeout: 90_000 })
  // AI mode is still on from before Settings, now with a model to use.
  await page.getByText('Click anything in the preview to change it with AI').waitFor()
  // With a model, the chat's earlier reply no longer offers Settings.
  expect((await chatAddKey.count()) === 0, 'the chat’s Add an API key button goes once there’s a model')
  await clickInPreview(page, element)
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
  await clickInPreview(page, element)
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
  await heading.waitFor({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Edit with AI' }).last().click()
  await clickInPreview(page, element)
  await page.getByRole('button', { name: 'AI model: makable default' }).waitFor()
  await picker.click()
  await page.getByRole('menuitem', { name: 'o4-mini' }).click()
  await page.getByRole('button', { name: 'AI model: o4-mini' }).waitFor()
  backend.editAnswers.push(fail(422, 'ai_key_invalid', "The AI provider didn't accept your API key. Check it in Settings."))
  await aiBox.fill('Make it bold')
  await aiBox.press('Enter')
  await popover.getByText("didn't accept your API key").waitFor()
  // The chat keeps the request and why it failed.
  await page.getByText("didn't accept your API key").first().waitFor()
  expect(backend.edits.at(-1).model?.model === 'o4-mini', 'the new pick should be sent')
  await popover.getByRole('link', { name: 'Manage AI models' }).waitFor()
  await page.getByRole('button', { name: 'AI model: makable default' }).waitFor()
  console.log('✓ AI box: picks are remembered; a refused key links to Settings and falls back to makable default')

  expect(errors.length === 0, `page errors:\n${errors.join('\n')}`)
  // Each step of asking for a key is tracked (when the dev server logs analytics: VITE_ANALYTICS_DEBUG=true).
  await Promise.all(consoleReads)
  if (analyticsNames.size) {
    for (const name of ['ai_message_needs_key', 'ai_key_help_opened', 'ai_key_provider_link_clicked', 'ai_key_setup_clicked', 'ai_key_added', 'ai_key_models_saved']) {
      expect(analyticsNames.has(name), `analytics: no ${name} (seen: ${[...analyticsNames].join(', ')})`)
    }
    console.log('✓ analytics: the key request, its help, a company’s key page, the way to Settings and the key being added are tracked')
  }
  console.log('All AI model checks passed')
} catch (err) {
  await shot('ai-models-failure.png').catch(() => {})
  console.error(`✗ ${err.message}`)
  if (errors.length) console.error(errors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
}
