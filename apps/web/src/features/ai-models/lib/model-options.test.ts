import { expect, test } from 'bun:test'
import type { AiModelOption } from '../types'
import { filterModels, groupOptions, MAX_ENABLED_MODELS, modelStatus, resolvePick, toChoice, toggleModel, toPick } from './model-options'

const KEY_A = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b'
const KEY_B = '0b5e2c1d-7a8f-4e3b-9c2d-1e0f3a4b5c6d'
const options: AiModelOption[] = [
  { keyId: null, provider: null, model: 'auto' },
  { keyId: KEY_A, provider: 'openai', model: 'gpt-5' },
  { keyId: KEY_A, provider: 'openai', model: 'o4-mini' },
  { keyId: KEY_B, provider: 'groq', model: 'llama-3.3-70b-versatile' },
]

test('the user’s own model is used unless makable’s was picked on purpose', () => {
  const own = options.slice(1)
  // A pick counts while the menu still offers it.
  expect(resolvePick({ keyId: KEY_A, model: 'o4-mini' }, options)).toBe(options[2])
  // No pick yet, or it's gone (key removed or refused, model turned off): their first model, not makable's.
  expect(resolvePick(undefined, options)).toBe(options[1])
  expect(resolvePick({ keyId: KEY_A, model: 'gpt-4.1' }, options)).toBe(options[1])
  // makable's own only when picked, or when they have no model of their own.
  expect(resolvePick('default', options)).toBeNull()
  expect(resolvePick(undefined, [options[0]])).toBeNull()
  // Picked makable's, but there's none (no AI_BASE_URL): their first.
  expect(resolvePick('default', own)).toBe(own[0])
  expect(resolvePick(undefined, [])).toBeNull()
})

test('picking remembers makable’s own on purpose', () => {
  expect(toPick(null)).toBe('default')
  expect(toPick(options[0])).toBe('default')
  expect(toPick(options[1])).toEqual({ keyId: KEY_A, model: 'gpt-5' })
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

test('the status says what AI edits are missing', () => {
  expect(modelStatus(options, [])).toBe('ready')
  expect(modelStatus([], [])).toBe('no-key')
  expect(modelStatus([], [{ status: 'valid' }])).toBe('no-models')
  expect(modelStatus([], [{ status: 'invalid' }])).toBe('key-invalid')
  expect(modelStatus([], [{ status: 'invalid' }, { status: 'valid' }])).toBe('no-models')
})
