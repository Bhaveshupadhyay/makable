const PENDING_PROMPT_KEY = 'makable:pending-prompt'
const NEW_SITE_DRAFT_KEY = 'makable:new-site-draft'

function keep(key: string, text: string | null) {
  try {
    if (text) sessionStorage.setItem(key, text)
    else sessionStorage.removeItem(key)
  } catch {
    // Storage blocked: they type it again.
  }
}

const listeners = new Set<() => void>()
// Also kept here for when storage can't take it (blocked, or full): the prompt then doesn't outlive a reload.
let held: string | null = null
// False when the last save didn't reach storage, which may still have an older prompt: `held` is the one then.
let stored = true

/**
 * Remembers a prompt waiting to be built, across the GitHub sign-in redirect, a trip to Settings for an API key or a
 * reload (null forgets it).
 */
export function savePendingPrompt(text: string | null) {
  held = text || null
  try {
    if (text) sessionStorage.setItem(PENDING_PROMPT_KEY, text)
    else sessionStorage.removeItem(PENDING_PROMPT_KEY)
    stored = true
  } catch {
    stored = false
    // So an older prompt can't come back after a reload either.
    try {
      sessionStorage.removeItem(PENDING_PROMPT_KEY)
    } catch {
      // Blocked: there's nothing in it.
    }
  }
  for (const listener of listeners) listener()
}

/** The prompt waiting to be built (for a sign-in, or an AI model), left in place until it's built or dropped. */
export function readPendingPrompt(): string | null {
  if (!stored) return held
  try {
    return sessionStorage.getItem(PENDING_PROMPT_KEY)
  } catch {
    return held
  }
}

/** The prompt saved before signing in, once. */
export function takePendingPrompt(): string | null {
  const text = readPendingPrompt()
  savePendingPrompt(null)
  return text
}

/** What's typed in `/new`'s box, so it's still there after going to the open site and back (empty forgets it). */
export function saveNewSiteDraft(text: string | null) {
  keep(NEW_SITE_DRAFT_KEY, text)
}

export function readNewSiteDraft(): string {
  try {
    return sessionStorage.getItem(NEW_SITE_DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

export function subscribePendingPrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
