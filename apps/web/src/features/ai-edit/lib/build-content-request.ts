import { type AiContentRequest, type AiEditTarget, aiContentRequestSchema, type ContentOp, type Portfolio } from '@makable/shared'

/** The request body for `POST /api/ai/content`. Validated here too, so oversized input fails before sending. */
export function buildContentRequest(instruction: string, target: AiEditTarget | null, portfolio: Portfolio): AiContentRequest {
  return aiContentRequestSchema.parse({
    instruction,
    selection: target && {
      path: target.contentPath,
      text: target.text,
      section: target.section && (target.section.heading || target.section.id || target.section.tag),
    },
    portfolio,
  })
}

/** Short label for a selection, e.g. `Skills › skills.0 “TypeScript”`. */
export function targetLabel(target: AiEditTarget): string {
  const section = target.section && (target.section.heading || target.section.id || target.section.tag)
  const element = target.contentPath ?? `<${target.tag}>`
  const text = target.text && target.text.length <= 40 ? ` “${target.text}”` : ''
  return [section, element].filter(Boolean).join(' › ') + text
}

/** One line per op, for the inspector. */
export function describeOp(op: ContentOp): string {
  switch (op.op) {
    case 'set':
      return `set ${op.path} = ${JSON.stringify(op.value)}`
    case 'remove':
      return `remove ${op.path}`
    case 'insert':
      return `insert into ${op.path}${op.index === undefined ? '' : ` at ${op.index}`}: ${JSON.stringify(typeof op.value === 'string' ? op.value : op.value.name)}`
    case 'move':
      return `move ${op.path} to ${op.to}`
  }
}
