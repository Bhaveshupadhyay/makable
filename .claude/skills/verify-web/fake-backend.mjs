// A scripted makable-backend for the smoke tests: the real SPA runs against it through Playwright routes, so nothing
// reaches GitHub, a model or a hosting platform. It knows one user and their sites (each a set of files at a commit);
// each script adds its own routes on top (see `routeBackend`).
import { chromium } from 'playwright-core'

export const USER = { id: 'u1', login: 'octocat', name: 'The Octocat', avatarUrl: 'https://github.com/octocat.png', role: 'user' }
export const PROJECT_ID = '6f1d3c2a-5b4e-4f7a-9c8d-1e2f3a4b5c6d'
export const REPO_URL = 'https://github.com/octocat/crumb-bakery'
export const sha = (n) => n.toString(16).padStart(40, '0')

export const ok = (data) => ({ status: 200, body: { success: true, data } })
export const fail = (status, code, message, details) => ({ status, body: { success: false, error: { code, message, details } } })
/** A streamed answer (`application/x-ndjson`): one JSON value per line. */
export const ndjson = (events) => ({ status: 200, ndjson: events.map((e) => JSON.stringify(e)).join('\n') + '\n' })

export const APP_TSX = `export function App() {
  return (
    <main className="min-h-screen bg-amber-50 p-10">
      <title>Crumb Bakery</title>
      <h1 className="text-5xl font-bold text-amber-900">Crumb Bakery</h1>
      <p className="mt-4 text-lg text-amber-800">Fresh bread every morning</p>
      <a href="#order" className="mt-6 inline-block rounded bg-amber-700 px-4 py-2 text-white">Order now</a>
    </main>
  )
}
`

/** A small prompt-built site, as `GET /sites/{projectId}` returns its files. */
export const SITE_FILES = {
  '.makable/manifest.json': JSON.stringify({ format: 'makable-site', version: 2, projectId: PROJECT_ID }, null, 2) + '\n',
  'index.html': '<!doctype html>\n<html lang="en">\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n',
  'package.json': JSON.stringify({ name: 'crumb-bakery', private: true, type: 'module', dependencies: { react: '^19.2.8', 'react-dom': '^19.2.8' } }, null, 2) + '\n',
  'src/main.tsx':
    "import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport { App } from './App'\nimport './index.css'\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n)\n",
  'src/index.css': '@import "tailwindcss";\n\nbody {\n  margin: 0;\n  font-family: ui-sans-serif, system-ui, sans-serif;\n}\n',
  'src/App.tsx': APP_TSX,
}

export const siteRead = (over = {}) => ({
  projectId: PROJECT_ID,
  name: 'Crumb Bakery',
  repoName: 'crumb-bakery',
  repoUrl: REPO_URL,
  updatedAt: '2026-10-15T10:00:00Z',
  ...over,
})

/**
 * The user's sites and their files: `sites` lists them, `files`/`commit` are the one site's on GitHub. Saves of the
 * user's edits are recorded and make a new commit, like the backend; a save on an old commit is a conflict.
 */
export function fakeSites({ exists = true } = {}) {
  const state = {
    /** False: no session (a guest). */
    signedIn: true,
    /** The SPA makes the id of a new site: a creation sets it. */
    projectId: PROJECT_ID,
    sites: exists ? [siteRead()] : [],
    files: exists ? { ...SITE_FILES } : null,
    commit: exists ? sha(1) : null,
    commits: 1,
    saves: [],
    thread: { projectId: PROJECT_ID, status: 'idle', turns: [], run: null },
    /** The site now exists on GitHub with the starter `SITE_FILES` (a creation's last step). */
    create(projectId) {
      state.projectId = projectId
      state.thread.projectId = projectId
      state.sites = [siteRead({ projectId })]
      state.files = { ...SITE_FILES, '.makable/manifest.json': SITE_FILES['.makable/manifest.json'].replace(PROJECT_ID, projectId) }
      state.commit = sha(1)
    },
    /** Makes a new commit with `changes` (null deletes a file). */
    commitChanges(changes) {
      for (const [path, content] of Object.entries(changes)) {
        if (content === null) delete state.files[path]
        else state.files[path] = content
      }
      state.commits += 1
      state.commit = sha(state.commits)
      return state.commit
    },
    turn(over) {
      state.thread.turns.push({ target: null, outcome: 'applied', questions: [], commitSha: state.commit, createdAt: new Date().toISOString(), ...over })
    },
  }
  return state
}

