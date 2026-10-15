import type { AiThread } from '@/features/ai-edit'
import type { PublishFlow } from './publish-flow'

// The chat beside the site: the site's AI thread from the server (requests, questions, what the AI did), with the
// browser's own messages in between (publishing, a creation that failed). Pure helpers, so the merge is easy to test.

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** When it was said (ISO), to merge with the thread. */
  at: string
  /** Under a user message: what was selected in the preview. */
  caption?: string | null
  /** Quick replies. Only the latest message's are offered. */
  replies?: string[]
  /** Inline UI rendered under the text. */
  widget?: 'reconnect-github'
  /** An AI change that can be undone: its commit, and whether it was. */
  undo?: { commitSha: string; done: boolean }
  tone?: 'error'
  /** The error is fixed in Settings → AI models: link there. */
  settingsLink?: boolean
}

/** The browser's own part of the chat, per site. */
export type LocalChat = { messages: ChatMessage[]; publish?: PublishFlow }

export const emptyChat = (): LocalChat => ({ messages: [] })

export const user = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: crypto.randomUUID(),
  role: 'user',
  text,
  at: new Date().toISOString(),
  ...extra,
})

export const assistant = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: crypto.randomUUID(),
  role: 'assistant',
  text,
  at: new Date().toISOString(),
  ...extra,
})

/** The browser keeps this many of its own messages per site. */
export const MAX_LOCAL_MESSAGES = 200

/**
 * The chat in order: the thread's finished requests (each as the request, the questions asked on the way and the
 * reply) and the browser's own messages, by time. `undone` lists AI changes already undone here.
 */
export function buildChat(thread: AiThread | null, local: LocalChat, undone: readonly string[] = []): ChatMessage[] {
  const fromThread: ChatMessage[] = []
  for (const [i, turn] of (thread?.turns ?? []).entries()) {
    const at = turn.createdAt
    const key = `turn-${i}-${at}`
    fromThread.push({ id: `${key}-asked`, role: 'user', text: turn.instruction, caption: turn.target, at })
    for (const [k, qa] of turn.questions.entries()) {
      fromThread.push({ id: `${key}-q${k}`, role: 'assistant', text: qa.question, at })
      fromThread.push({ id: `${key}-a${k}`, role: 'user', text: qa.answer, at })
    }
    // The first turn is the site's creation: undoing it would leave the empty starter.
    const undoable = turn.outcome === 'applied' && !!turn.commitSha && i > 0
    fromThread.push({
      id: `${key}-reply`,
      role: 'assistant',
      text: turn.reply || replyFor(turn.outcome),
      at,
      ...(undoable ? { undo: { commitSha: turn.commitSha!, done: undone.includes(turn.commitSha!) } } : {}),
    })
  }
  // A stable sort: the thread's messages keep their order among themselves, and so do the browser's.
  return [...fromThread, ...local.messages].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

function replyFor(outcome: string): string {
  switch (outcome) {
    case 'applied':
      return 'Done.'
    case 'skipped':
      return 'Skipped. Nothing was changed.'
    default:
      return 'Nothing was changed.'
  }
}
