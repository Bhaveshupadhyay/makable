import { ApiError, backendFetch } from '@/shared/lib/api-client'

// The user's sites through makable-backend (which holds the GitHub token): each site is a private repo on their
// GitHub. The browser keeps a working copy at a commit, and every write names the commit it builds on.

export type SiteRead = { projectId: string; name: string; repoName: string | null; repoUrl: string | null; updatedAt: string }
export type SiteFiles = { site: SiteRead; commitSha: string; files: Record<string, string>; binary: string[] }
export type SiteSave = { baseCommit: string; files: Record<string, string>; deletes: string[]; message?: string }
export type SiteSaved = { commitSha: string; changed: boolean }
export type SiteUndone = { commitSha: string; files: Record<string, string | null> }

/** The user's sites, the most recently used first. */
export function listSites(): Promise<SiteRead[]> {
  return backendFetch<SiteRead[]>('/sites')
}

/** The site's files on GitHub now, or null when makable has no such site (or it has no repo yet). */
export async function getSite(projectId: string): Promise<SiteFiles | null> {
  try {
    return await backendFetch<SiteFiles>(`/sites/${projectId}`)
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'site_not_found' || e.code === 'site_not_ready')) return null
    throw e
  }
}

/** The JSON body of a save, so a caller can check it fits a `keepalive` request first. */
export function saveBody(save: SiteSave): string {
  return JSON.stringify(save)
}

/**
 * Commits manual edits on top of `baseCommit`. If the site changed on GitHub since (another tab or device), the
 * backend answers 409 `site_conflict` with the current `commitSha` and writes nothing. `keepalive` lets it finish
 * after the page closes (browsers cap those bodies at ~64 KB).
 */
export function saveFiles(projectId: string, save: SiteSave, { keepalive = false } = {}): Promise<SiteSaved> {
  return backendFetch<SiteSaved>(`/sites/${projectId}/files`, {
    method: 'PUT',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: saveBody(save),
  })
}

/** Undoes a commit's changes (an AI edit) with a new commit on top of `baseCommit`. */
export function undoChange(projectId: string, commitSha: string, baseCommit: string): Promise<SiteUndone> {
  return backendFetch<SiteUndone>(`/sites/${projectId}/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commitSha, baseCommit }),
  })
}
