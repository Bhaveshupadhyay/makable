import { SAFE_REPO_PATH } from '@makable/shared'

/** Repo-relative path → text contents, the same shape as the preview's `ProjectFiles`. */
export type TemplateFiles = Record<string, string>

// Quoted or url(...) references in HTML, CSS and JS, e.g. `src="./assets/a.png"` or `url(../img/bg.png)`.
const REFERENCE = /(["'(])([^"'()\s<>]+)(?=["')])/g
const ABSOLUTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

/**
 * Validates a template's `files.json` and returns its text files.
 *
 * The JSON maps repo paths to contents, plus a `binary` map of base64 images. The preview
 * can only serve text, so binary files are dropped and literal references to them are
 * pointed at `assetBase`, the hosted demo folder that serves the same files. So are
 * folder references (`"./models/"`) to a folder with binary files, which code joins
 * with a file name at runtime (three.js loaders' `setPath`, `setDecoderPath`).
 */
export function parseTemplateFiles(raw: unknown, assetBase: string): TemplateFiles {
  if (!isRecord(raw)) throw new Error('Template files must be a JSON object')
  const { binary = {}, ...text } = raw
  const binaryPaths = new Set(isRecord(binary) ? Object.keys(binary).filter((path) => SAFE_REPO_PATH.test(path)) : [])
  const binaryFolders = new Set([...binaryPaths].flatMap(parentFolders))

  const files: TemplateFiles = {}
  for (const [path, code] of Object.entries(text)) {
    if (!SAFE_REPO_PATH.test(path)) throw new Error(`Unsafe template path: ${path}`)
    if (typeof code !== 'string') throw new Error(`Template file is not text: ${path}`)
    files[path] = binaryPaths.size ? pointAtHostedAssets(path, code, binaryPaths, binaryFolders, assetBase) : code
  }
  return files
}

function pointAtHostedAssets(
  path: string,
  code: string,
  binaryPaths: Set<string>,
  binaryFolders: Set<string>,
  assetBase: string,
) {
  // A URL string in a script resolves against the page, not the script (a built app's
  // `assets/index.js` uses "./images/a.png" for `/images/a.png`). Hand-written scripts
  // sometimes mean their own folder, so that's tried second.
  const bases = /\.[cm]?js$/.test(path) ? ['index.html', path] : [path]
  const isHosted = (resolved: string) =>
    resolved.endsWith('/') ? binaryFolders.has(resolved) : binaryPaths.has(resolved)
  return code.replace(REFERENCE, (match, open: string, ref: string) => {
    if (ABSOLUTE.test(ref)) return match
    const resolved = bases.map((base) => resolveReference(ref, base)).find((r) => r !== undefined && isHosted(r))
    return resolved ? open + new URL(resolved, assetBase).href : match
  })
}

/** `a/b/c.png` → `['a/', 'a/b/']`. */
function parentFolders(path: string): string[] {
  const parts = path.split('/').slice(0, -1)
  return parts.map((_, i) => `${parts.slice(0, i + 1).join('/')}/`)
}

/** Resolves `ref` against the file it appears in, the way the browser would. Most matches are just quoted text. */
function resolveReference(ref: string, path: string): string | undefined {
  try {
    return decodeURIComponent(new URL(ref, `https://template.invalid/${path}`).pathname.slice(1))
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
