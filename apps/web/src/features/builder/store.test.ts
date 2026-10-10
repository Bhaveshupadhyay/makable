import { expect, test } from 'bun:test'
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
