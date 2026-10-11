import type { SessionSnapshot, TemplateId } from '@makable/shared'
import type { AiHistoryTurn } from '@/features/ai-edit'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { MOCK_AUTH, useSession } from '@/features/auth'
import { useTemplateCatalog } from '@/features/templates'
import type { SiteDraft } from '@/features/visual-edit'
import { fetchGithubData } from '../api/github'
import { type ChatContext, initialConversation, isAiRequest } from '../lib/conversation'
import { type SessionState, sessionFileName, toSnapshot } from '../lib/session-file'
import { type Synced, useBuilderStore } from '../store'

const NO_FILE_EDITS: Record<string, string> = {}
const NO_AI_HISTORY: AiHistoryTurn[] = []

/** The builder conversation for the current visitor (signed in or guest), plus the side effects it asks for. */
export function useBuilder() {
  const session = useSession()
  const queryClient = useQueryClient()
  const { data: catalog } = useTemplateCatalog()
  const {
    login,
    projectId,
    conversation: stored,
    fileEdits: storedFileEdits,
    aiHistory: storedAiHistory,
    recordAiTurn,
    amendAiTurn,
    dispatch,
    setDraft,
    importSession,
    syncEnabled,
    setSyncEnabled,
    synced,
    syncNoticeShown,
    markSyncNoticeShown,
    claim,
    reset,
    aiMode: aiModeOn,
    setAiMode,
  } = useBuilderStore()

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
  // AI-edited files for the current template. A stable object, so the visual editor's history
  // can tell its own changes apart (see useVisualEdit).
  const template = conversation.portfolio?.template
  const fileEdits = (ctx && template && storedFileEdits[template]) || NO_FILE_EDITS
  const aiHistory = (ctx && template && storedAiHistory[template]) || NO_AI_HISTORY

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
    fileEdits,
    /**
     * `loading` until the session is known, so a stored conversation doesn't flash in late.
     * `offline` when the session check failed and the stored conversation belongs to an account.
     */
    status: owner === undefined ? 'loading' : session.isError && login !== null ? 'offline' : 'ready',
    retry: () => session.refetch(),
    busy: conversation.step === 'github-loading',
    send: (text: string) => {
      if (!ctx) return
      if (ctx.user && isAiRequest(conversation, text)) setAiMode(true)
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
    logAiRequest: (instruction: string, target: string | null, result: string) =>
      ctx && dispatch({ type: 'ai-sent', instruction, target, result }, ctx),
    /** Finished AI requests for the current template, oldest first. */
    aiHistory,
    // Bound to the template of this render: the AI edit hook keeps the ones from when a request was sent.
    recordAiTurn: (turn: AiHistoryTurn) => ctx && template && recordAiTurn(template, turn),
    amendAiTurn: (id: string, reply: string) => ctx && template && amendAiTurn(template, id, reply),
    setDraft: (draft: SiteDraft) => ctx && setDraft(draft),
    /** The session as a file to download, or null while another account's session is hidden. */
    exportSession: (): { fileName: string; snapshot: SessionSnapshot } | null => {
      if (!ctx) return null
      const now = new Date()
      const who = owner ?? null
      return {
        fileName: sessionFileName(who, now),
        snapshot: toSnapshot({ projectId, conversation: stored, fileEdits: storedFileEdits, aiHistory: storedAiHistory }, who, now),
      }
    },
    /** Replaces the session with an imported one. It belongs to whoever imports it. */
    importSession: (session: SessionState, snapshot: Pick<SessionSnapshot, 'exportedAt' | 'login'>) => {
      if (!ctx) return
      importSession(session, owner ?? null)
      dispatch({ type: 'session-imported', source: 'file', exportedAt: snapshot.exportedAt, login: snapshot.login }, ctx)
    },
    /** GitHub saving: on for signed-in users whose session is shown (never another account's). */
    sync: {
      // Mock auth has no backend session to save with.
      account: MOCK_AUTH ? null : (ctx?.user?.login ?? null),
      enabled: syncEnabled,
      setEnabled: setSyncEnabled,
      synced,
      /** Replaces the session with one restored from GitHub, already saved there. */
      restore: (session: SessionState, snapshot: Pick<SessionSnapshot, 'exportedAt' | 'login'>, saved: Synced) => {
        if (!ctx) return
        importSession(session, owner ?? null, saved)
        dispatch({ type: 'session-imported', source: 'github', exportedAt: snapshot.exportedAt, login: snapshot.login }, ctx)
      },
      /** Shows the one-time "saved to GitHub" note in the chat. */
      announce: () => {
        if (!ctx || syncNoticeShown) return
        markSyncNoticeShown()
        dispatch({ type: 'sync-started' }, ctx)
      },
    },
    startOver: () => ctx && reset(owner ?? null),
  }
}

export type Builder = ReturnType<typeof useBuilder>
