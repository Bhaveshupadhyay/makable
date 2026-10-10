import { Sparkles } from 'lucide-react'
import { Link, Outlet } from 'react-router'
import { UserMenu } from '@/features/auth'
import { HeaderSlot, HeaderSlotProvider } from '@/shared/ui/header-slot'

/** App shell. Pages can add actions to the header (`HeaderActions`); the user menu shows once GitHub is connected. */
export function AppLayout() {
  return (
    <HeaderSlotProvider>
      <div className="flex min-h-svh flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-5" />
            makable
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <HeaderSlot className="flex items-center gap-1" />
            <UserMenu />
          </div>
        </header>
        <div className="flex-1">
          <Outlet />
        </div>
      </div>
    </HeaderSlotProvider>
  )
}
