import { LoaderCircle } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Button } from '@/shared/ui/button'
import { useSession } from '../hooks/use-session'

/** Route guard: renders child routes only for signed-in users. */
export function RequireAuth() {
  const { data: user, isPending, isError, refetch } = useSession()
  const location = useLocation()

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-muted-foreground">Couldn't reach the server.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (!user) {
    const returnTo = location.pathname + location.search
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }

  return <Outlet />
}
