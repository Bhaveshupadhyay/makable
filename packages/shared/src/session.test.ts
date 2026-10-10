import { expect, test } from 'bun:test'
import { type SessionSnapshot, sessionSnapshotSchema } from './session'

const snapshot: SessionSnapshot = {
  format: 'makable-session',
  version: 1,
  exportedAt: '2026-10-10T12:00:00.000Z',
  login: 'octocat',
  projectId: '3f2a9c4e-8b1d-4c6a-9e2f-1a2b3c4d5e6f',
  conversation: {
    step: 'done',
    messages: [{ id: 'm1', role: 'assistant', text: 'Hi!', replies: ['I want a portfolio'] }],
    portfolio: {
      profile: { name: 'Ada', headline: 'Engineer', bio: '', location: '', avatarUrl: '' },
      links: { github: 'https://github.com/ada', linkedin: '', x: '', website: '', email: '' },
      skills: ['TypeScript'],
      projects: [],
      template: 'minimal',
    },
  },
  fileEdits: { minimal: { 'src/index.css': 'a { color: red }' } },
  aiHistory: { minimal: [{ id: 't1', instruction: 'Make it red', target: null, reply: 'Made it red.' }] },
}

test('a valid session snapshot passes', () => {
  expect(sessionSnapshotSchema.safeParse(snapshot).success).toBe(true)
})

test('unsafe or oversized content is rejected', () => {
  const bad = (over: Partial<SessionSnapshot>) => sessionSnapshotSchema.safeParse({ ...snapshot, ...over }).success
  expect(bad({ version: 2 as 1 })).toBe(false)
  expect(bad({ fileEdits: { minimal: { '../secrets': 'x' } } })).toBe(false)
  expect(bad({ fileEdits: { 'Not An Id': {} } })).toBe(false)
  expect(bad({ fileEdits: { minimal: { 'a.css': 'x'.repeat(60_001) } } })).toBe(false)
  expect(bad({ projectId: 'not-a-uuid' })).toBe(false)
  expect(bad({ conversation: { ...snapshot.conversation, messages: [] } })).toBe(false)
  const badUrl = { ...snapshot.conversation.portfolio!, links: { ...snapshot.conversation.portfolio!.links, x: 'javascript:alert(1)' } }
  expect(bad({ conversation: { ...snapshot.conversation, portfolio: badUrl } })).toBe(false)
})
