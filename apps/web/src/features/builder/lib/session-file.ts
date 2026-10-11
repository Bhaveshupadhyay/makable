import {
  MAX_SESSION_BYTES,
  SESSION_FORMAT,
  SESSION_VERSION,
  type SessionSnapshot,
  sessionSnapshotSchema,
} from '@makable/shared'
import type { AiHistoryTurn } from '@/features/ai-edit'
import { type Conversation, STEPS, type Step } from './conversation'

/** What a session file holds, as the builder store keeps it. */
export type SessionState = {
  projectId: string
  conversation: Conversation
  fileEdits: Record<string, Record<string, string>>
  aiHistory: Record<string, AiHistoryTurn[]>
}

/** The session as a file. Transient state (a pending sign-in prompt) is left out. */
export function toSnapshot({ projectId, conversation, fileEdits, aiHistory }: SessionState, login: string | null, now: Date): SessionSnapshot {
  const { step, messages, portfolio, githubLogin } = conversation
  return {
    format: SESSION_FORMAT,
    version: SESSION_VERSION,
    exportedAt: now.toISOString(),
    login,
    projectId,
    conversation: { step, messages, portfolio, ...(githubLogin ? { githubLogin } : {}) },
    fileEdits,
    aiHistory,
  }
}

/** e.g. `makable-session-octocat-2026-10-10.json`. */
export function sessionFileName(login: string | null, now: Date): string {
  return `makable-session-${login ?? 'guest'}-${now.toISOString().slice(0, 10)}.json`
}

export type ReadSession = { ok: true; snapshot: SessionSnapshot; state: SessionState } | { ok: false; error: string }

const NOT_A_SESSION = "That file isn't a makable session."

/** Checks a file's size before it's read, so a huge file is never loaded. */
export function checkSessionFileSize(bytes: number): string | null {
  return bytes > MAX_SESSION_BYTES ? 'That file is too large to be a makable session.' : null
}

/** Parses and validates a session file. The file is untrusted: anyone can write or edit one. */
export function readSessionFile(text: string): ReadSession {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: NOT_A_SESSION }
  }
  return parseSession(json)
}

/** Validates a session from any source (a file, or the GitHub workspace) and turns it into store state. */
export function parseSession(json: unknown): ReadSession {
  const head = json as { format?: unknown; version?: unknown } | null
  if (!head || typeof head !== 'object' || head.format !== SESSION_FORMAT) return { ok: false, error: NOT_A_SESSION }
  if (typeof head.version === 'number' && head.version > SESSION_VERSION) {
    return { ok: false, error: 'This session was exported by a newer version of makable. Update the page and try again.' }
  }
  const parsed = sessionSnapshotSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: `This session file is damaged or was edited (${issue.path.join('.') || 'file'}: ${issue.message}).` }
  }
  const snapshot = parsed.data
  const { step, messages, portfolio, githubLogin } = snapshot.conversation
  if (!isStep(step)) return { ok: false, error: `This session file is damaged or was edited (conversation.step: unknown step "${step}").` }
  return {
    ok: true,
    snapshot,
    state: {
      projectId: snapshot.projectId,
      conversation: { step, messages, portfolio, ...(githubLogin ? { githubLogin } : {}) },
      fileEdits: snapshot.fileEdits,
      aiHistory: snapshot.aiHistory,
    },
  }
}

function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value)
}
