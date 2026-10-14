import type { AnalyticsEvents } from './events'

/** What counts as clickable. Plain text, inputs and textareas are left alone (their values are never read). */
const CLICKABLE = [
  'button',
  'a[href]',
  'summary',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="submit"]',
  'input[type="button"]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[data-analytics]',
].join(',')
const LANDMARKS = 'header, nav, main, aside, footer, form, section, [role="dialog"], [role="menu"]'
const MAX_LABEL = 100

/**
 * Tracks every click on a button, link, tab or menu item as `ui_click`, so new buttons are covered without code.
 * Opt out with `data-analytics-ignore` on the element or an ancestor. Name a click target with
 * `data-analytics="<id>"` and a screen area with `data-analytics-section="<name>"`.
 * Clicks inside the preview iframe aren't seen here: the preview reports those itself.
 */
export function startAutocapture(onClick: (props: AnalyticsEvents['ui_click']) => void, root: Document = document): () => void {
  const listener = (event: MouseEvent) => {
    const props = describeClick(event)
    if (props) onClick(props)
  }
  // Capture phase: still seen when a handler stops propagation or the element unmounts on click.
  root.addEventListener('click', listener, true)
  return () => root.removeEventListener('click', listener, true)
}

export function describeClick(event: Pick<MouseEvent, 'target' | 'clientX' | 'clientY'>): AnalyticsEvents['ui_click'] | null {
  const start = event.target instanceof Element ? event.target : null
  const el = start?.closest(CLICKABLE)
  if (!el || el.closest('[data-analytics-ignore]')) return null
  const view = el.ownerDocument.defaultView
  return {
    label: labelOf(el),
    element: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    analytics_id: el.getAttribute('data-analytics'),
    href: hrefOf(el),
    section: sectionOf(el),
    disabled: el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true',
    x: Math.round(event.clientX),
    y: Math.round(event.clientY),
    viewport_width: view?.innerWidth ?? 0,
    viewport_height: view?.innerHeight ?? 0,
  }
}

/** The name a person would read: an explicit label, then the visible text, then the icon's name. */
export function labelOf(el: Element): string {
  const explicit = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? labelledBy(el)
  const text = explicit ?? collapse(el.textContent ?? '')
  if (text) return truncate(text)
  // lucide icons carry their name as a class, e.g. `lucide lucide-undo-2`.
  const icon = [...(el.querySelector('svg')?.classList ?? [])].find((c) => c.startsWith('lucide-'))
  if (icon) return `icon:${icon.slice('lucide-'.length)}`
  return el.getAttribute('data-analytics') ?? el.tagName.toLowerCase()
}

function labelledBy(el: Element): string | null {
  const ids = el.getAttribute('aria-labelledby')
  if (!ids) return null
  const text = ids
    .split(/\s+/)
    .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
    .join(' ')
  return collapse(text) || null
}

function sectionOf(el: Element): string | null {
  const named = el.closest('[data-analytics-section]')?.getAttribute('data-analytics-section')
  if (named) return named
  const landmark = el.parentElement?.closest(LANDMARKS)
  if (!landmark) return null
  const name = landmark.getAttribute('aria-label') ?? landmark.id
  const tag = landmark.getAttribute('role') ?? landmark.tagName.toLowerCase()
  return name ? `${tag}:${truncate(name)}` : tag
}

/** Links without their query or hash, which can hold tokens or personal data. */
function hrefOf(el: Element): string | null {
  const href = el.getAttribute('href')
  if (!href) return null
  try {
    const url = new URL(href, el.ownerDocument.baseURI)
    return url.protocol === 'http:' || url.protocol === 'https:' ? `${url.origin}${url.pathname}` : url.protocol
  } catch {
    return null
  }
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()
const truncate = (text: string) => (text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text)
