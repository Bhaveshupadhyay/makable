import { expect, test } from 'bun:test'
import { elapsedText } from './thinking'

test('the time so far is in whole seconds, then minutes and seconds', () => {
  expect([0, 0.9, 1, 12.6, 59.99, 60, 65.2, 725].map(elapsedText)).toEqual(['0s', '0s', '1s', '12s', '59s', '1m 0s', '1m 5s', '12m 5s'])
  expect(elapsedText(-0.2)).toBe('0s')
})
