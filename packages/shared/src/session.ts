import { z } from 'zod'
import { aiEditTurnSchema, MAX_FILE_CHARS } from './ai-edit'
import { portfolioSchema, templateIdSchema } from './portfolio'
import { SAFE_REPO_PATH } from './template-catalog'

// A builder session as one file: the chat, the site draft (content + AI-edited files) and the AI
// history. Export downloads it, import replaces the current session with it, and the GitHub sync
// stores it in the user's private workspace repo. A session file is untrusted (anyone can edit
// one), so everything is validated and capped here.

export const SESSION_FORMAT = 'makable-session'
export const SESSION_VERSION = 1
/** Bigger than a real session gets: localStorage, where the session lives, holds about 5 MB. */
export const MAX_SESSION_BYTES = 5_000_000
/** The 5 MB file size is the real bound; this only stops absurd counts. */
export const MAX_MESSAGES = 50_000
export const MAX_MESSAGE_CHARS = 10_000
export const MAX_STORED_TURNS = 50

export const sessionMessageSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(MAX_MESSAGE_CHARS),
  widget: z.enum(['template-picker', 'connect-github']).optional(),
  replies: z.array(z.string().max(200)).max(20).optional(),
})
export type SessionMessage = z.infer<typeof sessionMessageSchema>

export const sessionTurnSchema = aiEditTurnSchema.extend({ id: z.string().min(1).max(100) })

export const sessionSnapshotSchema = z.object({
  format: z.literal(SESSION_FORMAT),
  version: z.literal(SESSION_VERSION),
  exportedAt: z.iso.datetime(),
  /** Who exported it (null for a guest). Informational: an import goes to whoever imports it. */
  login: z.string().max(100).nullable(),
  /** A permanent id for this site, so the session can be matched to its repo later. */
  projectId: z.uuid(),
  conversation: z.object({
    /** A step of the builder's guided chat. The SPA checks it against its own steps. */
    step: z.string().max(50),
    messages: z.array(sessionMessageSchema).min(1).max(MAX_MESSAGES),
    portfolio: portfolioSchema.nullable(),
    githubLogin: z.string().max(100).optional(),
  }),
  /** AI-edited files per template id: repo path → full contents. */
  fileEdits: z.record(templateIdSchema, z.record(z.string().regex(SAFE_REPO_PATH), z.string().max(MAX_FILE_CHARS))),
  /** Finished AI requests per template id, oldest first. */
  aiHistory: z.record(templateIdSchema, z.array(sessionTurnSchema).max(MAX_STORED_TURNS)),
})
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>

// The same session in the user's private GitHub workspace repo, split into files so a save writes only what
// changed (paths inside the project's folder; makable-backend mirrors these schemas):
//   state.json                  the small part that changes often, and an index of the other files
//   messages/0001.json …        the chat in chunks; full chunks never change again
//   ai-history/<template>.json  a template's AI turns
//   files/<template>/<path>     each AI-edited file, as plain text

export const WORKSPACE_FORMAT = 'makable-workspace'
export const WORKSPACE_VERSION = 1
/** A chunk closes once it would pass this size or count, so every save stays small. */
export const CHUNK_MAX_BYTES = 48_000
export const CHUNK_MAX_MESSAGES = 200
export const MAX_CHUNKS = 9999

export const workspaceStateSchema = z.object({
  format: z.literal(WORKSPACE_FORMAT),
  version: z.literal(WORKSPACE_VERSION),
  savedAt: z.iso.datetime(),
  login: z.string().max(100).nullable(),
  projectId: z.uuid(),
  conversation: z.object({
    step: z.string().max(50),
    portfolio: portfolioSchema.nullable(),
    githubLogin: z.string().max(100).optional(),
  }),
  /** The chat is in `messages/0001.json` … `messages/<messageChunks>.json`. */
  messageChunks: z.number().int().min(0).max(MAX_CHUNKS),
  /** AI-edited files per template id, each at `files/<template>/<path>`. */
  files: z.record(templateIdSchema, z.array(z.string().regex(SAFE_REPO_PATH)).max(500)),
  /** Templates with AI history, each at `ai-history/<template>.json`. */
  aiHistory: z.array(templateIdSchema).max(500),
})
export type WorkspaceState = z.infer<typeof workspaceStateSchema>

export const messageChunkSchema = z.object({ messages: z.array(sessionMessageSchema).min(1).max(CHUNK_MAX_MESSAGES) })
export const aiHistoryFileSchema = z.array(sessionTurnSchema).max(MAX_STORED_TURNS)

export const chunkPath = (index: number) => `messages/${String(index).padStart(4, '0')}.json`
export const aiHistoryPath = (template: string) => `ai-history/${template}.json`
export const editedFilePath = (template: string, path: string) => `files/${template}/${path}`
