import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/features/auth'
import { listSites } from '@/features/site'

export const sitesKey = (login: string | undefined) => ['sites', login] as const

/** The user's sites, newest first. */
export function useSites() {
  const login = useSession().data?.login
  return useQuery({ queryKey: sitesKey(login), queryFn: listSites, enabled: !!login, staleTime: 60_000 })
}
