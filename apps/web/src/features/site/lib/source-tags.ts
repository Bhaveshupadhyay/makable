import { parse } from '@babel/parser'

// The preview tags every element with where it's written in the code: `data-src="<path>:<line>:<column>"` (line from
// 1, column from 0, at the element's `<`). A click in the preview then points at the source, for AI edits (the server
// finds the code there) and text edits (patched in place). Only the preview's copy is tagged, never the site's files.

export const SOURCE_ATTR = 'data-src'

/** Elements whose tag isn't drawn on the page, so there's nothing to click. */
const UNDRAWN = new Set(['html', 'head', 'meta', 'link', 'title', 'base', 'script', 'style', 'noscript', 'template'])

/** The site's files with their markup tagged. A file that doesn't parse is left as it is (the preview shows why). */
export function tagSources(files: Record<string, string>): Record<string, string> {
  const tagged: Record<string, string> = {}
  for (const [path, code] of Object.entries(files)) {
    tagged[path] = /\.(tsx|jsx)$/.test(path) ? tagJsx(path, code) : /\.html?$/.test(path) ? tagHtml(path, code) : code
  }
  return tagged
}

/** A `data-src` value split back into its parts, or null when it isn't one. */
export function parseSource(value: string | null | undefined): { path: string; line: number; column: number } | null {
  const match = value ? /^(.+):(\d+):(\d+)$/.exec(value) : null
  return match ? { path: match[1], line: Number(match[2]), column: Number(match[3]) } : null
}

type Node = { type?: string; start?: number | null; end?: number | null; loc?: { start: { line: number; column: number } } | null }

/** Host elements (lowercase tags) in JSX: components would have to pass the attribute on, so they're left alone. */
export function tagJsx(path: string, code: string): string {
  let ast: unknown
  try {
    ast = parse(code, { sourceType: 'module', plugins: path.endsWith('.tsx') ? ['jsx', 'typescript'] : ['jsx'] })
  } catch {
    return code
  }
  const inserts: { at: number; text: string }[] = []
  walk(ast, (node) => {
    if (node.type !== 'JSXOpeningElement') return
    const opening = node as Node & { name: Node & { name?: string }; attributes: (Node & { name?: { name?: string } })[] }
    if (opening.name.type !== 'JSXIdentifier' || !/^[a-z]/.test(opening.name.name ?? '')) return
    if (UNDRAWN.has(opening.name.name ?? '')) return
    if (opening.attributes.some((a) => a.type === 'JSXAttribute' && a.name?.name === SOURCE_ATTR)) return
    const start = opening.loc?.start
    if (start == null || opening.name.end == null) return
    inserts.push({ at: opening.name.end, text: ` ${SOURCE_ATTR}="${path}:${start.line}:${start.column}"` })
  })
  return insert(code, inserts)
}

/** Start tags in HTML (outside comments, scripts and styles). */
export function tagHtml(path: string, code: string): string {
  const inserts: { at: number; text: string }[] = []
  for (const tag of startTags(code)) {
    if (UNDRAWN.has(tag.name) || tag.name === 'body') continue
    const { line, column } = position(code, tag.start)
    inserts.push({ at: tag.nameEnd, text: ` ${SOURCE_ATTR}="${path}:${line}:${column}"` })
  }
  return insert(code, inserts)
}

/** Every start tag in an HTML document: its name (lowercase), where its `<` is, and where its name ends. */
export function startTags(code: string): { name: string; start: number; nameEnd: number }[] {
  const tags = []
  const pattern = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)|<([a-zA-Z][a-zA-Z0-9-]*)/g
  for (const match of code.matchAll(pattern)) {
    const name = (match[2] ?? match[1])?.toLowerCase()
    if (!name || match[0].startsWith('<!--')) continue
    tags.push({ name, start: match.index, nameEnd: match.index + 1 + name.length })
  }
  return tags
}

export function position(code: string, offset: number): { line: number; column: number } {
  const before = code.slice(0, offset)
  const line = before.split('\n').length
  return { line, column: offset - (before.lastIndexOf('\n') + 1) }
}

/** The offset of a line and column (as in `data-src`), or -1 past the end. */
export function offsetOf(code: string, line: number, column: number): number {
  let offset = 0
  for (let l = 1; l < line; l++) {
    const next = code.indexOf('\n', offset)
    if (next === -1) return -1
    offset = next + 1
  }
  return offset + column
}

function insert(code: string, inserts: { at: number; text: string }[]): string {
  let out = code
  for (const { at, text } of inserts.sort((a, b) => b.at - a.at)) out = out.slice(0, at) + text + out.slice(at)
  return out
}

export function walk(node: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (!node || typeof node !== 'object') return
  const n = node as Node
  if (typeof n.type === 'string') visit(n)
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'leadingComments' && key !== 'trailingComments' && value && typeof value === 'object') walk(value, visit)
  }
}
