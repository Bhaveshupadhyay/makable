import { useSession } from '@/features/auth'
import { analytics } from '@/shared/lib/analytics'
import { type ModelStatus, modelStatus, resolvePick, toChoice, toPick } from '../lib/model-options'
import { useModelPickStore } from '../store'
import type { AiModelOption } from '../types'
import { useAiKeys, useModelOptions } from './use-ai-keys'

/**
 * The model AI edits use: the signed-in user's pick from the chat's menu while it's still offered, else their
 * first own model, else makable's (see `resolvePick`). `choice` is what goes in the request (undefined for
 * makable's own).
 */
export function useModelChoice() {
  const login = useSession().data?.login
  const { data: options = [] } = useModelOptions()
  const pick = useModelPickStore((s) => (login ? s.picks[login] : undefined))
  const setPick = useModelPickStore((s) => s.setPick)
  const selected = resolvePick(pick, options)

  function select(option: AiModelOption | null) {
    if (!login) return
    analytics.track('ai_model_picked', { model: option?.model ?? 'makable-default', provider: option?.provider ?? null, is_default: !option?.keyId })
    setPick(login, toPick(option))
  }

  // makable's own model when nothing of the user's is picked.
  const acceptsImages = (selected ?? options.find((o) => !o.keyId))?.acceptsImages ?? false
  return { options, selected, choice: toChoice(selected), acceptsImages, select }
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
