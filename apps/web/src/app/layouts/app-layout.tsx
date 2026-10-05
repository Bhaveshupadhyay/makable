import { Sparkles } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { UserMenu } from '@/features/auth'

/** Shell for signed-in screens. */
export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-5" />
          makable
        </Link>
        <UserMenu />
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
