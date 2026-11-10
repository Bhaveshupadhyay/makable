import { ArrowUpRight, CalendarClock, LifeBuoy, Mail } from 'lucide-react'
import { analytics } from '@/shared/lib/analytics'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { MEETING_URL, SUPPORT_EMAIL, SUPPORT_MAILTO } from '../lib/links'

const track = (channel: 'email' | 'call') => analytics.track('support_contact_clicked', { channel, placement: 'header' })

/** The header's Support menu, on every page (guests too): email support in the user's mail app, or book a 1:1 call on Cal.com. */
export function SupportMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Support"
        title="Support"
        data-analytics="support_menu"
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent data-[state=open]:text-foreground lg:px-2.5"
      >
        <LifeBuoy className="size-4" />
        <span className="hidden lg:inline">Support</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-68">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">Need a hand?</p>
          <p className="text-xs text-muted-foreground">Questions, bugs or ideas: write to us or book a call.</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild data-analytics="support_email" onSelect={() => track('email')}>
          <a href={SUPPORT_MAILTO}>
            <Mail />
            <span className="flex min-w-0 flex-col">
              <span>Email support</span>
              <span className="truncate text-xs text-muted-foreground">{SUPPORT_EMAIL}</span>
            </span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild data-analytics="support_call" onSelect={() => track('call')}>
          <a href={MEETING_URL} target="_blank" rel="noreferrer">
            <CalendarClock />
            <span className="flex min-w-0 flex-col">
              <span>Book a 1:1 call</span>
              <span className="text-xs text-muted-foreground">Pick a time with Bhavesh</span>
            </span>
            <ArrowUpRight className="ml-auto" />
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
