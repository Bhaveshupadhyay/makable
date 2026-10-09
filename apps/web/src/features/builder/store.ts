import type { AiEditTurn } from '@makable/shared'
import type { SiteDraft } from '@/features/visual-edit'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type ChatContext, type ChatEvent, type Conversation, initialConversation, reduceConversation } from './lib/conversation'

type BuilderState = {
  /**
   * GitHub login the conversation belongs to, or null for a guest's. Another account on
   * this browser starts fresh; a guest's conversation is claimed when they connect GitHub.
   */
  login: string | null
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
  aiHistory: Record<string, AiEditTurn[]>
  recordAiTurn: (template: string, turn: AiEditTurn) => void
  /** Rewrites the reply of a template's latest turn (its change was undone). */
  amendAiTurn: (template: string, reply: string) => void
  dispatch: (event: ChatEvent, ctx: ChatContext) => void
  /** Direct changes from outside the chat (visual and AI edits). Stores the exact objects given. */
  setDraft: (draft: SiteDraft) => void
  /** "Edit with AI" mode for the preview. Not persisted. */
  aiMode: boolean
  setAiMode: (aiMode: boolean) => void
  /** Hands a guest's conversation to the account they just connected. */
  claim: (login: string) => void
  reset: (login: string | null) => void
}

const STORAGE_KEY = 'makable:builder'
// More than a request sends, so the history stays useful for exporting and syncing later.
const MAX_STORED_TURNS = 50

export const useBuilderStore = create<BuilderState>()(
  persist(
    (set) => ({
      login: null,
      conversation: initialConversation(),
      fileEdits: {},
      aiHistory: {},
      recordAiTurn: (template, turn) =>
        set(({ aiHistory }) => ({ aiHistory: { ...aiHistory, [template]: [...(aiHistory[template] ?? []), turn].slice(-MAX_STORED_TURNS) } })),
      amendAiTurn: (template, reply) =>
        set(({ aiHistory }) => {
          const turns = aiHistory[template]
          if (!turns?.length) return {}
          return { aiHistory: { ...aiHistory, [template]: [...turns.slice(0, -1), { ...turns[turns.length - 1], reply }] } }
        }),
      dispatch: (event, ctx) => set(({ conversation }) => ({ conversation: reduceConversation(conversation, event, ctx) })),
      setDraft: ({ portfolio, files }) =>
        set(({ conversation, fileEdits }) => ({
          conversation: { ...conversation, portfolio },
          fileEdits: { ...fileEdits, [portfolio.template]: files },
        })),
      aiMode: false,
      setAiMode: (aiMode) => set({ aiMode }),
      claim: (login) => set({ login }),
      reset: (login) => set({ login, conversation: initialConversation(), fileEdits: {}, aiHistory: {}, aiMode: false }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: ({ login, conversation, fileEdits, aiHistory }) => ({ login, conversation, fileEdits, aiHistory }),
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
