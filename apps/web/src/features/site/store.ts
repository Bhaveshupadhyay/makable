import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SiteFiles, SiteRead } from './api/sites'
import { afterSave, applyChanges, type Changes, type Files, recordEdit } from './lib/working-copy'

type SiteState = {
  /** GitHub login the site belongs to (null before sign-in). Another account on this browser starts fresh. */
  login: string | null
  /** The site's permanent id (the backend's `projectId`). A new site gets a new one. */
  projectId: string
  /** The site, once it has a repo (created here, or opened from the user's sites). */
  site: SiteRead | null
  /** The commit the working copy is based on. */
  commitSha: string | null
  /** The user's edits not saved to GitHub yet. Persisted, so a reload or a crash doesn't lose them. */
  dirty: Changes
  /** The files at `commitSha` (not persisted: loaded from GitHub when the page opens). */
  base: Files | null
  /** Files the preview can't show and the editor can't change (images...). */
  binary: string[]
  /** An AI change the preview is trying before it's committed (null deletes a file). Not persisted. */
  trying: Changes | null
  /** On a browser with nothing for this account yet, open their newest site. Off once they pick or start one. */
  autoOpen: boolean
  /**
   * Counts changes to the files that aren't the user's own edits (loaded, an AI change, an Undo, edits dropped):
   * undo history of their edits ends there. Not persisted.
   */
  generation: number
  /** The site's files from GitHub: they become the base. */
  loaded: (files: SiteFiles) => void
  /** A manual edit (null deletes the file). */
  edit: (path: string, content: string | null) => void
  /** The edits `sent` were saved as `commitSha`. */
  saved: (commitSha: string, sent: Changes) => void
  /** A commit made by makable on top of the base (an AI change, an Undo, a publish): `changes` are what it changed. */
  committed: (commitSha: string, changes: Changes) => void
  /** Drops the unsaved edits (the user chose the version on GitHub). */
  discard: () => void
  setTrying: (changes: Changes | null) => void
  /** The site was created from a prompt: its files are loaded next. */
  created: (site: SiteRead, commitSha: string) => void
  /** Opens one of the user's sites. */
  open: (site: SiteRead) => void
  /** Starts a new site (the landing prompt). */
  newSite: () => void
  claim: (login: string) => void
  /** Another account: start fresh, and open their newest site if they have one. */
  reset: (login: string | null) => void
}

const STORAGE_KEY = 'makable:site'

type Persisted = Pick<SiteState, 'login' | 'projectId' | 'site' | 'commitSha' | 'dirty' | 'autoOpen'>

const fresh = { site: null, commitSha: null, dirty: {}, base: null, binary: [], trying: null }
const next = ({ generation }: { generation: number }) => ({ generation: generation + 1 })

export const useSiteStore = create<SiteState>()(
  persist(
    (set) => ({
      login: null,
      projectId: crypto.randomUUID(),
      ...fresh,
      autoOpen: true,
      generation: 0,
      loaded: ({ site, commitSha, files, binary }) => set((s) => ({ site, commitSha, base: files, binary, ...next(s) })),
      edit: (path, content) => set(({ base, dirty }) => (base ? { dirty: recordEdit(base, dirty, path, content) } : {})),
      saved: (commitSha, sent) =>
        set(({ base, dirty }) => ({ commitSha, base: base && applyChanges(base, sent), dirty: afterSave(dirty, sent) })),
      committed: (commitSha, changes) => set((s) => ({ commitSha, base: s.base && applyChanges(s.base, changes), trying: null, ...next(s) })),
      discard: () => set((s) => ({ dirty: {}, ...next(s) })),
      setTrying: (trying) => set({ trying }),
      created: (site, commitSha) => set((s) => ({ site, commitSha, base: null, autoOpen: false, ...next(s) })),
      open: (site) => set((s) => ({ ...fresh, projectId: site.projectId, site, autoOpen: false, ...next(s) })),
      newSite: () => set((s) => ({ ...fresh, projectId: crypto.randomUUID(), autoOpen: false, ...next(s) })),
      claim: (login) => set({ login }),
      reset: (login) => set((s) => ({ ...fresh, login, projectId: crypto.randomUUID(), autoOpen: true, ...next(s) })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: ({ login, projectId, site, commitSha, dirty, autoOpen }): Persisted => ({ login, projectId, site, commitSha, dirty, autoOpen }),
    },
  ),
)

// Every tab persists its own snapshot to the same key: reload whenever another tab writes, so a stale tab can't
// overwrite newer work. When the other tab moved the site to another commit, this tab's files are stale: load them
// again.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    const { projectId, commitSha } = useSiteStore.getState()
    void Promise.resolve(useSiteStore.persist.rehydrate()).then(() => {
      const now = useSiteStore.getState()
      if (now.projectId !== projectId || now.commitSha !== commitSha) {
        useSiteStore.setState((s) => ({ base: null, binary: [], trying: null, generation: s.generation + 1 }))
      }
    })
  })
}
