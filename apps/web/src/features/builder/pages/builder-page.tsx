import { ArrowUpRight, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useThread } from '@/features/ai-edit'
import { useModelReadiness } from '@/features/ai-models'
import { useSession } from '@/features/auth'
import { Landing } from '@/features/marketing'
import { useSiteStore } from '@/features/site'
import { analytics } from '@/shared/lib/analytics'
import { Button } from '@/shared/ui/button'
import { CreateView } from '../components/create-view'
import { HomePrompt } from '../components/home-prompt'
import { GuestChat, ModelNeededChat } from '../components/waiting-chat'
import { useSites } from '../hooks/use-sites'
import { Workspace } from '../components/workspace'
import { type CreateSite, useCreateSite } from '../hooks/use-create-site'
import { usePendingPrompt } from '../hooks/use-pending-prompt'
import { savePendingPrompt } from '../lib/pending-prompt'
import { useSiteChat } from '../store'

/**
 * The home page. Guests get the landing page, and the chat asks them to sign in once they send a prompt. Signed in: the
 * landing page until a site is started (the chat asks for an API key first if there's no AI model to build it), then
 * the chat while it's built, then the chat beside the live preview.
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
  // this browser starts fresh; what a guest had (nothing but a project id) is theirs once they sign in. Signing out
  // (or a session that ran out) keeps the site and its unsaved edits for when the same account comes back.
  useEffect(() => {
    if (!session.isSuccess || !owner || login === owner) return
    if (login === null) claim(owner)
    else reset(owner)
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

  if (!user) return <Guest />
  return <Studio login={user.login} />
}

/**
 * A guest's home: the landing page, then the chat once they send a prompt, which asks them to sign in with GitHub
 * (each site is a repo there). The prompt is kept across the redirect, so it's built once they're back, and a reload
 * or a failed sign-in brings the chat back.
 */
function Guest() {
  const prompt = usePendingPrompt()
  // Back from the chat: what they asked for goes back in the box.
  const [draft, setDraft] = useState<string>()

  function start(text: string) {
    savePendingPrompt(text.trim())
    analytics.track('github_sign_in_prompted', { reason: 'home' })
  }

  function back() {
    setDraft(prompt ?? undefined)
    savePendingPrompt(null)
  }

  if (prompt) return <GuestChat prompt={prompt} onBack={back} />
  return (
    <Landing>
      <HomePrompt onStart={start} initialText={draft} />
    </Landing>
  )
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
  const model = useModelReadiness()
  const creating = !!creation.creating
  // A prompt waiting to be built: a guest's from before they signed in, or one sent with no AI model to build it.
  // It's in sessionStorage, so it outlives the sign-in redirect, a trip to Settings for an API key and a reload.
  const waiting = usePendingPrompt()
  // Back from the chat: what they asked for goes back in the box.
  const [draft, setDraft] = useState<string>()

  // A browser with nothing for this account yet (a new device, cleared data): open their newest site.
  useEffect(() => {
    if (!autoOpen || site || creating || waiting || !sites.isSuccess) return
    const newest = sites.data[0]
    if (newest) useSiteStore.getState().open(newest)
    else useSiteStore.setState({ autoOpen: false })
  }, [autoOpen, site, creating, waiting, sites.isSuccess, sites.data])

  // The waiting prompt becomes a new site once there's a model (its request carries the user's pick).
  useEffect(() => {
    if (!waiting || model !== 'ready') return
    savePendingPrompt(null)
    const { site, dirty } = useSiteStore.getState()
    // Starting another site drops the open one's unsaved edits: keep that site (its workspace saves them) instead.
    if (site && Object.keys(dirty).length > 0) return
    if (site) useSiteStore.getState().newSite()
    else useSiteStore.setState({ autoOpen: false })
    creation.start(waiting)
  }, [waiting, model, creation])

  function back() {
    setDraft(waiting ?? undefined)
    savePendingPrompt(null)
    useSiteStore.setState({ autoOpen: false })
  }

  if (waiting) {
    // `ready`: it starts right after this render.
    if (model === 'checking' || model === 'ready') return <Spinner />
    return <ModelNeededChat prompt={waiting} status={model} onBack={back} />
  }
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
      <HomePrompt onStart={(prompt) => savePendingPrompt(prompt.trim())} busy={creating} initialText={draft} />
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
