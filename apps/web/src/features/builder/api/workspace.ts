import type { SessionSnapshot } from '@makable/shared'
import { ApiError, backendFetch } from '@/shared/lib/api-client'

// The user's private `makable-workspace` repo on GitHub, through makable-backend (which holds the token).

/** A saved session as the backend returns it. The snapshot is validated by the caller (`parseSession`). */
export type WorkspaceSession = { snapshot: unknown; sha: string }
export type WorkspaceSaved = { sha: string; repoUrl: string }

/** The newest saved session of any of the user's sites, or null when nothing is saved yet. */
export function getLatestSession(): Promise<WorkspaceSession | null> {
  return orNullIfMissing(backendFetch<WorkspaceSession>('/workspace/sessions/latest'))
}

export function getSession(projectId: string): Promise<WorkspaceSession | null> {
  return orNullIfMissing(backendFetch<WorkspaceSession>(`/workspace/sessions/${projectId}`))
}

/**
 * Saves the session. `baseSha` is the version it replaces (null for the first save from here); if the
 * saved file changed since, the backend answers 409 `workspace_conflict` and nothing is overwritten.
 * `keepalive` lets the request finish after the page closes (bodies up to about 64 KB).
 */
export function saveSession(snapshot: SessionSnapshot, baseSha: string | null, { keepalive = false } = {}): Promise<WorkspaceSaved> {
  return backendFetch<WorkspaceSaved>(`/workspace/sessions/${snapshot.projectId}`, {
    method: 'PUT',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot, baseSha }),
  })
}

async function orNullIfMissing<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request
  } catch (e) {
    if (e instanceof ApiError && e.code === 'workspace_session_not_found') return null
    throw e
  }
}
