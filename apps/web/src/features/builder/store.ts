import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { analytics } from '@/shared/lib/analytics'
import { type ChatMessage, emptyChat, type LocalChat, MAX_LOCAL_MESSAGES } from './lib/chat'
import type { Published } from './lib/publish-flow'

/** What the browser keeps of a site's chat: its own messages, the publish flow, where it was published, undone changes. */
export type SiteChat = LocalChat & { published?: Published | null; undone?: string[] }

/** The browser keeps the chats of this many sites. */
const MAX_SITES = 20

type BuilderState = {
  /** Per site (`projectId`). */
  chats: Record<string, SiteChat>
  /** Applies a change to a site's chat. */
  update: (projectId: string, change: (chat: LocalChat) => LocalChat) => void
  /** Adds the browser's own message to a site's chat. */
  say: (projectId: string, message: ChatMessage) => void
  setPublished: (projectId: string, published: Published | null) => void
  markUndone: (projectId: string, commitSha: string) => void
  /** "Edit with AI" mode for the preview. Not persisted. */
  aiMode: boolean
  setAiMode: (aiMode: boolean) => void
}

const STORAGE_KEY = 'makable:builder'

const chatOf = (chats: Record<string, SiteChat>, projectId: string): SiteChat => chats[projectId] ?? emptyChat()

/** Sets one site's chat, keeping it last (the most recent) and only the latest sites. */
function put(chats: Record<string, SiteChat>, projectId: string, chat: SiteChat): Record<string, SiteChat> {
  const rest = Object.entries(chats).filter(([id]) => id !== projectId)
  const messages = chat.messages.slice(-MAX_LOCAL_MESSAGES)
  return Object.fromEntries([...rest.slice(-(MAX_SITES - 1)), [projectId, { ...chat, messages }]])
}

export const useBuilderStore = create<BuilderState>()(
  persist(
    (set, get) => ({
      chats: {},
      update: (projectId, change) =>
        set(({ chats }) => {
          const chat = chatOf(chats, projectId)
          return { chats: put(chats, projectId, { ...chat, ...change(chat) }) }
        }),
      say: (projectId, message) => get().update(projectId, (chat) => ({ ...chat, messages: [...chat.messages, message] })),
      setPublished: (projectId, published) => set(({ chats }) => ({ chats: put(chats, projectId, { ...chatOf(chats, projectId), published }) })),
      markUndone: (projectId, commitSha) =>
        set(({ chats }) => {
          const chat = chatOf(chats, projectId)
          return { chats: put(chats, projectId, { ...chat, undone: [...(chat.undone ?? []), commitSha].slice(-100) }) }
        }),
      aiMode: false,
      setAiMode: (aiMode) => {
        if (aiMode !== get().aiMode) analytics.track('ai_mode_changed', { enabled: aiMode })
        set({ aiMode })
      },
    }),
    {
      name: STORAGE_KEY,
      // v3: chats per site. Earlier versions held a whole portfolio session, which prompt-built sites replace.
      version: 3,
      partialize: ({ chats }) => ({ chats }),
      migrate: () => ({ chats: {} }),
    },
  ),
)

/** A site's chat (a stable empty one before it has any). */
export function useSiteChat(projectId: string): SiteChat {
  return useBuilderStore((s) => s.chats[projectId] ?? EMPTY)
}
const EMPTY: SiteChat = emptyChat()

// Every tab persists its own snapshot to the same key: reload whenever another tab writes.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) void useBuilderStore.persist.rehydrate()
  })
}
