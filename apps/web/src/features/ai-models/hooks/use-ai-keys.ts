import type { AiModelChoice } from '@makable/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MOCK_AUTH, useSession } from '@/features/auth'
import { analytics } from '@/shared/lib/analytics'
import { ApiError } from '@/shared/lib/api-client'
import { addKey, checkKey, deleteKey, fetchKeys, fetchModelOptions, fetchProviders, setKeyModels } from '../api/ai-keys'
import { dropRejected } from '../lib/model-options'
import type { AiKeyChecked, AiModelOption } from '../types'

/**
 * Query keys, scoped to the signed-in login: keys and models belong to one account, so another account signing in
 * on this tab never sees the previous one's cached lists.
 */
export const aiQueryKeys = {
  all: (login: string | undefined) => ['ai', login] as const,
  providers: ['ai-providers'] as const,
  keys: (login: string | undefined) => ['ai', login, 'keys'] as const,
  models: (login: string | undefined) => ['ai', login, 'models'] as const,
  /** Every chat model a key can use, from its last add or check. Not refetched on its own: a check calls the provider. */
  available: (login: string | undefined, keyId: string) => ['ai', login, 'available', keyId] as const,
}

/** The fixed provider list (the same for everyone). Only for signed-in users, like every `/ai` route. */
export function useAiProviders() {
  const { signedIn } = useAccount()
  return useQuery({ queryKey: aiQueryKeys.providers, queryFn: fetchProviders, enabled: signedIn, staleTime: Infinity })
}

export function useAiKeys() {
  const { login, signedIn } = useAccount()
  return useQuery({ queryKey: aiQueryKeys.keys(login), queryFn: fetchKeys, enabled: signedIn })
}

/** The chat's model menu. */
export function useModelOptions() {
  const { login, signedIn } = useAccount()
  return useQuery({ queryKey: aiQueryKeys.models(login), queryFn: fetchModelOptions, enabled: signedIn, staleTime: 60_000 })
}

/**
 * After an AI edit was refused because of its model (`code`): drops the refused key or model from the cached menu
 * right away, so it can't be picked or sent again even if the refetch fails, then refetches keys and the menu.
 */
export function useModelRejected() {
  const queryClient = useQueryClient()
  const { login } = useAccount()
  return (choice: AiModelChoice | undefined, code: string) => {
    queryClient.setQueryData<AiModelOption[]>(aiQueryKeys.models(login), (options) => options && dropRejected(options, choice, code))
    return queryClient.invalidateQueries({ queryKey: aiQueryKeys.all(login) })
  }
}

/** Analytics for a key mutation. Never send `vars` as they are: adding a key carries the key itself. */
type KeyTracking<TVars, TData> = { success?: (data: TData, vars: TVars) => void; error?: (code: string | null, vars: TVars) => void }

function useKeyMutation<TVars, TData>(mutationFn: (vars: TVars) => Promise<TData>, onData?: (data: TData) => void, track?: KeyTracking<TVars, TData>) {
  const queryClient = useQueryClient()
  const { login } = useAccount()
  return useMutation({
    mutationFn,
    onError: (error, vars) => track?.error?.(error instanceof ApiError ? (error.code ?? null) : null, vars),
    onSuccess: (data, vars) => {
      track?.success?.(data, vars)
      onData?.(data)
      void queryClient.invalidateQueries({ queryKey: aiQueryKeys.keys(login) })
      void queryClient.invalidateQueries({ queryKey: aiQueryKeys.models(login) })
    },
  })
}

function useRememberAvailable() {
  const queryClient = useQueryClient()
  const { login } = useAccount()
  return (data: AiKeyChecked) => queryClient.setQueryData(aiQueryKeys.available(login, data.key.id), data.availableModels)
}

export function useAddKey() {
  return useKeyMutation(addKey, useRememberAvailable(), {
    success: (data) => analytics.track('ai_key_added', { provider: data.key.provider, models_available: data.availableModels.length }),
    error: (code, { provider }) => analytics.track('ai_key_add_failed', { provider, code }),
  })
}

export function useCheckKey() {
  return useKeyMutation(checkKey, useRememberAvailable(), {
    success: (data) => analytics.track('ai_key_checked', { key_id: data.key.id, ok: data.key.status === 'valid', code: null }),
    error: (code, keyId) => analytics.track('ai_key_checked', { key_id: keyId, ok: false, code }),
  })
}

export function useSetKeyModels() {
  return useKeyMutation(setKeyModels, undefined, {
    success: (_, { keyId, models }) => analytics.track('ai_key_models_saved', { key_id: keyId, models }),
  })
}

export function useDeleteKey() {
  return useKeyMutation(deleteKey, undefined, {
    success: (_, keyId) => analytics.track('ai_key_removed', { key_id: keyId }),
  })
}

/** A key's available models, if it was added or checked in this tab. */
export function useAvailableModels(keyId: string) {
  const { login } = useAccount()
  return useQuery<string[]>({ queryKey: aiQueryKeys.available(login, keyId), queryFn: () => [], enabled: false })
}

/** Signed in with a real session: mock sign-in has no backend to keep keys (like GitHub sync). */
function useAccount() {
  const login = useSession().data?.login
  return { login, signedIn: Boolean(login) && !MOCK_AUTH }
}
