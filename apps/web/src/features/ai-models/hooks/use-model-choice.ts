import { useSession } from '@/features/auth'
import { fallbackOption, findPick, type ModelStatus, modelStatus, toChoice } from '../lib/model-options'
import { useModelPickStore } from '../store'
import type { AiModelOption } from '../types'
import { useAiKeys, useModelOptions } from './use-ai-keys'

/**
 * The model AI edits use: the signed-in user's pick from the chat's menu, while it's still offered, else
 * makable's own, else (no makable model) their first. `choice` is what goes in the request (undefined for
 * makable's own).
 */
export function useModelChoice() {
  const login = useSession().data?.login
  const { data: options = [] } = useModelOptions()
  const pick = useModelPickStore((s) => (login ? s.picks[login] : undefined))
  const setPick = useModelPickStore((s) => s.setPick)
  const selected = findPick(pick, options) ?? fallbackOption(options)

  function select(option: AiModelOption | null) {
    if (login) setPick(login, toChoice(option))
  }

  return { options, selected, choice: toChoice(selected), select }
}

/**
 * Whether AI edits have a model to use, so the AI box can ask for a key up front instead of failing. `ready`
 * until both lists have loaded (and under mock auth, which has no backend to ask): the request then answers for
 * itself.
 */
export function useModelStatus(): ModelStatus {
  const options = useModelOptions()
  const keys = useAiKeys()
  if (!options.isSuccess || !keys.isSuccess) return 'ready'
  return modelStatus(options.data, keys.data)
}
