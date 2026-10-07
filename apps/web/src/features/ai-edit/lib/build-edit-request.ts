import {
  type AiEditFile,
  type AiEditRequest,
  type AiEditTarget,
  aiEditRequestSchema,
  MAX_FILE_CHARS,
  MAX_FILES,
  SAFE_REPO_PATH,
  type TemplateEntry,
} from '@makable/shared'

const CODE = /\.(tsx|jsx|ts|js|mjs|html|css)$/
const MAX_MATCHED = 2
const MAX_IMPORTED = 2

type Template = Pick<TemplateEntry, 'id' | 'name' | 'kind' | 'version' | 'contentPath'>

/**
 * The request body for `POST /api/ai/edit`: the instruction, the selection and the files most
 * likely to change. Validated here too, so oversized input fails before sending.
 */
export function buildEditRequest(instruction: string, target: AiEditTarget | null, template: Template, files: Record<string, string>): AiEditRequest {
  const fileTree = Object.keys(files).filter((path) => SAFE_REPO_PATH.test(path)).sort()
  return aiEditRequestSchema.parse({
    instruction,
    target,
    template: { id: template.id, name: template.name, kind: template.kind, version: template.version, contentPath: template.contentPath },
    fileTree: fileTree.slice(0, 500),
    files: pickFiles(files, target, template.contentPath),
  })
}

/**
 * Picks the files to send with the request: the source files that best match the selected
 * element (by its content path, id, classes and text, rarer clues counting more), the main
 * stylesheet and the content file. Without a selection, the entry file instead.
 */
export function pickFiles(files: Record<string, string>, target: AiEditTarget | null, contentPath: string): AiEditFile[] {
  const fits = (path: string) => SAFE_REPO_PATH.test(path) && files[path].length <= MAX_FILE_CHARS
  const code = Object.keys(files).filter((path) => CODE.test(path) && path !== contentPath && fits(path)).sort()
  const picked: AiEditFile[] = []

  const matched = target ? rank(files, code, clues(target)).slice(0, MAX_MATCHED) : []
  for (const { path, reason } of matched) picked.push({ path, content: files[path], reason })
  // The components a matched file uses (e.g. a shared <Section>), so the model sees their props.
  const imported = matched.flatMap(({ path }) => localImports(path, files[path]).map((dep) => ({ dep, from: path })))
  for (const { dep, from } of imported) {
    if (picked.length >= matched.length + MAX_IMPORTED) break
    if (code.includes(dep) && !picked.some((f) => f.path === dep)) picked.push({ path: dep, content: files[dep], reason: `imported by ${from}` })
  }
  if (picked.length === 0) {
    const entry = ['src/App.tsx', 'src/App.jsx', 'index.html', 'main.js'].find((path) => code.includes(path))
    if (entry) picked.push({ path: entry, content: files[entry], reason: target ? 'entry file (nothing matched the selection)' : 'entry file' })
  }
  const css = code.filter((path) => path.endsWith('.css'))
  const stylesheet = css.find((path) => /(^|\/)(index|styles?|main|global)\.css$/.test(path)) ?? css[0]
  if (stylesheet && !picked.some((f) => f.path === stylesheet)) {
    picked.push({ path: stylesheet, content: files[stylesheet], reason: 'main stylesheet (theme colours, fonts)' })
  }
  if (contentPath in files && fits(contentPath)) picked.push({ path: contentPath, content: files[contentPath], reason: 'content file: all copy lives here' })
  return picked.slice(0, MAX_FILES)
}

const SCRIPT_EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.js']

/** Relative imports of a script, resolved to repo paths (extension guessed), in source order. */
function localImports(path: string, source: string): string[] {
  if (!/\.(m?[jt]sx?)$/.test(path)) return []
  const dir = path.split('/').slice(0, -1)
  const found: string[] = []
  for (const [, spec] of source.matchAll(/(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const parts = [...dir]
    for (const segment of spec.split('/')) {
      if (segment === '..') parts.pop()
      else if (segment !== '.') parts.push(segment)
    }
    const base = parts.join('/')
    if (!/\.css$/.test(base)) found.push(...SCRIPT_EXTENSIONS.map((ext) => base + ext))
  }
  return found
}

type Clue = { text: string; weight: number; label: string }

function clues(target: AiEditTarget): Clue[] {
  const list: Clue[] = []
  // `skills.2` → components build these paths as `skills.${i}` or `"skills." + i`.
  const root = target.contentPath?.split('.')[0]
  if (root) list.push({ text: `${root}.`, weight: 3, label: `renders ${root}` })
  const tag = /^<[^>]*>/.exec(target.html)?.[0] ?? ''
  const id = /\sid="([^"]+)"/.exec(tag)?.[1]
  if (id) list.push({ text: id, weight: 3, label: `id "${id}"` })
  if (target.section?.id && target.section.id !== id) list.push({ text: target.section.id, weight: 2, label: `section "${target.section.id}"` })
  const classes = /\sclass="([^"]+)"/.exec(tag)?.[1].split(/\s+/).filter((c) => c.length > 2) ?? []
  for (const c of new Set(classes)) list.push({ text: c, weight: 1, label: `class "${c}"` })
  // Hard-coded text (headings, button labels). Copy from the content file won't match here.
  if (target.text && target.text.length <= 60) list.push({ text: target.text, weight: 3, label: `text "${target.text}"` })
  return list
}

function rank(files: Record<string, string>, paths: string[], list: Clue[]): { path: string; reason: string }[] {
  // A clue found in every file says nothing; one found in a single file says a lot.
  const idf = list.map((clue) => {
    const df = paths.filter((path) => files[path].includes(clue.text)).length
    return df === 0 ? 0 : Math.log(1 + paths.length / df)
  })
  return paths
    .map((path) => {
      const hits = list.flatMap((clue, i) => (idf[i] > 0 && files[path].includes(clue.text) ? [{ clue, score: clue.weight * idf[i] }] : []))
      hits.sort((a, b) => b.score - a.score)
      return { path, score: hits.reduce((sum, h) => sum + h.score, 0), reason: `matches the selection: ${hits.slice(0, 3).map((h) => h.clue.label).join(', ')}` }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
}

/** Short label for a selection, e.g. `Skills › skills.0 “TypeScript”`. */
export function targetLabel(target: AiEditTarget): string {
  const section = target.section && (target.section.heading || target.section.id || target.section.tag)
  const element = target.contentPath ?? `<${target.tag}>`
  const text = target.text && target.text.length <= 40 ? ` “${target.text}”` : ''
  return [section, element].filter(Boolean).join(' › ') + text
}
