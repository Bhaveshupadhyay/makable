import { ArrowUpRight, LoaderCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useThread } from '@/features/ai-edit'
import { useSession } from '@/features/auth'
import { Landing } from '@/features/marketing'
import { useSiteStore } from '@/features/site'
import { Button } from '@/shared/ui/button'
import { CreateView } from '../components/create-view'
import { HomePrompt } from '../components/home-prompt'
import { useSites } from '../hooks/use-sites'
import { Workspace } from '../components/workspace'
import { type CreateSite, useCreateSite } from '../hooks/use-create-site'
import { takePendingPrompt } from '../lib/pending-prompt'
import { useSiteChat } from '../store'

/**
 * The home page. Guests get the landing page, whose prompt box asks them to sign in. Signed in: the landing page
 * until a site is started, then the chat while it's built, then the chat beside the live preview.
 */
export function BuilderPage() {
  const session = useSession()
  const login = useSiteStore((s) => s.login)
  const claim = useSiteStore((s) => s.claim)
  const reset = useSiteStore((s) => s.reset)
  // Who is building: a GitHub login, null for a guest, or undefined while the session loads.
  const user = session.data ?? null
  const owner = session.isPending ? undefined : (user?.login ?? null)

  // Only a confirmed session moves the site, so a server error can't hide an account's work. Another account on
  // this browser starts fresh; what a guest had (nothing but a project id) is theirs once they sign in.
  useEffect(() => {
    if (!session.isSuccess || login === owner) return
    if (login === null && owner) claim(owner)
    else reset(owner ?? null)
  }, [session.isSuccess, login, owner, claim, reset])

  if (owner === undefined || (user && login !== owner)) return <Spinner />

  if (session.isError && login !== null) {
    return (
      <div className="flex h-[calc(100svh-3.5rem)] flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-muted-foreground">Couldn't reach the server.</p>
        <Button variant="outline" onClick={() => void session.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (!user) {
    return (
      <Landing>
        <HomePrompt signedIn={false} onStart={() => {}} />
      </Landing>
    )
  }
  return <Studio login={user.login} />
}

/** A signed-in user's builder: the site they're on, at whatever stage it is. */
function Studio({ login }: { login: string }) {
  const projectId = useSiteStore((s) => s.projectId)
  const site = useSiteStore((s) => s.site)
  const autoOpen = useSiteStore((s) => s.autoOpen)
  const creation = useCreateSite()
  const thread = useThread(projectId)
  const chat = useSiteChat(projectId)
  const sites = useSites()
  const creating = !!creation.creating

  // A browser with nothing for this account yet (a new device, cleared data): open their newest site.
  useEffect(() => {
    if (!autoOpen || site || creating || !sites.isSuccess) return
    const newest = sites.data[0]
    if (newest) useSiteStore.getState().open(newest)
    else useSiteStore.setState({ autoOpen: false })
  }, [autoOpen, site, creating, sites.isSuccess, sites.data])

  // What a guest asked for on the landing page before signing in: a new site, once they're back.
  const pendingChecked = useRef(false)
  useEffect(() => {
    if (pendingChecked.current) return
    pendingChecked.current = true
    const prompt = takePendingPrompt()
    if (!prompt) return
    const { site, dirty } = useSiteStore.getState()
    // Starting another site drops the open one's unsaved edits: keep that site (its workspace saves them) instead.
    if (site && Object.keys(dirty).length > 0) return
    if (site) useSiteStore.getState().newSite()
    else useSiteStore.setState({ autoOpen: false })
    creation.start(prompt)
  }, [creation])

  if (site?.repoName) return <Workspace login={login} />
  const createRun = thread.data?.run?.mode === 'create'
  if (creating || createRun || chat.messages.length > 0 || (thread.data?.turns.length ?? 0) > 0) {
    return (
      <div className="h-[calc(100svh-3.5rem)]">
        <CreateView creation={creation} />
      </div>
    )
  }
  if (autoOpen && sites.isPending) return <Spinner />
  return (
    <Landing>
      <HomePrompt signedIn onStart={creation.start} busy={creating} />
      <RecentSites creation={creation} />
    </Landing>
  )
}

/** Below the prompt: the user's latest sites, to go back to one. */
function RecentSites({ creation }: { creation: CreateSite }) {
  const { data: sites = [] } = useSites()
  if (sites.length === 0 || creation.creating) return null
  return (
    <div className="mt-8 space-y-2">
      <p className="text-xs text-muted-foreground">Or open one of your sites</p>
      <div className="flex flex-wrap justify-center gap-2">
        {sites.slice(0, 4).map((site) => (
          <button
            key={site.projectId}
            type="button"
            onClick={() => useSiteStore.getState().open(site)}
            className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-3 py-1.5 text-sm shadow-xs backdrop-blur transition-colors hover:bg-accent"
          >
            {site.name}
            <ArrowUpRight className="size-3.5" />
          </button>
        ))}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex h-[calc(100svh-3.5rem)] items-center justify-center">
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}
