const PENDING_PROMPT_KEY = 'makable:pending-prompt'

const listeners = new Set<() => void>()
// Also kept here for a browser that blocks storage (the prompt then doesn't outlive a reload).
let held: string | null = null

/**
 * Remembers a prompt waiting to be built, across the GitHub sign-in redirect, a trip to Settings for an API key or a
 * reload (null forgets it).
 */
export function savePendingPrompt(text: string | null) {
  held = text || null
  try {
    if (text) sessionStorage.setItem(PENDING_PROMPT_KEY, text)
    else sessionStorage.removeItem(PENDING_PROMPT_KEY)
  } catch {
    // Storage blocked: `held` has it until the page goes.
  }
  for (const listener of listeners) listener()
}

/** The prompt waiting to be built (for a sign-in, or an AI model), left in place until it's built or dropped. */
export function readPendingPrompt(): string | null {
  try {
    return sessionStorage.getItem(PENDING_PROMPT_KEY)
  } catch {
    return held
  }
}

export function subscribePendingPrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