/** Answers the routes every script needs: the session, the sites and their files, the thread. Null for others. */
export function siteAnswer(state, method, path, body) {
  if (!state.signedIn && (path === '/auth/session' || path === '/auth/refresh')) return fail(401, 'unauthorized', 'Sign in first')
  if (path === '/auth/session') return ok({ user: USER })
  if (method === 'GET' && path === '/sites') return ok(state.sites)
  if (method === 'GET' && path === `/sites/${state.projectId}`) {
    if (!state.files) return fail(404, 'site_not_found', 'No such site')
    return ok({ site: state.sites[0], commitSha: state.commit, files: state.files, binary: [] })
  }
  if (method === 'PUT' && path === `/sites/${state.projectId}/files`) {
    state.saves.push(body)
    if (body.baseCommit !== state.commit) return fail(409, 'site_conflict', 'Changed elsewhere', { commitSha: state.commit })
    return ok({ commitSha: state.commitChanges({ ...body.files, ...Object.fromEntries(body.deletes.map((p) => [p, null])) }), changed: true })
  }
  if (method === 'GET' && path === `/ai/threads/${state.projectId}`) {
    if (!state.files && state.thread.turns.length === 0 && !state.thread.run) return fail(404, 'site_not_found', 'No such site')
    return ok(state.thread)
  }
  if (method === 'GET' && path === '/ai/models') return ok([{ keyId: null, provider: null, model: 'makable-default', acceptsImages: false }])
  if (method === 'GET' && path === '/ai/keys') return ok([])
  return null
}

/**
 * Headless Chromium: `CHROME_PATH` when set, else the headless shell of this `playwright-core` version, installed with
 * `bun x playwright-core install --only-shell chromium` (Playwright finds the revision it was built for).
 */
export async function launch() {
  return chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
}

/** Sends `/api/v1` to `answer(method, path, body, query)`; anything it doesn't answer is a 404 from the fake. */
export async function routeBackend(page, answer) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const body = request.postData() ? JSON.parse(request.postData()) : null
    const path = url.pathname.replace('/api/v1', '')
    const reply = (await answer(request.method(), path, body, url.searchParams)) ?? fail(404, 'not_found', `fake backend: no route for ${request.method()} ${path}`)
    if (reply.ndjson !== undefined) return route.fulfill({ status: reply.status, contentType: 'application/x-ndjson', body: reply.ndjson })
    if (reply.status === 204) return route.fulfill({ status: 204 })
    await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) })
  })
}

/**
 * Page errors and console errors, but not the error answers the fake gives on purpose. Set `errors.expected` while a
 * step breaks the preview on purpose: the preview's bundler logs the broken code.
 */
export function watchErrors(page) {
  const errors = []
  errors.expected = false
  page.on('pageerror', (e) => {
    // Switching files in the code editor cancels Monaco's work in flight; Monaco handles that rejection a moment
    // later, but the browser has already reported it.
    if (errors.expected || (e.message === 'Canceled' && e.stack?.includes('monaco-editor'))) return
    errors.push(`pageerror: ${e.message}`)
  })
  page.on('console', (m) => {
    if (m.type() !== 'error' || errors.expected || /status of (401|404|409|422|429|502)/.test(m.text())) return
    errors.push(`console: ${m.text()}`)
  })
  return errors
}

export const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}

// The preview may draw a wide page with CSS zoom (Desktop is 1280px, zoomed to fit the pane). Playwright's
// clicks and boxes inside an iframe ignore that zoom, so measure and click with the real mouse instead.
export async function previewBox(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  const r = await locator.evaluate((el) => {
    const b = el.getBoundingClientRect()
    return { x: b.x, y: b.y, width: b.width, height: b.height }
  })
  const f = await page.locator('iframe[title="Site preview"]').evaluate((el) => {
    const b = el.getBoundingClientRect()
    const z = Number.parseFloat(getComputedStyle(el).zoom) || 1
    return { x: b.x + el.clientLeft * z, y: b.y + el.clientTop * z, z }
  })
  return { x: f.x + r.x * f.z, y: f.y + r.y * f.z, width: r.width * f.z, height: r.height * f.z }
}

export async function clickInPreview(page, locator) {
  const b = await previewBox(page, locator)
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
}
