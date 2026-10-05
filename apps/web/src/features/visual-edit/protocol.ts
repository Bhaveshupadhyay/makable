// postMessage protocol between the builder (host) and the edit shim in the preview iframe.
// Keep in sync with shim/edit-shim.js, which can't import this file.

export const HOST_SOURCE = 'makable-host'
export const SHIM_SOURCE = 'makable-shim'

/** Host → shim. */
export type HostMessage = { source: typeof HOST_SOURCE; type: 'mode'; enabled: boolean }

/** Shim → host. `ready` is sent on every page load so the host can resend the mode. */
export type ShimMessage =
  | { source: typeof SHIM_SOURCE; type: 'ready' }
  | { source: typeof SHIM_SOURCE; type: 'edit'; path: string; value: string }

/** Narrows untrusted `MessageEvent.data` to a shim message, or null. */
export function parseShimMessage(data: unknown): ShimMessage | null {
  if (typeof data !== 'object' || data === null) return null
  const msg = data as Record<string, unknown>
  if (msg.source !== SHIM_SOURCE) return null
  if (msg.type === 'ready') return { source: SHIM_SOURCE, type: 'ready' }
  if (msg.type === 'edit' && typeof msg.path === 'string' && typeof msg.value === 'string') {
    return { source: SHIM_SOURCE, type: 'edit', path: msg.path, value: msg.value }
  }
  return null
}
