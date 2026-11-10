import { beforeEach, expect, test } from 'bun:test'
import { readPendingPrompt, savePendingPrompt, subscribePendingPrompt } from './pending-prompt'

/** sessionStorage that can be full (writes throw) or blocked (everything throws), like a browser's. */
class FakeStorage {
  data = new Map<string, string>()
  full = false
  blocked = false
  getItem(key: string) {
    if (this.blocked) throw new Error('SecurityError')
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.blocked) throw new Error('SecurityError')
    if (this.full) throw new Error('QuotaExceededError')
    this.data.set(key, value)
  }
  removeItem(key: string) {
    if (this.blocked) throw new Error('SecurityError')
    this.data.delete(key)
  }
}

let storage: FakeStorage
beforeEach(() => {
  storage = new FakeStorage()
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true })
  savePendingPrompt(null)
})

test('a saved prompt is read back until it is forgotten, and listeners hear each change', () => {
  let heard = 0
  const stop = subscribePendingPrompt(() => heard++)
  savePendingPrompt('A site for my bakery')
  expect(readPendingPrompt()).toBe('A site for my bakery')
  expect(storage.data.get('makable:pending-prompt')).toBe('A site for my bakery')
  savePendingPrompt(null)
  expect(readPendingPrompt()).toBeNull()
  stop()
  savePendingPrompt('Not heard')
  expect(heard).toBe(2)
})

test('storage that is full gives the new prompt, not the older one it still has', () => {
  savePendingPrompt('An older prompt')
  storage.full = true
  savePendingPrompt('The new prompt')
  expect(readPendingPrompt()).toBe('The new prompt')
  // The older one is gone from storage too, so a reload doesn't bring it back.
  expect(storage.data.has('makable:pending-prompt')).toBe(false)
  storage.full = false
  savePendingPrompt('Stored again')
  expect(readPendingPrompt()).toBe('Stored again')
  expect(storage.data.get('makable:pending-prompt')).toBe('Stored again')
})

test('blocked storage keeps the prompt in memory', () => {
  storage.blocked = true
  savePendingPrompt('A site for my bakery')
  expect(readPendingPrompt()).toBe('A site for my bakery')
  savePendingPrompt(null)
  expect(readPendingPrompt()).toBeNull()
})
