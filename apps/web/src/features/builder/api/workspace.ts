import { ApiError, backendFetch } from '@/shared/lib/api-client'
import type { SaveBatch } from '../lib/workspace-files'

// The user's private `makable-workspace` repo on GitHub, through makable-backend (which holds the token).
// A session is saved as several files (see `@makable/shared` `session.ts`); a save sends only what changed.

/** A saved state as the backend returns it. Validated by the caller (`workspaceStateSchema`). */
export type SavedState = { state: unknown; sha: string }
export type WorkspaceSaved = { sha: string | null; repoUrl: string }

/** The newest saved state of any of the user's sites, or null when nothing is saved yet. */
export function getLatestState(): Promise<SavedState | null> {
  return orNullIfMissing(backendFetch<SavedState>('/workspace/sessions/latest'))
}

export function getState(projectId: string): Promise<SavedState | null> {
  return orNullIfMissing(backendFetch<SavedState>(`/workspace/sessions/${projectId}`))
}

/** One file of a saved session (`messages/0001.json`, `ai-history/<t>.json`, `files/<t>/<path>`). */
export async function getPart(projectId: string, path: string): Promise<string> {
  const part = await backendFetch<{ path: string; content: string }>(`/workspace/sessions/${projectId}/parts/${path.split('/').map(encodeURIComponent).join('/')}`)
  return part.content
}

/**
 * Saves one batch: changed files, removed files, and (in the last batch) the state. `baseSha` is the saved
 * state it builds on (null for the first save); if the state changed on GitHub since, the backend answers 409
 * `workspace_conflict` and writes nothing. `keepalive` lets it finish after the page closes (≤ ~64 KB).
 */
export function saveBatch(projectId: string, batch: SaveBatch, baseSha: string | null, { keepalive = false } = {}): Promise<WorkspaceSaved> {
  return backendFetch<WorkspaceSaved>(`/workspace/sessions/${projectId}`, {
    method: 'PUT',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: saveBody(batch, baseSha),
  })
}

export function saveBody(batch: SaveBatch, baseSha: string | null): string {
  return JSON.stringify({ baseSha, state: batch.state ?? null, parts: batch.parts, deletes: batch.deletes })
}

async function orNullIfMissing<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request
  } catch (e) {
    if (e instanceof ApiError && e.code === 'workspace_session_not_found') return null
    throw e
  }
}
