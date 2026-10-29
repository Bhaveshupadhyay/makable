import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useModelReadiness } from '@/features/ai-models'
import { useSession } from '@/features/auth'
import { saveEdits, useSiteStore } from '@/features/site'
import { analytics } from '@/shared/lib/analytics'
import { ApiError } from '@/shared/lib/api-client'
import { HomePrompt } from '../components/home-prompt'
import { readNewSiteDraft, saveNewSiteDraft, savePendingPrompt } from '../lib/pending-prompt'

/**
 * `/new`: a new site from a prompt. The open site stays as it is until the prompt is sent (going back returns to it);
 * then its unsaved edits are saved and the builder starts the new site. A guest is asked to sign in first. What's typed
 * is kept as a draft, so it's still there after going to the open site (to sort out a save) and back.
 */
export function NewSitePage() {
  const session = useSession()
  if (session.isPending) {
    return (
      <div className="flex h-[calc(100svh-3.5rem)] items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return <NewSite login={session.data?.login ?? null} />
}

function NewSite({ login }: { login: string | null }) {
  const navigate = useNavigate()
  // The stored site is this user's (another account's, or a guest's, is the builder's to sort out).
  const mine = useSiteStore((s) => login !== null && s.login === login)
  const site = useSiteStore((s) => (mine ? s.site : null))
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [draft] = useState(readNewSiteDraft)
  // Loaded now, so the builder knows at once whether there's a model to build it (or asks for a key in the chat).
  useModelReadiness()

  // Left while the edits were saving (Back): the user is on the site again, so the new site doesn't go.
  const left = useRef(false)
  useEffect(() => {
    left.current = false
    return () => {
      left.current = true
    }
  }, [])

  // The builder takes the prompt from where a guest's waits through sign-in, and starts the site.
  function go(prompt: string) {
    if (mine) useSiteStore.getState().newSite()
    saveNewSiteDraft(null)
    savePendingPrompt(prompt)
    void navigate('/')
  }

  // Its result goes back to the prompt box: false keeps the text there.
  function start(text: string) {
    const prompt = text.trim()
    setProblem(null)
    const { projectId, dirty } = useSiteStore.getState()
    if (!site || Object.keys(dirty).length === 0) return go(prompt)
    // A new site drops the open one's unsaved edits, so they're saved first.
    setSaving(true)
    saveEdits().then(
      () => {
        if (left.current) return
        // Edited again meanwhile (in another tab), or another site opened: what's there now isn't saved, so it stays.
        const now = useSiteStore.getState()
        if (now.projectId !== projectId || Object.keys(now.dirty).length > 0) {
          setSaving(false)
          setProblem(`${site.name} changed while its edits were saving. Send it again to save those too.`)
          return
        }
        go(prompt)
      },
      (e: unknown) => {
        const conflict = e instanceof ApiError && e.code === 'site_conflict'
        const why = conflict ? 'It changed on GitHub since.' : e instanceof ApiError && e.code ? e.message : "Couldn't reach GitHub."
        analytics.track('site_save_problem', { state: conflict ? 'conflict' : 'error', message: why, where: 'new-site' })
        if (left.current) return
        setSaving(false)
        setProblem(`Your edits to ${site.name} aren't saved yet, so the new site waits. ${why}`)
      },
    )
    return false
  }

  return (
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-3xl flex-col items-center px-4 pt-16 pb-24 text-center sm:pt-24">
      <Link to="/" className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {site ? `Back to ${site.name}` : 'Back'}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">What do you want to build?</h1>
      <p className="mt-4 max-w-xl text-base text-pretty text-muted-foreground">
        Describe it in your own words. makable builds it in a new repo on your GitHub.
      </p>
      <div className="mt-10 w-full">
        <HomePrompt signedIn={!!login} onStart={start} busy={saving} initialText={draft} onTextChange={saveNewSiteDraft} />
      </div>
      <div aria-live="polite" className="mt-4 min-h-5 text-sm">
        {saving && site && (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Saving your edits to {site.name} first…
          </span>
        )}
        {problem && !saving && (
          <div className="space-y-1">
            <p className="text-destructive">{problem}</p>
            {site && (
              <Link to="/" className="text-foreground underline underline-offset-2">
                Open {site.name} to sort it out
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
