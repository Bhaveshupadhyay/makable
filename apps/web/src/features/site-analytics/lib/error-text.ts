import { ApiError } from '@/shared/lib/api-client'

/** What `?analyticsError=<code>` means, after Google sent the browser back. */
export function connectErrorText(code: string): string {
  switch (code) {
    case 'google_denied':
      return 'Google Analytics wasn’t connected: access was declined on Google’s page.'
    case 'google_scope_missing':
      return 'Tick “See your Google Analytics data” on Google’s page so makable can show your traffic.'
    case 'invalid_state':
      return 'That connection attempt expired or came from another tab. Try connecting again.'
    case 'service_busy':
      return 'makable was too busy to connect Google Analytics just then. Try connecting again in a moment.'
    default:
      return 'Google Analytics couldn’t be connected. Try again in a moment.'
  }
}

/** The backend's messages are written for users; anything else means the request never got an answer. */
export function errorText(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Connect GitHub again.'
    if (error.code) return error.message
  }
  return 'Couldn’t reach the server. Check your connection and try again.'
}

export function errorCode(error: unknown): string | null {
  return error instanceof ApiError ? (error.code ?? null) : null
}
