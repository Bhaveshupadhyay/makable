import { Link, Outlet } from 'react-router'
import { UserMenu } from '@/features/auth'
import { SiteNav } from '@/features/marketing'
import { HeaderSlot, HeaderSlotProvider } from '@/shared/ui/header-slot'
import { MakableIcon } from '@/shared/ui/makable-logo'
import { ThemeMenu } from '@/shared/ui/theme-menu'
import { AnalyticsTracker } from '../analytics-tracker'

/** App shell. Pages can add actions to the header (`HeaderActions`); the theme switch is always there, the user menu once GitHub is connected. */
export function AppLayout() {
  return (
    <HeaderSlotProvider>
      <AnalyticsTracker />
      <div className="flex min-h-svh flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2 sm:gap-6">
            <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <MakableIcon className="size-6" />
              <span className="hidden sm:inline">makable</span>
            </Link>
            <SiteNav />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <HeaderSlot className="flex items-center gap-1" />
            <ThemeMenu />
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
