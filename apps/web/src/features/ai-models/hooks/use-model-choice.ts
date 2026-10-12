import { useSession } from '@/features/auth'
import { findPick, toChoice } from '../lib/model-options'
import { useModelPickStore } from '../store'
import type { AiModelOption } from '../types'
import { useModelOptions } from './use-ai-keys'

/**
 * The model AI edits use: the signed-in user's pick from the chat's menu, while it's still offered, else
 * makable's own. `choice` is what goes in the request (undefined for makable's own).
 */
export function useModelChoice() {
  const login = useSession().data?.login
  const { data: options = [] } = useModelOptions()
  const pick = useModelPickStore((s) => (login ? s.picks[login] : undefined))
  const setPick = useModelPickStore((s) => s.setPick)
  const selected = findPick(pick, options)

  function select(option: AiModelOption | null) {
    if (login) setPick(login, toChoice(option))
  }

  return { options, selected, choice: toChoice(selected), select }
}
