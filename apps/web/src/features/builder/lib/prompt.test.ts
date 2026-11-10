import { expect, test } from 'bun:test'
import { MAX_PROMPT } from '@makable/shared'
import { promptProblem } from './prompt'

test('a description up to the limit can be sent, counting it trimmed', () => {
  expect(promptProblem('A site for my bakery')).toBeNull()
  expect(promptProblem('x'.repeat(MAX_PROMPT))).toBeNull()
  expect(promptProblem(`  ${'x'.repeat(MAX_PROMPT)}\n\n`)).toBeNull()
})

test('a longer one says the limit and its length', () => {
  expect(promptProblem('x'.repeat(MAX_PROMPT + 213))).toBe('Keep the description under 4,000 characters (it’s 4,213).')
})
