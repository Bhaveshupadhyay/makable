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

export const useBuilderStore = create<BuilderState>()(
  persist(
    (set) => ({
      login: null,
      conversation: initialConversation(),
      fileEdits: {},
      dispatch: (event, ctx) => set(({ conversation }) => ({ conversation: reduceConversation(conversation, event, ctx) })),
      setDraft: ({ portfolio, files }) =>
        set(({ conversation, fileEdits }) => ({
          conversation: { ...conversation, portfolio },
          fileEdits: { ...fileEdits, [portfolio.template]: files },
        })),
      aiMode: false,
      setAiMode: (aiMode) => set({ aiMode }),
      claim: (login) => set({ login }),
      reset: (login) => set({ login, conversation: initialConversation(), fileEdits: {}, aiMode: false }),
    }),
    { name: STORAGE_KEY, version: 1, partialize: ({ login, conversation, fileEdits }) => ({ login, conversation, fileEdits }) },
  ),
)

// Every tab persists its own snapshot to the same key, so a tab left open would overwrite newer
// work from another tab on its next change. Reload whenever another tab writes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) void useBuilderStore.persist.rehydrate()
  })
}
