import type { Portfolio } from '@makable/shared'
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
  dispatch: (event: ChatEvent, ctx: ChatContext) => void
  /** Direct content changes from outside the chat (visual edits). */
  setPortfolio: (portfolio: Portfolio) => void
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
      dispatch: (event, ctx) => set(({ conversation }) => ({ conversation: reduceConversation(conversation, event, ctx) })),
      setPortfolio: (portfolio) => set(({ conversation }) => ({ conversation: { ...conversation, portfolio } })),
      aiMode: false,
      setAiMode: (aiMode) => set({ aiMode }),
      claim: (login) => set({ login }),
      reset: (login) => set({ login, conversation: initialConversation(), aiMode: false }),
    }),
    { name: STORAGE_KEY, version: 1, partialize: ({ login, conversation }) => ({ login, conversation }) },
  ),
)

// Every tab persists its own snapshot to the same key, so a tab left open would overwrite newer
// work from another tab on its next change. Reload whenever another tab writes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) void useBuilderStore.persist.rehydrate()
  })
}
