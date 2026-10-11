import { expect, test } from 'bun:test'
import { initialConversation } from './lib/conversation'
import { useBuilderStore } from './store'

const turn = (id: string, reply: string) => ({ id, instruction: `Request ${id}`, target: null, reply })

test('AI history is kept per template, and a rollback amends the turn it belongs to', () => {
  const { recordAiTurn, amendAiTurn } = useBuilderStore.getState()
  recordAiTurn('minimal', turn('a', 'Made it green.'))
  recordAiTurn('minimal', turn('b', 'Not done: it needs a deeper edit.'))
  recordAiTurn('paper', turn('c', 'Made it bold.'))

  amendAiTurn('minimal', 'a', 'Made it green. This broke the preview, so it was undone.')
  amendAiTurn('minimal', 'missing', 'ignored')

  const { aiHistory } = useBuilderStore.getState()
  expect(aiHistory.minimal.map((t) => t.reply)).toEqual(['Made it green. This broke the preview, so it was undone.', 'Not done: it needs a deeper edit.'])
  expect(aiHistory.paper.map((t) => t.id)).toEqual(['c'])

  useBuilderStore.getState().reset(null)
  expect(useBuilderStore.getState().aiHistory).toEqual({})
})

test('importing replaces the whole session for whoever imports it; start over gets a new project id', () => {
  const store = useBuilderStore.getState()
  store.recordAiTurn('minimal', turn('old', 'Old reply.'))
  store.setAiMode(true)
  const imported = {
    projectId: '3f2a9c4e-8b1d-4c6a-9e2f-1a2b3c4d5e6f',
    conversation: { ...initialConversation(), step: 'done' as const },
    fileEdits: { paper: { 'styles.css': 'a {}' } },
    aiHistory: { paper: [turn('new', 'New reply.')] },
  }

  store.importSession(imported, 'octocat')

  const after = useBuilderStore.getState()
  expect(after).toMatchObject({ login: 'octocat', aiMode: false, ...imported })
  expect(after.aiHistory.minimal).toBeUndefined()

  after.reset('octocat')
  const fresh = useBuilderStore.getState().projectId
  expect(fresh).not.toBe(imported.projectId)
  expect(fresh).toMatch(/^[0-9a-f-]{36}$/)
})
