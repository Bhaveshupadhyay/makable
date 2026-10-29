import { saveFiles } from '../api/sites'
import { useSiteStore } from '../store'
import { savePlan } from './working-copy'

/**
 * Saves the open site's unsaved edits now, without its workspace (which saves them by itself while it's open): before
 * the site is put away for a new one, which drops them. Throws an `ApiError` when it can't (`site_conflict`...).
 */
export async function saveEdits(): Promise<void> {
  const { projectId, commitSha, dirty } = useSiteStore.getState()
  if (!commitSha || Object.keys(dirty).length === 0) return
  const sent = { ...dirty }
  const saved = await saveFiles(projectId, { baseCommit: commitSha, ...savePlan(sent) })
  if (useSiteStore.getState().projectId === projectId) useSiteStore.getState().saved(saved.commitSha, sent)
}
