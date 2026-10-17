import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/features/auth'
import { ApiError } from '@/shared/lib/api-client'
import { getThread } from '../api/ai'

export const threadKey = (login: string | undefined, projectId: string) => ['ai-thread', login, projectId] as const

/** The site's chat on the server (its finished requests and a run waiting for the user). Empty for a new site. */
export function useThread(projectId: string) {
  const login = useSession().data?.login
  return useQuery({
    queryKey: threadKey(login, projectId),
    queryFn: () => getThread(projectId),
    enabled: !!login,
    staleTime: 30_000,
    // A site makable doesn't know yet (nothing was asked) has no thread: that's not worth retrying.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
}
