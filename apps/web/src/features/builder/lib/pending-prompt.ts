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

/** Remembers, across the GitHub sign-in redirect, what a guest asked for on the landing page (null forgets it). */
export function savePendingPrompt(text: string | null) {
  keep(PENDING_PROMPT_KEY, text)
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
