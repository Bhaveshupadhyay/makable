import type { TemplateId } from '@makable/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useSession } from '@/features/auth'
import { useTemplateCatalog } from '@/features/templates'
import { fetchGithubData } from '../api/github'
import { AI_EDIT, type ChatContext, initialConversation } from '../lib/conversation'
import { useBuilderStore } from '../store'

/** The builder conversation for the current visitor (signed in or guest), plus the side effects it asks for. */
export function useBuilder() {
  const session = useSession()
  const queryClient = useQueryClient()
  const { data: catalog } = useTemplateCatalog()
  const { login, conversation: stored, dispatch, setPortfolio, claim, reset, aiMode: aiModeOn, setAiMode } = useBuilderStore()

  // Who is building: a GitHub login, null for a guest, or undefined while the session loads.
  // A failed session check counts as a guest, so the builder still works without the server.
  const user = session.data ?? null
  const owner = session.isPending ? undefined : (user?.login ?? null)

  // The persisted conversation is either a guest's (claimable by whoever signs in on this
  // browser) or an account's. Another account's is never shown, not even for one frame:
  // until the effect below resets it, show a fresh conversation and ignore actions.
  const ctx = useMemo<ChatContext | null>(
    () => (owner !== undefined && (login === owner || login === null) ? { user, templates: catalog?.templates ?? [] } : null),
    [owner, user, login, catalog],
  )
  const conversation = useMemo(() => (ctx ? stored : initialConversation()), [ctx, stored])

  // "Edit with AI" mode: the preview selects elements and shows the AI box. Signed-in users only,
  // and not persisted. Guests asking for it are sent to the chat's Connect GitHub prompt instead.
  const aiMode = aiModeOn && !!ctx?.user && !!conversation.portfolio

  // Only a confirmed session moves the conversation, so a server error can't wipe an account's work.
  useEffect(() => {
    if (!session.isSuccess || login === owner) return
    if (login === null && owner) claim(owner)
    else reset(owner ?? null)
  }, [session.isSuccess, login, owner, claim, reset])

  // A guest who asked for an AI feature comes back from GitHub signed in: pick the chat back up.
  const awaitingSignIn = conversation.awaitingSignIn
  useEffect(() => {
    if (!awaitingSignIn || !ctx?.user) return
    dispatch({ type: 'signed-in' }, ctx)
    setAiMode(true)
  }, [awaitingSignIn, ctx, dispatch, setAiMode])

  // The conversation asks for a GitHub lookup by entering `github-loading`. This also resumes after a reload.
  const githubLogin = conversation.step === 'github-loading' ? conversation.githubLogin : undefined
  useEffect(() => {
    if (!githubLogin || !ctx) return
    let cancelled = false
    queryClient
      .fetchQuery({ queryKey: ['github', 'data', githubLogin], queryFn: () => fetchGithubData(githubLogin), staleTime: 10 * 60 * 1000 })
      .then(
        (data) => !cancelled && dispatch({ type: 'github-loaded', data }, ctx),
        () => !cancelled && dispatch({ type: 'github-failed', login: githubLogin }, ctx),
      )
    return () => {
      cancelled = true
    }
  }, [githubLogin, ctx, queryClient, dispatch])

  return {
    conversation,
    /**
     * `loading` until the session is known, so a stored conversation doesn't flash in late.
     * `offline` when the session check failed and the stored conversation belongs to an account.
     */
    status: owner === undefined ? 'loading' : session.isError && login !== null ? 'offline' : 'ready',
    retry: () => session.refetch(),
    busy: conversation.step === 'github-loading',
    send: (text: string) => {
      if (!ctx) return
      if (ctx.user && conversation.portfolio && text === AI_EDIT) setAiMode(true)
      dispatch({ type: 'user-text', text }, ctx)
    },
    selectTemplate: (template: TemplateId) => ctx && dispatch({ type: 'select-template', template }, ctx),
    aiMode,
    /** The toolbar button: toggles AI mode, or asks a guest to connect GitHub. */
    toggleAiMode: () => {
      if (!ctx) return
      if (ctx.user) setAiMode(!aiMode)
      else dispatch({ type: 'ai-edit' }, ctx)
    },
    exitAiMode: () => setAiMode(false),
    logAiRequest: (instruction: string, target: string | null) => ctx && dispatch({ type: 'ai-sent', instruction, target }, ctx),
    setPortfolio: (portfolio: Parameters<typeof setPortfolio>[0]) => ctx && setPortfolio(portfolio),
    startOver: () => ctx && reset(owner ?? null),
  }
}

export type Builder = ReturnType<typeof useBuilder>
