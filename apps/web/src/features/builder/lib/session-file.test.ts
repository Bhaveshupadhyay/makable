import { expect, test } from 'bun:test'
import { initialConversation } from './conversation'
import { checkSessionFileSize, readSessionFile, type SessionState, sessionFileName, toSnapshot } from './session-file'

const now = new Date('2026-10-10T12:00:00.000Z')
const state: SessionState = {
  projectId: '3f2a9c4e-8b1d-4c6a-9e2f-1a2b3c4d5e6f',
  conversation: {
    ...initialConversation(),
    step: 'bio',
    awaitingSignIn: true,
    portfolio: {
      profile: { name: 'Ada', headline: 'Engineer', bio: '', location: '', avatarUrl: '' },
      links: { github: 'https://github.com/ada', linkedin: '', x: '', website: '', email: '' },
      skills: ['TypeScript'],
      projects: [],
      template: 'minimal',
    },
  },
  fileEdits: { minimal: { 'src/index.css': 'a { color: red }' } },
  aiHistory: { minimal: [{ id: 't1', instruction: 'Make it red', target: 'Hero › <a>', reply: 'Made it red.' }] },
}

const exported = () => JSON.stringify(toSnapshot(state, 'octocat', now))

test('an exported session reads back the same, without transient state', () => {
  const read = readSessionFile(exported())
  if (!read.ok) throw new Error(read.error)
  expect(read.snapshot).toMatchObject({ format: 'makable-session', version: 1, exportedAt: '2026-10-10T12:00:00.000Z', login: 'octocat' })
  const { awaitingSignIn: _, ...conversation } = state.conversation
  expect(read.state).toEqual({ ...state, conversation })
})

test('the file name says whose session it is and when', () => {
  expect(sessionFileName('octocat', now)).toBe('makable-session-octocat-2026-10-10.json')
  expect(sessionFileName(null, now)).toBe('makable-session-guest-2026-10-10.json')
})

test('files that are not sessions, newer, damaged or unsafe are rejected with a reason', () => {
  const edit = (change: (json: Record<string, any>) => void) => {
    const json = JSON.parse(exported())
    change(json)
    return readSessionFile(JSON.stringify(json))
  }
  expect(readSessionFile('not json')).toEqual({ ok: false, error: "That file isn't a makable session." })
  expect(readSessionFile('{"hello":1}')).toEqual({ ok: false, error: "That file isn't a makable session." })
  expect(edit((j) => (j.version = 2))).toMatchObject({ ok: false, error: expect.stringContaining('newer version') })
  expect(edit((j) => (j.conversation.step = 'publishing'))).toMatchObject({ ok: false, error: expect.stringContaining('unknown step') })
  expect(edit((j) => (j.fileEdits.minimal['../x'] = 'y'))).toMatchObject({ ok: false, error: expect.stringContaining('fileEdits.minimal') })
  expect(edit((j) => (j.conversation.portfolio.links.x = 'javascript:alert(1)'))).toMatchObject({ ok: false, error: expect.stringContaining('damaged') })
})

test('oversized files are refused before reading', () => {
  expect(checkSessionFileSize(1000)).toBeNull()
  expect(checkSessionFileSize(5_000_001)).toContain('too large')
})
