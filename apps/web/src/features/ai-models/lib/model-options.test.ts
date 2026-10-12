import { expect, test } from 'bun:test'
import type { AiModelOption } from '../types'
import { filterModels, findPick, groupOptions, MAX_ENABLED_MODELS, toChoice, toggleModel } from './model-options'

const KEY_A = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b'
const KEY_B = '0b5e2c1d-7a8f-4e3b-9c2d-1e0f3a4b5c6d'
const options: AiModelOption[] = [
  { keyId: null, provider: null, model: 'auto' },
  { keyId: KEY_A, provider: 'openai', model: 'gpt-5' },
  { keyId: KEY_A, provider: 'openai', model: 'o4-mini' },
  { keyId: KEY_B, provider: 'groq', model: 'llama-3.3-70b-versatile' },
]

test('a stored pick counts only while the menu still offers it', () => {
  expect(findPick({ keyId: KEY_A, model: 'o4-mini' }, options)).toBe(options[2])
  // The key was removed or refused, or the model turned off: back to makable's own.
  expect(findPick({ keyId: KEY_A, model: 'gpt-4.1' }, options)).toBeNull()
  expect(findPick({ keyId: '00000000-0000-4000-8000-000000000000', model: 'gpt-5' }, options)).toBeNull()
  expect(findPick(undefined, options)).toBeNull()
})

test('makable’s own model is sent as no choice', () => {
  expect(toChoice(options[0])).toBeUndefined()
  expect(toChoice(null)).toBeUndefined()
  expect(toChoice(options[3])).toEqual({ keyId: KEY_B, model: 'llama-3.3-70b-versatile' })
})

test('the menu is grouped by key with makable’s own first', () => {
  const groups = groupOptions([options[1], options[0], options[3], options[2]])
  expect(groups.map((g) => [g.keyId, g.options.map((o) => o.model)])).toEqual([
    [null, ['auto']],
    [KEY_A, ['gpt-5', 'o4-mini']],
    [KEY_B, ['llama-3.3-70b-versatile']],
  ])
})

test('toggling keeps the order models were turned on in and stops at the limit', () => {
  expect(toggleModel(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
  expect(toggleModel(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  const full = Array.from({ length: MAX_ENABLED_MODELS }, (_, i) => `m${i}`)
  expect(toggleModel(full, 'extra')).toBe(full)
  expect(toggleModel(full, 'm3')).toHaveLength(MAX_ENABLED_MODELS - 1)
})

test('search matches any part of the id, ignoring case', () => {
  const models = ['openai/gpt-5', 'meta-llama/llama-3.3-70b:free', 'anthropic/claude-sonnet-4.5']
  expect(filterModels(models, ' LLAMA ')).toEqual(['meta-llama/llama-3.3-70b:free'])
  expect(filterModels(models, '')).toBe(models)
})
