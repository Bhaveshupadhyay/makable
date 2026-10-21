const PENDING_PROMPT_KEY = 'makable:pending-prompt'

/** Remembers, across the GitHub sign-in redirect, what a guest asked for on the landing page (null forgets it). */
export function savePendingPrompt(text: string | null) {
  try {
    if (text) sessionStorage.setItem(PENDING_PROMPT_KEY, text)
    else sessionStorage.removeItem(PENDING_PROMPT_KEY)
  } catch {
    // Storage blocked: they pick it again after signing in.
  }
}

/** The prompt saved before signing in, left in place (a guest's chat shows it until they sign in). */
export function readPendingPrompt(): string | null {
  try {
    return sessionStorage.getItem(PENDING_PROMPT_KEY)
  } catch {
    return null
  }
}

/** The prompt saved before signing in, once. */
export function takePendingPrompt(): string | null {
  try {
    const text = sessionStorage.getItem(PENDING_PROMPT_KEY)
    sessionStorage.removeItem(PENDING_PROMPT_KEY)
    return text
  } catch {
    return null
  }
}
