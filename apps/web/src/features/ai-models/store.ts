import type { AiModelChoice } from '@makable/shared'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type ModelPickState = {
  /** The model each account last picked in the chat's menu, by GitHub login. A key belongs to one account. */
  picks: Record<string, AiModelChoice>
  setPick: (login: string, pick: AiModelChoice | undefined) => void
}

export const useModelPickStore = create<ModelPickState>()(
  persist(
    (set) => ({
      picks: {},
      setPick: (login, pick) =>
        set(({ picks }) => {
          const next = { ...picks }
          if (pick) next[login] = pick
          else delete next[login]
          return { picks: next }
        }),
    }),
    { name: 'makable:ai-model', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)
