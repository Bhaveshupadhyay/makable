import { expect, test } from 'bun:test'
import type { AiThread } from '@/features/ai-edit'
import { assistant, buildChat, pausedRunChat } from './chat'

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

test('a paused run shows its request, what was said on the way, its question, and what the user just sent', () => {
  const run = {
    runId: 'r',
    mode: 'create' as const,
    instruction: 'A bakery site',
    target: null,
    question: { question: 'Any name works. What should we call it?', options: [], allowFreeText: true },
    questions: [{ question: 'What should we call it?', answer: 'what is a name for?', chat: true }],
  }

  expect(pausedRunChat(run).map((m) => [m.role, m.text])).toEqual([
    ['user', 'A bakery site'],
    ['assistant', 'What should we call it?'],
    ['user', 'what is a name for?'],
    ['assistant', 'Any name works. What should we call it?'],
  ])
  expect(pausedRunChat(run, 'Can it be changed later?').at(-1)).toMatchObject({ role: 'user', text: 'Can it be changed later?' })
})

test('what the AI did before each question and before its reply stays with them', () => {
  const steps = ['Creating the repository', 'Planning the site', 'Writing src/App.tsx']
  const created: AiThread = {
    ...thread,
    turns: [{ ...thread.turns[0], questions: [{ question: 'Name?', answer: 'Crumb', steps: ['Thinking about your site'] }], steps }],
  }

  const chat = buildChat(created, { messages: [] })

  expect(chat.map((m) => m.steps)).toEqual([undefined, ['Thinking about your site'], undefined, steps])
  const run = { runId: 'r', mode: 'create' as const, instruction: 'A bakery site', target: null, question: { question: 'Name?', options: [], allowFreeText: true }, steps: ['Thinking about your site'] }
  expect(pausedRunChat(run).at(-1)?.steps).toEqual(['Thinking about your site'])
})

test("what a request took goes under the AI's reply, when the server sent it", () => {
  const usage = {
    modelCalls: 1,
    inputTokens: 1000,
    outputTokens: 200,
    totalTokens: 1200,
    reasoningTokens: null,
    cachedTokens: null,
    costUsd: null,
    modelSeconds: 3.2,
    seconds: 4.1,
  }
  const withUsage: AiThread = { ...thread, turns: [thread.turns[0], { ...thread.turns[1], usage }] }

  const chat = buildChat(withUsage, { messages: [] })

  expect(chat.find((m) => m.text === 'Pink now.')?.usage).toEqual(usage)
  expect(chat.filter((m) => m.usage)).toHaveLength(1)
})
