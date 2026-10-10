import {
  aiHistoryFileSchema,
  aiHistoryPath,
  CHUNK_MAX_BYTES,
  CHUNK_MAX_MESSAGES,
  chunkPath,
  editedFilePath,
  messageChunkSchema,
  SESSION_FORMAT,
  SESSION_VERSION,
  type SessionMessage,
  WORKSPACE_FORMAT,
  WORKSPACE_VERSION,
  type WorkspaceState,
} from '@makable/shared'
import { parseSession, type ReadSession, type SessionState } from './session-file'

// The session as the files of the GitHub workspace (see `@makable/shared` `session.ts`), and back.

/** The state plus every other file of the session, by path inside the project's folder. */
export type WorkspaceFiles = { state: WorkspaceState; parts: Record<string, string> }

/** A save request, or one batch of a big save. Only the last batch carries the state. */
export type SaveBatch = { parts: { path: string; content: string }[]; deletes: string[]; state?: WorkspaceState }

/** The key under which the state's hash is kept with the parts' hashes. */
export const STATE_KEY = 'state.json'
/** Keeps every request well under the backend's body limit, however much changed at once. */
export const BATCH_MAX_BYTES = 512_000
export const BATCH_MAX_PARTS = 20
export const BATCH_MAX_DELETES = 500

const encoder = new TextEncoder()
const bytes = (text: string) => encoder.encode(text).length

/**
 * Splits the chat into chunks of at most `CHUNK_MAX_BYTES` / `CHUNK_MAX_MESSAGES`, in order. Greedy, so
 * appending messages only changes the last chunk or starts a new one: earlier chunks never change.
 */
export function chunkMessages(messages: readonly SessionMessage[]): SessionMessage[][] {
  const chunks: SessionMessage[][] = []
  let current: SessionMessage[] = []
  let size = 0
  for (const message of messages) {
    const next = bytes(JSON.stringify(message)) + 1
    if (current.length && (size + next > CHUNK_MAX_BYTES || current.length >= CHUNK_MAX_MESSAGES)) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(message)
    size += next
  }
  if (current.length) chunks.push(current)
  return chunks
}

export function toWorkspaceFiles({ projectId, conversation, fileEdits, aiHistory }: SessionState, login: string | null, savedAt: Date): WorkspaceFiles {
  const { step, messages, portfolio, githubLogin } = conversation
  const chunks = chunkMessages(messages)
  const parts: Record<string, string> = {}
  chunks.forEach((chunk, i) => (parts[chunkPath(i + 1)] = JSON.stringify({ messages: chunk })))
  const withHistory = Object.keys(aiHistory).filter((template) => aiHistory[template].length > 0)
  for (const template of withHistory) parts[aiHistoryPath(template)] = JSON.stringify(aiHistory[template])
  for (const [template, files] of Object.entries(fileEdits)) {
    for (const [path, content] of Object.entries(files)) parts[editedFilePath(template, path)] = content
  }
  const state: WorkspaceState = {
    format: WORKSPACE_FORMAT,
    version: WORKSPACE_VERSION,
    savedAt: savedAt.toISOString(),
    login,
    projectId,
    conversation: { step, portfolio, ...(githubLogin ? { githubLogin } : {}) },
    messageChunks: chunks.length,
    files: Object.fromEntries(Object.entries(fileEdits).map(([template, files]) => [template, Object.keys(files)])),
    aiHistory: withHistory,
  }
  return { state, parts }
}

/** Every file a saved state says the session has, to fetch when restoring. */
export function listedParts(state: WorkspaceState): string[] {
  return [
    ...Array.from({ length: state.messageChunks }, (_, i) => chunkPath(i + 1)),
    ...state.aiHistory.map(aiHistoryPath),
    ...Object.entries(state.files).flatMap(([template, paths]) => paths.map((path) => editedFilePath(template, path))),
  ]
}

/** Puts a saved session back together and validates it like an imported file. Every listed part must be there. */
export function fromWorkspaceFiles({ state, parts }: WorkspaceFiles): ReadSession {
  try {
    const messages = Array.from({ length: state.messageChunks }, (_, i) => messageChunkSchema.parse(JSON.parse(need(parts, chunkPath(i + 1)))).messages).flat()
    const aiHistory = Object.fromEntries(state.aiHistory.map((t) => [t, aiHistoryFileSchema.parse(JSON.parse(need(parts, aiHistoryPath(t))))]))
    const fileEdits = Object.fromEntries(
      Object.entries(state.files).map(([t, paths]) => [t, Object.fromEntries(paths.map((path) => [path, need(parts, editedFilePath(t, path))]))]),
    )
    return parseSession({
      format: SESSION_FORMAT,
      version: SESSION_VERSION,
      exportedAt: state.savedAt,
      login: state.login,
      projectId: state.projectId,
      conversation: { ...state.conversation, messages },
      fileEdits,
      aiHistory,
    })
  } catch (e) {
    return { ok: false, error: `The session saved on GitHub is incomplete or damaged (${e instanceof Error ? e.message : 'unreadable'}).` }
  }
}

function need(parts: Record<string, string>, path: string): string {
  const content = parts[path]
  if (content === undefined) throw new Error(`${path} is missing`)
  return content
}

/** A hash of each file's content, and of the state without its save time, to tell what changed since a save. */
export async function hashFiles({ state, parts }: WorkspaceFiles): Promise<Record<string, string>> {
  const entries = await Promise.all(Object.entries(parts).map(async ([path, content]) => [path, await sha256(content)] as const))
  return { ...Object.fromEntries(entries), [STATE_KEY]: await sha256(JSON.stringify({ ...state, savedAt: '' })) }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * What a save must send: the files whose hash changed since the last save, the ones that went away, and the
 * state. Big saves are split into batches under `BATCH_MAX_BYTES`; only the last one carries the state, so a
 * saved state never lists files that aren't saved yet. Null when nothing changed.
 */
export function planSave(files: WorkspaceFiles, hashes: Record<string, string>, synced: Record<string, string> | null): SaveBatch[] | null {
  // New files first and replaced ones last, so they land with the state when they fit: until the state is saved,
  // GitHub's state doesn't list the new files, and the files it lists keep the content it was saved with.
  const changed = Object.keys(files.parts)
    .filter((path) => hashes[path] !== synced?.[path])
    .sort((a, b) => Number(synced !== null && a in synced) - Number(synced !== null && b in synced))
  const deletes = Object.keys(synced ?? {}).filter((path) => path !== STATE_KEY && !(path in files.parts))
  if (!changed.length && !deletes.length && hashes[STATE_KEY] === synced?.[STATE_KEY]) return null

  const batches: SaveBatch[] = []
  let current: SaveBatch = { parts: [], deletes: [] }
  let size = 0
  for (const path of changed) {
    const content = files.parts[path]
    const next = bytes(content) + bytes(path)
    if (current.parts.length && (size + next > BATCH_MAX_BYTES || current.parts.length >= BATCH_MAX_PARTS)) {
      batches.push(current)
      current = { parts: [], deletes: [] }
      size = 0
    }
    current.parts.push({ path, content })
    size += next
  }
  for (let i = 0; i < deletes.length; i += BATCH_MAX_DELETES) {
    const slice = deletes.slice(i, i + BATCH_MAX_DELETES)
    if (current.deletes.length) {
      batches.push(current)
      current = { parts: [], deletes: [] }
    }
    current.deletes = slice
  }
  batches.push({ ...current, state: files.state })
  return batches
}
