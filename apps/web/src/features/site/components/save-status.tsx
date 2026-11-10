import { Cloud, CloudAlert, CloudCheck, CloudUpload, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { loginWithGithub } from '@/features/auth'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { GithubIcon } from '@/shared/ui/github-icon'
import type { SiteSync, SyncStatus } from '../hooks/use-site-sync'

/** Where the user's own edits stand, in the header: a menu with the details, Save now and the repo's link. */
export function SaveStatus({ sync, repoUrl }: { sync: SiteSync; repoUrl: string | null }) {
  const { status } = sync
  const location = useLocation()
  const now = useNow(status.state === 'saved')
  const { icon: Icon, label } = look(status)
  const problem = status.state === 'error' || status.state === 'blocked' || status.state === 'conflict' || status.state === 'load-failed'
  const busy = status.state === 'saving' || status.state === 'loading' || status.state === 'reconnecting'
  // The browser signed in again a moment ago and GitHub still refused: the user does it this time.
  const reconnect = (status.state === 'load-failed' || status.state === 'blocked') && status.reconnect

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Saving to GitHub: ${label}`} title={`Saving to GitHub: ${label}`}>
            <Icon className={busy ? 'animate-pulse' : problem ? 'text-destructive' : undefined} />
            <span className="hidden md:inline">{label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">Saved to GitHub</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{describe(status, now)}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {reconnect ? (
            <DropdownMenuItem onSelect={() => loginWithGithub(location.pathname + location.search)}>
              <GithubIcon />
              Connect GitHub again
            </DropdownMenuItem>
          ) : status.state === 'load-failed' ? (
            <DropdownMenuItem onSelect={sync.reload}>
              <RefreshCw />
              Load again
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={status.state !== 'pending' && status.state !== 'error' && status.state !== 'blocked'} onSelect={sync.saveNow}>
              <CloudUpload />
              Save now
            </DropdownMenuItem>
          )}
          {repoUrl && (
            <DropdownMenuItem asChild>
              <a href={repoUrl} target="_blank" rel="noreferrer">
                <ExternalLink />
                Open the repo on GitHub
              </a>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {status.state === 'conflict' && (
        <div
          role="dialog"
          aria-label="Changed somewhere else"
          className="absolute top-full right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-background p-3 text-sm shadow-lg"
        >
          <p className="font-medium">This site was changed somewhere else.</p>
          <p className="mt-1 text-muted-foreground">
            Its repo on GitHub has changes this browser hasn't seen (another tab or device), and you have edits that aren't saved yet.
            Nothing was overwritten.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" autoFocus onClick={() => sync.resolve('load')}>
              Drop my edits
            </Button>
            <Button size="sm" onClick={() => sync.resolve('keep')}>
              Keep my edits
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function look(status: SyncStatus): { icon: typeof Cloud; label: string } {
  switch (status.state) {
    case 'loading':
      return { icon: LoaderCircle, label: 'Loading…' }
    case 'pending':
      return { icon: Cloud, label: 'Unsaved' }
    case 'saving':
      return { icon: LoaderCircle, label: 'Saving…' }
    case 'saved':
      return { icon: CloudCheck, label: 'Saved' }
    case 'load-failed':
    case 'error':
    case 'blocked':
      return { icon: CloudAlert, label: status.state === 'load-failed' ? 'Not loaded' : 'Not saved' }
    case 'conflict':
      return { icon: CloudAlert, label: 'Changed elsewhere' }
    case 'reconnecting':
      return { icon: LoaderCircle, label: 'Reconnecting…' }
  }
}

function describe(status: SyncStatus, now: number): string {
  switch (status.state) {
    case 'loading':
      return 'Loading your site from its repo…'
    case 'pending':
      return 'Your edits are saved to the repo after a short pause.'
    case 'saving':
      return 'Saving your edits…'
    case 'saved':
      return status.at ? `Your edits were saved ${ago(status.at, now)}.` : 'Everything is in your site’s repo on GitHub.'
    case 'load-failed':
    case 'error':
    case 'blocked':
      return status.message
    case 'conflict':
      return 'Changed somewhere else. Choose which version to keep.'
    case 'reconnecting':
      // The browser is signing in again for a new GitHub token, back to this page.
      return 'makable’s access to your GitHub stopped working, so it’s connecting again. Your edits are kept.'
  }
}

/** The current time, ticking every 30 s while `ticking`, for "saved 2 min ago". */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [ticking])
  return now
}

function ago(iso: string, now: number): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
