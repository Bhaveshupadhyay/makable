import { Cloud, CloudAlert, CloudCheck, CloudOff, CloudUpload, ExternalLink, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import type { GithubSync, SyncStatus } from '../hooks/use-github-sync'
import { WORKSPACE_REPO } from '../lib/conversation'

/** The GitHub saving status in the header: a menu with the details, Save now and the on/off switch. */
export function GithubSyncControl({ sync }: { sync: GithubSync }) {
  const { status } = sync
  const now = useNow(status.state === 'saved')
  const { icon: Icon, label } = look(status)

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`GitHub saving: ${label}`} title={`GitHub saving: ${label}`}>
            <Icon className={status.state === 'saving' ? 'animate-pulse' : status.state === 'error' || status.state === 'blocked' || status.state === 'conflict' ? 'text-destructive' : undefined} />
            <span className="hidden md:inline">{label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">Saved to GitHub</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{describe(status, now)}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!sync.enabled || status.state === 'saving' || status.state === 'idle'} onSelect={sync.saveNow}>
            <CloudUpload />
            Save now
          </DropdownMenuItem>
          {sync.repoUrl && (
            <DropdownMenuItem asChild>
              <a href={sync.repoUrl} target="_blank" rel="noreferrer">
                <ExternalLink />
                Open {WORKSPACE_REPO} on GitHub
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={sync.enabled} onCheckedChange={(on) => sync.setEnabled(on === true)}>
            Save to GitHub automatically
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {status.state === 'conflict' && (
        <div
          role="dialog"
          aria-label="Changed on another device"
          className="absolute top-full right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-background p-3 text-sm shadow-lg"
        >
          <p className="font-medium">This chat was changed on another device.</p>
          <p className="mt-1 text-muted-foreground">
            The version on GitHub{status.remoteSavedAt ? ` (saved ${formatTime(status.remoteSavedAt)})` : ''} is newer than the one this browser
            last saved. Nothing was overwritten.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" autoFocus onClick={() => sync.resolve('load')}>
              Load the other one
            </Button>
            <Button size="sm" onClick={() => sync.resolve('keep')}>
              Keep this one
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function look(status: SyncStatus): { icon: typeof Cloud; label: string } {
  switch (status.state) {
    case 'off':
      return { icon: CloudOff, label: 'Not saving' }
    case 'idle':
      return { icon: Cloud, label: 'Ready' }
    case 'saving':
      return { icon: LoaderCircle, label: 'Saving…' }
    case 'saved':
      return { icon: CloudCheck, label: 'Saved' }
    case 'error':
    case 'blocked':
      return { icon: CloudAlert, label: 'Not saved' }
    case 'conflict':
      return { icon: CloudAlert, label: 'Changed elsewhere' }
  }
}

function describe(status: SyncStatus, now: number): string {
  switch (status.state) {
    case 'off':
      return 'Off. Your chat stays in this browser only. Export it to keep a copy.'
    case 'idle':
      return `Your chat will be saved to a private ${WORKSPACE_REPO} repo once your site is started.`
    case 'saving':
      return 'Saving your chat and site…'
    case 'saved':
      return `Last saved ${ago(status.at, now)} to your private ${WORKSPACE_REPO} repo.`
    case 'error':
    case 'blocked':
      return status.message
    case 'conflict':
      return 'Changed on another device. Choose which version to keep.'
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
  return formatTime(iso)
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
