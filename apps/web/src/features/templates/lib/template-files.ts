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
 * pointed at `assetBase`, the hosted demo folder that serves the same files.
 */
export function parseTemplateFiles(raw: unknown, assetBase: string): TemplateFiles {
  if (!isRecord(raw)) throw new Error('Template files must be a JSON object')
  const { binary = {}, ...text } = raw
  const binaryPaths = new Set(isRecord(binary) ? Object.keys(binary).filter((path) => SAFE_REPO_PATH.test(path)) : [])

  const files: TemplateFiles = {}
  for (const [path, code] of Object.entries(text)) {
    if (!SAFE_REPO_PATH.test(path)) throw new Error(`Unsafe template path: ${path}`)
    if (typeof code !== 'string') throw new Error(`Template file is not text: ${path}`)
    files[path] = binaryPaths.size ? pointAtHostedAssets(path, code, binaryPaths, assetBase) : code
  }
  return files
}

function pointAtHostedAssets(path: string, code: string, binaryPaths: Set<string>, assetBase: string) {
  return code.replace(REFERENCE, (match, open: string, ref: string) => {
    if (ABSOLUTE.test(ref)) return match
    const resolved = resolveReference(ref, path)
    return resolved && binaryPaths.has(resolved) ? open + new URL(resolved, assetBase).href : match
  })
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
