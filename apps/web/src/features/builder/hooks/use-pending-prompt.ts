import { useSyncExternalStore } from 'react'
import { readPendingPrompt, subscribePendingPrompt } from '../lib/pending-prompt'

/** The prompt waiting to be built (`savePendingPrompt` changes it). */
export function usePendingPrompt(): string | null {
  return useSyncExternalStore(subscribePendingPrompt, readPendingPrompt, () => null)
}
