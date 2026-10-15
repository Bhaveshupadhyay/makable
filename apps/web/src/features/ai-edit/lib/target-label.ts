import type { AiEditTarget } from '@makable/shared'

/** Short label for a selection, e.g. `Menu › <li> “Croissant”`. */
export function targetLabel(target: AiEditTarget): string {
  const section = target.section && (target.section.heading || target.section.id || target.section.tag)
  const text = target.text && target.text.length <= 40 ? ` “${target.text}”` : ''
  return [section, `<${target.tag}>`].filter(Boolean).join(' › ') + text
}
