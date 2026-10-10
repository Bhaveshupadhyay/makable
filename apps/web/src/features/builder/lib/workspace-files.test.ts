import { expect, test } from 'bun:test'
import { CHUNK_MAX_BYTES, CHUNK_MAX_MESSAGES, type SessionMessage } from '@makable/shared'
import { initialConversation } from './conversation'
import type { SessionState } from './session-file'
import {
  BATCH_MAX_BYTES,
  chunkMessages,
  fromWorkspaceFiles,
  hashFiles,
  listedParts,
  planSave,
  STATE_KEY,
  toWorkspaceFiles,
} from './workspace-files'

const message = (i: number, text = `message ${i}`): SessionMessage => ({ id: `m${i}`, role: i % 2 ? 'user' : 'assistant', text })
const messages = (n: number, text?: string) => Array.from({ length: n }, (_, i) => message(i + 1, text))
const portfolio = {
  profile: { name: 'Ada', headline: 'Engineer', bio: '', location: '', avatarUrl: '' },
  links: { github: '', linkedin: '', x: '', website: '', email: '' },
  skills: [],
  projects: [],
  template: 'minimal',
}
const session = (n = 3): SessionState => ({
  projectId: '3f2a9c4e-8b1d-4c6a-9e2f-1a2b3c4d5e6f',
  conversation: { ...initialConversation(), step: 'done', portfolio, messages: messages(n) },
  fileEdits: { minimal: { 'src/index.css': 'a { color: red }' } },
  aiHistory: { minimal: [{ id: 't1', instruction: 'Make it red', target: null, reply: 'Made it red.' }], paper: [] },
})
const now = new Date('2026-10-10T12:00:00.000Z')

test('chunks stay under the size and count caps, and appending never changes a full chunk', () => {
  const long = messages(30, 'x'.repeat(5000))
  const chunks = chunkMessages(long)
  expect(chunks.flat()).toEqual(long)
  for (const chunk of chunks) expect(new TextEncoder().encode(chunk.map((m) => JSON.stringify(m)).join('\n')).length).toBeLessThanOrEqual(CHUNK_MAX_BYTES)
  expect(chunkMessages(messages(450)).map((c) => c.length)).toEqual([CHUNK_MAX_MESSAGES, CHUNK_MAX_MESSAGES, 50])

  const more = chunkMessages([...long, message(31), message(32)])
  expect(more.slice(0, chunks.length - 1)).toEqual(chunks.slice(0, -1))
  // A message bigger than a chunk gets one to itself.
  expect(chunkMessages([message(1, 'y'.repeat(60_000)), message(2)]).length).toBe(2)
})

test('a session becomes workspace files and comes back the same', () => {
  const files = toWorkspaceFiles(session(), 'octocat', now)
  expect(files.state).toMatchObject({ savedAt: '2026-10-10T12:00:00.000Z', login: 'octocat', messageChunks: 1, files: { minimal: ['src/index.css'] }, aiHistory: ['minimal'] })
  expect(listedParts(files.state)).toEqual(['messages/0001.json', 'ai-history/minimal.json', 'files/minimal/src/index.css'])
  expect(Object.keys(files.parts).sort()).toEqual([...listedParts(files.state)].sort())

  const back = fromWorkspaceFiles(files)
  if (!back.ok) throw new Error(back.error)
  // Templates with no AI turns aren't saved.
  const { paper: _, ...aiHistory } = session().aiHistory
  expect(back.state).toEqual({ ...session(), aiHistory })
})

test('a saved session with a missing or damaged file is refused, not half-restored', () => {
  const files = toWorkspaceFiles(session(), 'octocat', now)
  const missing = { ...files, parts: { ...files.parts } }
  delete missing.parts['files/minimal/src/index.css']
  expect(fromWorkspaceFiles(missing)).toMatchObject({ ok: false, error: expect.stringContaining('files/minimal/src/index.css is missing') })
  expect(fromWorkspaceFiles({ ...files, parts: { ...files.parts, 'messages/0001.json': '{"messages": []}' } }).ok).toBe(false)
})

test('a save sends only what changed, removes what went away, and nothing when nothing changed', async () => {
  const first = toWorkspaceFiles(session(3), 'octocat', now)
  const synced = await hashFiles(first)
  expect(planSave(first, synced, null)?.[0].parts.map((p) => p.path)).toEqual(Object.keys(first.parts))

  // Same content at a later time: nothing to send.
  const again = toWorkspaceFiles(session(3), 'octocat', new Date('2026-10-10T13:00:00.000Z'))
  expect(planSave(again, await hashFiles(again), synced)).toBeNull()

  // One more message and the AI-edited file reverted: the chunk changes, the file goes away.
  const next = { ...session(4), fileEdits: {} }
  const files = toWorkspaceFiles(next, 'octocat', now)
  const [batch] = planSave(files, await hashFiles(files), synced)!
  expect(batch.parts.map((p) => p.path)).toEqual(['messages/0001.json'])
  expect(batch.deletes).toEqual(['files/minimal/src/index.css'])
  expect(batch.state?.files).toEqual({})
})

test('a big save goes up in batches, with the state only in the last one', async () => {
  const long = session()
  const big = toWorkspaceFiles({ ...long, conversation: { ...long.conversation, messages: messages(2000, 'x'.repeat(1000)) } }, 'octocat', now)
  const batches = planSave(big, await hashFiles(big), null)!
  expect(batches.length).toBeGreaterThan(1)
  for (const batch of batches.slice(0, -1)) {
    expect(batch.state).toBeUndefined()
    expect(batch.parts.reduce((n, p) => n + p.content.length, 0)).toBeLessThanOrEqual(BATCH_MAX_BYTES)
  }
  expect(batches.at(-1)?.state?.messageChunks).toBe(big.state.messageChunks)
  expect(batches.flatMap((b) => b.parts.map((p) => p.path)).sort()).toEqual(Object.keys(big.parts).sort())
  expect(STATE_KEY in (await hashFiles(big))).toBe(true)
})
