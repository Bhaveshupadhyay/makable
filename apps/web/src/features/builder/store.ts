import type { Portfolio } from '@makable/shared'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type ChatContext, type ChatEvent, type Conversation, initialConversation, reduceConversation } from './lib/conversation'

type BuilderState = {
  /** GitHub login the conversation belongs to, so another account on this browser starts fresh. */
  login: string | null
  conversation: Conversation
  dispatch: (event: ChatEvent, ctx: ChatContext) => void
  /** Direct content changes from outside the chat (visual edits). */
  setPortfolio: (portfolio: Portfolio) => void
  reset: (login: string) => void
}

export const useBuilderStore = create<BuilderState>()(
  persist(
    (set) => ({
      login: null,
      conversation: initialConversation(),
      dispatch: (event, ctx) => set(({ conversation }) => ({ conversation: reduceConversation(conversation, event, ctx) })),
      setPortfolio: (portfolio) => set(({ conversation }) => ({ conversation: { ...conversation, portfolio } })),
      reset: (login) => set({ login, conversation: initialConversation() }),
    }),
    { name: 'makable:builder', version: 1 },
  ),
)
