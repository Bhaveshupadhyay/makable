import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSession, logout } from '../api/session'

export const sessionQueryKey = ['auth', 'session'] as const

export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSession,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSuccess: () => queryClient.setQueryData(sessionQueryKey, null),
  })
}
