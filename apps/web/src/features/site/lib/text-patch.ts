import { parse } from '@babel/parser'
import { offsetOf, startTags, walk } from './source-tags'

// "Edit text" in the preview changes the site's source: the element's `data-src` says where it's written, and its
// text is replaced there, as long as it's plain text in the code (not a variable, a prop or a mix with other tags).

export type TextPatch = { ok: true; code: string } | { ok: false; error: string }

const FROM_CODE = "This text comes from the code (a variable or a list), so it can't be edited here. Ask the AI to change it."
const MOVED = 'This text has changed since the preview was drawn. Try again in a moment.'

/** Replaces the text of the element written at `line`:`column` of `path` with `text`. */
export function patchText(path: string, code: string, line: number, column: number, oldText: string, text: string): TextPatch {
  if (/\.(tsx|jsx)$/.test(path)) return patchJsx(path, code, line, column, oldText, text)
  if (/\.html?$/.test(path)) return patchHtml(code, line, column, oldText, text)
  return { ok: false, error: FROM_CODE }
}

type Located = { type: string; start: number; end: number; loc: { start: { line: number; column: number } } }
type JsxText = Located & { value: string }
type JsxElement = Located & { openingElement: Located; children: Located[] }

function patchJsx(path: string, code: string, line: number, column: number, oldText: string, text: string): TextPatch {
  let ast: unknown
  try {
    ast = parse(code, { sourceType: 'module', plugins: path.endsWith('.tsx') ? ['jsx', 'typescript'] : ['jsx'] })
  } catch {
    return { ok: false, error: "This file doesn't parse right now, so its text can't be edited." }
  }
  let element: JsxElement | null = null
  walk(ast, (node) => {
    const el = node as unknown as JsxElement
    const at = el.openingElement?.loc?.start
    if (node.type === 'JSXElement' && at?.line === line && at.column === column) element = el
  })
  if (element === null) return { ok: false, error: MOVED }
  const children = (element as JsxElement).children
  const texts = children.filter((c): c is JsxText => c.type === 'JSXText')
  const others = children.filter((c) => c.type !== 'JSXText' && !isEmptyExpression(c))
  if (texts.length === 0 || others.length > 0) return { ok: false, error: FROM_CODE }
  if (normalize(texts.map((t) => t.value).join(' ')) !== normalize(oldText)) return { ok: false, error: MOVED }
  const first = texts[0]
  const last = texts[texts.length - 1]
  const raw = code.slice(first.start, last.end)
  const lead = /^\s*/.exec(raw)?.[0] ?? ''
  const trail = /\s*$/.exec(raw)?.[0] ?? ''
  const value = /[{}<>]/.test(text) ? `{${JSON.stringify(text)}}` : text
  return { ok: true, code: code.slice(0, first.start) + lead + value + trail + code.slice(last.end) }
}

function isEmptyExpression(node: Located): boolean {
  return node.type === 'JSXExpressionContainer' && (node as Located & { expression: Located }).expression.type === 'JSXEmptyExpression'
}

function patchHtml(code: string, line: number, column: number, oldText: string, text: string): TextPatch {
  const at = offsetOf(code, line, column)
  const tag = startTags(code).find((t) => t.start === at)
  if (!tag) return { ok: false, error: MOVED }
  const open = code.indexOf('>', tag.nameEnd)
  if (open === -1) return { ok: false, error: MOVED }
  const close = closingTag(code, tag.name, open + 1)
  if (close === -1) return { ok: false, error: FROM_CODE }
  const inner = code.slice(open + 1, close)
  if (inner.includes('<')) return { ok: false, error: FROM_CODE }
  if (normalize(decodeHtml(inner)) !== normalize(oldText)) return { ok: false, error: MOVED }
  const lead = /^\s*/.exec(inner)?.[0] ?? ''
  const trail = /\s*$/.exec(inner)?.[0] ?? ''
  return { ok: true, code: code.slice(0, open + 1) + lead + encodeHtml(text) + trail + code.slice(close) }
}

/** Where the element's closing tag starts, skipping nested elements with the same name; -1 when there's none. */
function closingTag(code: string, name: string, from: number): number {
  const pattern = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi')
  pattern.lastIndex = from
  let depth = 0
  for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
    if (match[1] === '/') {
      if (depth === 0) return match.index
      depth--
    } else if (!match[0].endsWith('/>')) {
      depth++
    }
  }
  return -1
}

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()

function encodeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function decodeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}
