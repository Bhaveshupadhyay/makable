import { ApiError } from '@/shared/lib/api-client'

/** The backend's messages are written for users; anything else means the request never got an answer. */
export function errorText(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Connect GitHub again.'
    if (error.code) return error.message
  }
  return "Couldn't reach the server. Check your connection and try again."
}
