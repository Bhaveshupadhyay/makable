// postMessage protocol between the builder (host) and the edit shim in the preview iframe.
// Keep in sync with shim/edit-shim.js, which can't import this file.

import { type AiEditTarget, aiEditTargetSchema } from '@makable/shared'

export const HOST_SOURCE = 'makable-host'
export const SHIM_SOURCE = 'makable-shim'

/** An element's box in the preview page's viewport (CSS pixels). */
export type ElementRect = { x: number; y: number; width: number; height: number }

/** `text`: click-to-edit copy. `select`: click any element to point an AI edit at it. */
export type ShimMode = 'off' | 'text' | 'select'

/** Host → shim. */
export type HostMessage =
  | { source: typeof HOST_SOURCE; type: 'mode'; mode: ShimMode }
  | { source: typeof HOST_SOURCE; type: 'clear-selection' }
  /** While locked (an AI request is pending), the page ignores clicks but keeps the selection. */
  | { source: typeof HOST_SOURCE; type: 'lock'; locked: boolean }

/** Shim → host. `ready` is sent on every page load so the host can resend the mode. */
export type ShimMessage =
  | { source: typeof SHIM_SOURCE; type: 'ready' }
  | { source: typeof SHIM_SOURCE; type: 'edit'; path: string; value: string }
  /** The element picked in select mode, or null when the selection is cleared. */
  | { source: typeof SHIM_SOURCE; type: 'select'; target: AiEditTarget | null; rect: ElementRect | null }
  /** The selected element moved (scroll, resize, re-render), or left the page (null). */
  | { source: typeof SHIM_SOURCE; type: 'rect'; rect: ElementRect | null }

/** Narrows untrusted `MessageEvent.data` to a shim message, or null. */
export function parseShimMessage(data: unknown): ShimMessage | null {
  if (typeof data !== 'object' || data === null) return null
  const msg = data as Record<string, unknown>
  if (msg.source !== SHIM_SOURCE) return null
  if (msg.type === 'ready') return { source: SHIM_SOURCE, type: 'ready' }
  if (msg.type === 'edit' && typeof msg.path === 'string' && typeof msg.value === 'string') {
    return { source: SHIM_SOURCE, type: 'edit', path: msg.path, value: msg.value }
  }
  if (msg.type === 'select') {
    if (msg.target === null) return { source: SHIM_SOURCE, type: 'select', target: null, rect: null }
    const target = aiEditTargetSchema.safeParse(msg.target)
    return target.success ? { source: SHIM_SOURCE, type: 'select', target: target.data, rect: parseRect(msg.rect) } : null
  }
  if (msg.type === 'rect') return { source: SHIM_SOURCE, type: 'rect', rect: parseRect(msg.rect) }
  return null
}

function parseRect(data: unknown): ElementRect | null {
  if (typeof data !== 'object' || data === null) return null
  const { x, y, width, height } = data as Record<string, unknown>
  const values = [x, y, width, height]
  if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  return { x: x as number, y: y as number, width: Math.max(0, width as number), height: Math.max(0, height as number) }
}
