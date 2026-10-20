import { expect, test } from 'bun:test'
import type { AiUsage } from '@makable/shared'
import { costText, durationText, tokenText, usageDetails, usageSummary } from './usage-text'

const usage: AiUsage = {
  modelCalls: 2,
  inputTokens: 11_200,
  outputTokens: 1_240,
  totalTokens: 12_440,
  reasoningTokens: 640,
  cachedTokens: 8_192,
  costUsd: 0.0213,
  modelSeconds: 9.46,
  seconds: 12.3,
}

test('durations read as seconds, then minutes', () => {
  expect([0.04, 0.84, 9.96, 12.3, 59.4, 60, 65.2, 125].map(durationText)).toEqual([
    '<0.1s',
    '0.8s',
    '10s',
    '12s',
    '59s',
    '1m',
    '1m 5s',
    '2m 5s',
  ])
})

test('token counts are exact below a thousand, then short', () => {
  expect([0, 842, 1_000, 12_440, 999_950, 1_250_000].map(tokenText)).toEqual(['0', '842', '1k', '12.4k', '1M', '1.3M'])
})

test('a cost keeps the digits of a fraction of a cent', () => {
  expect([0, 0.00004, 0.0021, 0.0213, 1.4].map(costText)).toEqual(['$0', '<$0.0001', '$0.0021', '$0.02', '$1.40'])
})

test('the line under the reply has the time and the tokens', () => {
  expect(usageSummary(usage)).toBe('12s · 12.4k tokens')
  expect(usageSummary({ ...usage, inputTokens: null, outputTokens: null, totalTokens: null })).toBe('12s')
})

test('the details say what each part was, leaving out what the provider did not report', () => {
  expect(usageDetails(usage)).toEqual([
    { label: 'Input', value: '11,200 tokens, 8,192 from the cache' },
    { label: 'Output', value: '1,240 tokens, 640 thinking' },
    { label: 'Cost', value: '$0.02' },
    { label: 'Model', value: '9.5s over 2 calls' },
    { label: 'In all', value: '12s' },
  ])
  const bare = { ...usage, modelCalls: 1, reasoningTokens: null, cachedTokens: 0, costUsd: null }
  expect(usageDetails(bare).map((row) => row.value)).toEqual(['11,200 tokens', '1,240 tokens', '9.5s over 1 call', '12s'])
  expect(usageDetails({ ...usage, inputTokens: null, outputTokens: null, totalTokens: null })[0]).toEqual({
    label: 'Tokens',
    value: "The provider didn't say",
  })
})
