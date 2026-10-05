import { loadSandpackClient, type SandboxSetup, type SandpackClient } from '@codesandbox/sandpack-client'
import type { PreviewEngine, PreviewOptions, PreviewState, ProjectFiles } from './types'

// Tailwind compiles in the browser for the preview only; production uses @tailwindcss/vite.
const TAILWIND_BROWSER = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4'
const ENTRY = '/src/main.tsx'
// Injected files live under a reserved folder so they can't clash with project files.
const INJECT_DIR = '__makable'

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`

/** Plain HTML/CSS/JS project: a root `index.html` and no React entry. */
export function isStaticProject(files: ProjectFiles) {
  return 'index.html' in files && !(ENTRY.slice(1) in files)
}

/** Adapts a project to Sandpack's browser bundler: static file serving, or a CRA-style React environment. */
export function toSandboxSetup(files: ProjectFiles, { injectedScript }: PreviewOptions = {}): SandboxSetup {
  if (isStaticProject(files)) {
    const staticFiles: SandboxSetup['files'] = Object.fromEntries(
      Object.entries(files).map(([path, code]) => [`/${path}`, { code }]),
    )
    if (injectedScript) {
      const src = `/${INJECT_DIR}/inject.js`
      staticFiles[src] = { code: injectedScript }
      const html = staticFiles['/index.html'].code
      const tag = `<script src="${src}"></script>`
      staticFiles['/index.html'] = { code: html.includes('</body>') ? html.replace('</body>', `${tag}\n</body>`) : html + tag }
    }
    return { files: staticFiles, entry: '/index.html', template: 'static' }
  }

  const pkg = JSON.parse(files['package.json'] ?? '{}') as { dependencies?: Record<string, string> }
  // With an injected script, a wrapper entry loads it before the project's own entry.
  const entry = injectedScript ? `/src/${INJECT_DIR}/entry.js` : ENTRY
  const bundlerFiles: SandboxSetup['files'] = {
    '/public/index.html': { code: INDEX_HTML },
    '/package.json': { code: JSON.stringify({ main: entry, dependencies: pkg.dependencies ?? {} }) },
  }
  if (injectedScript) {
    bundlerFiles[`/src/${INJECT_DIR}/inject.js`] = { code: injectedScript }
    bundlerFiles[entry] = { code: `import './inject.js'\nimport '..${ENTRY.slice('/src'.length)}'\n` }
  }
  for (const [path, code] of Object.entries(files)) {
    if (!path.startsWith('src/')) continue
    // `@import "tailwindcss"` only resolves in the Vite build; the browser build replaces it.
    bundlerFiles[`/${path}`] = { code: path.endsWith('.css') ? code.replace(/^@import ["']tailwindcss["'];?\s*$/m, '') : code }
  }
  return { files: bundlerFiles, dependencies: pkg.dependencies, entry, template: 'create-react-app-typescript' }
}

export class SandpackEngine implements PreviewEngine {
  private files: ProjectFiles = {}
  private options: PreviewOptions = {}
  private client: SandpackClient | null = null
  private destroyed = false
  private listeners = new Set<(state: PreviewState) => void>()
  private state: PreviewState = { status: 'loading' }

  mount(iframe: HTMLIFrameElement, files: ProjectFiles, options: PreviewOptions = {}) {
    this.files = { ...files }
    this.options = options
    loadSandpackClient(iframe, toSandboxSetup(this.files, this.options), {
      externalResources: isStaticProject(files) ? [] : [TAILWIND_BROWSER],
      showOpenInCodeSandbox: false,
      showErrorScreen: false,
      showLoadingScreen: false,
    })
      .then((client) => {
        if (this.destroyed) return client.destroy()
        this.client = client
        client.listen((msg) => {
          if (msg.type === 'start') this.setState({ status: 'loading' })
          else if (msg.type === 'action' && msg.action === 'show-error') {
            this.setState({
              status: 'error',
              error: { title: msg.title, message: msg.message, path: msg.path || undefined, line: msg.line || undefined },
            })
          } else if (msg.type === 'done' && !msg.compilatonError && this.state.status !== 'error') {
            this.setState({ status: 'ready' })
          }
        })
      })
      .catch((err: unknown) => {
        this.setState({ status: 'error', error: { title: 'Preview failed to start', message: String(err) } })
      })
  }

  update(files: ProjectFiles) {
    const changed =
      Object.keys(files).length !== Object.keys(this.files).length ||
      Object.entries(files).some(([path, code]) => this.files[path] !== code)
    if (!changed) return
    this.files = { ...files }
    this.client?.updateSandbox(toSandboxSetup(this.files, this.options))
  }

  updateFile(path: string, code: string) {
    this.update({ ...this.files, [path]: code })
  }

  refresh() {
    this.setState({ status: 'loading' })
    this.client?.dispatch({ type: 'refresh' })
  }

  subscribe(listener: (state: PreviewState) => void) {
    this.listeners.add(listener)
    listener(this.state)
    return () => void this.listeners.delete(listener)
  }

  destroy() {
    this.destroyed = true
    this.listeners.clear()
    this.client?.destroy()
    this.client = null
  }

  private setState(state: PreviewState) {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }
}
