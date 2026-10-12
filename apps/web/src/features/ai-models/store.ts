import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ModelPick } from './lib/model-options'

type ModelPickState = {
  /** The model each account last picked in the chat's menu, by GitHub login. A key belongs to one account. */
  picks: Record<string, ModelPick>
  setPick: (login: string, pick: ModelPick) => void
}

export const useModelPickStore = create<ModelPickState>()(
  persist(
    (set) => ({
      picks: {},
      setPick: (login, pick) =>
        set(({ picks }) => ({ picks: { ...picks, [login]: pick } })),
    }),
    { name: 'makable:ai-model', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)
