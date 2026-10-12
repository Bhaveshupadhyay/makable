import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MOCK_AUTH, useSession } from '@/features/auth'
import { addKey, checkKey, deleteKey, fetchKeys, fetchModelOptions, fetchProviders, setKeyModels } from '../api/ai-keys'
import type { AiKeyChecked } from '../types'

export const aiQueryKeys = {
  all: ['ai'] as const,
  providers: ['ai', 'providers'] as const,
  keys: ['ai', 'keys'] as const,
  models: ['ai', 'models'] as const,
  /** Every chat model a key can use, from its last add or check. Not refetched on its own: a check calls the provider. */
  available: (keyId: string) => ['ai', 'available', keyId] as const,
}

/** The fixed provider list. Only for signed-in users, like every `/ai` route. */
export function useAiProviders() {
  const signedIn = useSignedIn()
  return useQuery({ queryKey: aiQueryKeys.providers, queryFn: fetchProviders, enabled: signedIn, staleTime: Infinity })
}

export function useAiKeys() {
  const signedIn = useSignedIn()
  return useQuery({ queryKey: aiQueryKeys.keys, queryFn: fetchKeys, enabled: signedIn })
}

/** The chat's model menu. */
export function useModelOptions() {
  const signedIn = useSignedIn()
  return useQuery({ queryKey: aiQueryKeys.models, queryFn: fetchModelOptions, enabled: signedIn, staleTime: 60_000 })
}

/** Refetches keys and the menu, e.g. after an AI edit found a key refused. */
export function useRefreshAiModels() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: aiQueryKeys.all })
}

function useKeyMutation<TVars, TData>(mutationFn: (vars: TVars) => Promise<TData>, onData?: (data: TData) => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      onData?.(data)
      void queryClient.invalidateQueries({ queryKey: aiQueryKeys.keys })
      void queryClient.invalidateQueries({ queryKey: aiQueryKeys.models })
    },
  })
}

export function useAddKey() {
  const queryClient = useQueryClient()
  return useKeyMutation(addKey, (data: AiKeyChecked) => queryClient.setQueryData(aiQueryKeys.available(data.key.id), data.availableModels))
}

export function useCheckKey() {
  const queryClient = useQueryClient()
  return useKeyMutation(checkKey, (data: AiKeyChecked) => queryClient.setQueryData(aiQueryKeys.available(data.key.id), data.availableModels))
}

export function useSetKeyModels() {
  return useKeyMutation(setKeyModels)
}

export function useDeleteKey() {
  return useKeyMutation(deleteKey)
}

/** A key's available models, if it was added or checked in this tab. */
export function useAvailableModels(keyId: string) {
  return useQuery<string[]>({ queryKey: aiQueryKeys.available(keyId), queryFn: () => [], enabled: false })
}

/** Signed in with a real session: mock sign-in has no backend to keep keys (like GitHub sync). */
function useSignedIn() {
  return Boolean(useSession().data) && !MOCK_AUTH
}
