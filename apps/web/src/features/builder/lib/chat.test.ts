import { expect, test } from 'bun:test'
import type { AiThread } from '@/features/ai-edit'
import { assistant, buildChat } from './chat'

const thread: AiThread = {
  projectId: 'p',
  status: 'idle',
  turns: [
    { instruction: 'A bakery site', target: null, outcome: 'applied', reply: 'Built it.', questions: [{ question: 'Name?', answer: 'Crumb' }], commitSha: 'a'.repeat(40), createdAt: '2026-10-15T10:00:00Z' },
    { instruction: 'Make it pink', target: 'Hero › <h1>', outcome: 'applied', reply: 'Pink now.', questions: [], commitSha: 'b'.repeat(40), createdAt: '2026-10-15T10:05:00Z' },
  ],
}

test("the thread's turns and the browser's messages are merged by time", () => {
  const note = { ...assistant('Published!'), at: '2026-10-15T10:02:00Z' }

  const chat = buildChat(thread, { messages: [note] })

  expect(chat.map((m) => m.text)).toEqual(['A bakery site', 'Name?', 'Crumb', 'Built it.', 'Published!', 'Make it pink', 'Pink now.'])
  expect(chat[5].caption).toBe('Hero › <h1>')
})

test('AI changes can be undone, but not the creation', () => {
  const chat = buildChat(thread, { messages: [] }, ['b'.repeat(40)])

  expect(chat.find((m) => m.text === 'Built it.')?.undo).toBeUndefined()
  expect(chat.find((m) => m.text === 'Pink now.')?.undo).toEqual({ commitSha: 'b'.repeat(40), done: true })
})
