import { saveFiles, savesAnswered } from '../api/sites'
import { useSiteStore } from '../store'
import { savePlan } from './working-copy'

/**
 * Saves the open site's unsaved edits now, without its workspace (which saves them by itself while it's open): before
 * the site is put away for a new one, which drops them. Throws an `ApiError` when it can't (`site_conflict`...).
 */
export async function saveEdits(): Promise<void> {
  // A save already on its way (the workspace's, sent just before it closed) has the same edits on the same commit:
  // sending them again would be a conflict once it lands.
  await savesAnswered()
  const { projectId, commitSha, dirty } = useSiteStore.getState()
  if (!commitSha || Object.keys(dirty).length === 0) return
  const sent = { ...dirty }
  try {
    const saved = await saveFiles(projectId, { baseCommit: commitSha, ...savePlan(sent) })
    if (useSiteStore.getState().projectId === projectId) useSiteStore.getState().saved(saved.commitSha, sent)
  } catch (e) {
    // Another tab saved them first (this one reloads what it wrote): nothing is left to save.
    const now = useSiteStore.getState()
    if (now.projectId === projectId && Object.keys(now.dirty).length === 0) return
    throw e
  }
}
