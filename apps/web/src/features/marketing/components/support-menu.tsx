import { useState } from 'react'
import { ArrowUpRight, CalendarClock, Check, Copy, LifeBuoy, Mail } from 'lucide-react'
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

type Copied = 'idle' | 'copied' | 'failed'

const COPY_LABEL: Record<Copied, string> = {
  idle: 'Copy email address',
  copied: 'Copied',
  failed: 'Couldn’t copy it',
}

const track = (channel: 'email' | 'copy_email' | 'call') => analytics.track('support_contact_clicked', { channel, placement: 'header' })

/**
 * The header's Support menu, on every page (guests too): email support, or book a 1:1 call on Cal.com.
 * The address can be copied as well, since a mailto link does nothing on a computer with no mail app set up.
 */
export function SupportMenu() {
  const [copied, setCopied] = useState<Copied>('idle')

  async function copyEmail() {
    track('copy_email')
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && setCopied('idle')}>
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
        <DropdownMenuItem
          data-analytics="support_copy_email"
          onSelect={(event) => {
            // Stay open, so the item can say it's copied.
            event.preventDefault()
            void copyEmail()
          }}
        >
          {copied === 'copied' ? <Check /> : <Copy />}
          <span aria-live="polite">{COPY_LABEL[copied]}</span>
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
