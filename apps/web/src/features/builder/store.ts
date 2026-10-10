import { MAX_STORED_TURNS } from '@makable/shared'
import type { AiHistoryTurn } from '@/features/ai-edit'
import type { SiteDraft } from '@/features/visual-edit'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type ChatContext, type ChatEvent, type Conversation, initialConversation, reduceConversation } from './lib/conversation'
import type { SessionState } from './lib/session-file'

type BuilderState = {
  /**
   * GitHub login the conversation belongs to, or null for a guest's. Another account on
   * this browser starts fresh; a guest's conversation is claimed when they connect GitHub.
   */
  login: string | null
  /** A permanent id for this site, kept in exported sessions. "Start over" begins a new site with a new id. */
  projectId: string
  conversation: Conversation
  /**
   * Project files changed by AI code edits, per template id (repo path → full contents). They're
   * layered over that template's files in the preview, and kept when switching templates.
   */
  fileEdits: Record<string, Record<string, string>>
  /**
   * Finished AI requests per template id, oldest first (instruction, selection, what happened).
   * The latest are sent with each AI request as context. Kept only here: the backend stores nothing.
   */
  aiHistory: Record<string, AiHistoryTurn[]>
  recordAiTurn: (template: string, turn: AiHistoryTurn) => void
  /** Rewrites the reply of one of a template's turns (its change was undone). */
  amendAiTurn: (template: string, id: string, reply: string) => void
  dispatch: (event: ChatEvent, ctx: ChatContext) => void
  /** Direct changes from outside the chat (visual and AI edits). Stores the exact objects given. */
  setDraft: (draft: SiteDraft) => void
  /** "Edit with AI" mode for the preview. Not persisted. */
  aiMode: boolean
  setAiMode: (aiMode: boolean) => void
  /** Save the session to the user's private GitHub workspace automatically. On by default. */
  syncEnabled: boolean
  setSyncEnabled: (enabled: boolean) => void
  /** The version of this session last saved to GitHub (null: never saved from here). */
  synced: Synced | null
  markSynced: (synced: Synced | null) => void
  /** The "your chat is saved to GitHub" note was shown in the chat. */
  syncNoticeShown: boolean
  markSyncNoticeShown: () => void
  /** Replaces the whole session with an imported one, for `login` (whoever imported it). `synced` when it came from GitHub. */
  importSession: (session: SessionState, login: string | null, synced?: Synced | null) => void
  /** Hands a guest's conversation to the account they just connected. */
  claim: (login: string) => void
  reset: (login: string | null) => void
}

const STORAGE_KEY = 'makable:builder'

/** A save to GitHub: the file's SHA (a later save sends it back), the repo, and what was saved. */
export type Synced = { sha: string; repoUrl: string | null; fingerprint: string; at: string }

/** What's saved in localStorage. */
type Persisted = Pick<
  BuilderState,
  'login' | 'projectId' | 'conversation' | 'fileEdits' | 'aiHistory' | 'syncEnabled' | 'synced' | 'syncNoticeShown'
>

export const useBuilderStore = create<BuilderState>()(
  persist(
    (set) => ({
      login: null,
      projectId: crypto.randomUUID(),
      conversation: initialConversation(),
      fileEdits: {},
      aiHistory: {},
      recordAiTurn: (template, turn) =>
        set(({ aiHistory }) => ({ aiHistory: { ...aiHistory, [template]: [...(aiHistory[template] ?? []), turn].slice(-MAX_STORED_TURNS) } })),
      amendAiTurn: (template, id, reply) =>
        set(({ aiHistory }) => {
          const turns = aiHistory[template]
          if (!turns?.some((turn) => turn.id === id)) return {}
          return { aiHistory: { ...aiHistory, [template]: turns.map((turn) => (turn.id === id ? { ...turn, reply } : turn)) } }
        }),
      dispatch: (event, ctx) => set(({ conversation }) => ({ conversation: reduceConversation(conversation, event, ctx) })),
      setDraft: ({ portfolio, files }) =>
        set(({ conversation, fileEdits }) => ({
          conversation: { ...conversation, portfolio },
          fileEdits: { ...fileEdits, [portfolio.template]: files },
        })),
      aiMode: false,
      setAiMode: (aiMode) => set({ aiMode }),
      syncEnabled: true,
      setSyncEnabled: (syncEnabled) => set({ syncEnabled }),
      synced: null,
      markSynced: (synced) => set({ synced }),
      syncNoticeShown: false,
      markSyncNoticeShown: () => set({ syncNoticeShown: true }),
      importSession: ({ projectId, conversation, fileEdits, aiHistory }, login, synced = null) =>
        set({ login, projectId, conversation, fileEdits, aiHistory, synced, aiMode: false }),
      claim: (login) => set({ login }),
      reset: (login) =>
        set({
          login,
          projectId: crypto.randomUUID(),
          conversation: initialConversation(),
          fileEdits: {},
          aiHistory: {},
          synced: null,
          aiMode: false,
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      partialize: ({ login, projectId, conversation, fileEdits, aiHistory, syncEnabled, synced, syncNoticeShown }): Persisted => ({
        login,
        projectId,
        conversation,
        fileEdits,
        aiHistory,
        syncEnabled,
        synced,
        syncNoticeShown,
      }),
      // v1 had no project id: give the stored site one, once.
      migrate: (stored, version) => {
        const state = stored as Persisted
        return version < 2 ? { ...state, projectId: crypto.randomUUID() } : state
      },
    },
  ),
)

// Every tab persists its own snapshot to the same key, so a tab left open would overwrite newer
// work from another tab on its next change. Reload whenever another tab writes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) void useBuilderStore.persist.rehydrate()
  })
}
