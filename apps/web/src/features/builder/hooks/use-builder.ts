import type { TemplateId } from '@makable/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useSession } from '@/features/auth'
import { fetchGithubData } from '../api/github'
import { type ChatContext, initialConversation } from '../lib/conversation'
import { useBuilderStore } from '../store'

/** The builder conversation for the signed-in user, plus the side effects it asks for. */
export function useBuilder() {
  const { data: user } = useSession()
  const queryClient = useQueryClient()
  const { login, conversation: stored, dispatch, setPortfolio, reset } = useBuilderStore()

  // The persisted conversation may belong to a previous account on this browser. Until the
  // reset effect below runs, show a fresh conversation and ignore actions, so it never leaks.
  const ctx = useMemo<ChatContext | null>(
    () => (user && login === user.login ? { login: user.login, name: user.name, avatarUrl: user.avatarUrl } : null),
    [user, login],
  )
  const conversation = useMemo(() => (ctx ? stored : initialConversation()), [ctx, stored])

  // A different account on this browser gets a fresh conversation.
  useEffect(() => {
    if (user && login !== user.login) reset(user.login)
  }, [user, login, reset])

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
    busy: conversation.step === 'github-loading',
    send: (text: string) => ctx && dispatch({ type: 'user-text', text }, ctx),
    selectTemplate: (template: TemplateId) => ctx && dispatch({ type: 'select-template', template }, ctx),
    setPortfolio: (portfolio: Parameters<typeof setPortfolio>[0]) => ctx && setPortfolio(portfolio),
    startOver: () => user && reset(user.login),
  }
}

export type Builder = ReturnType<typeof useBuilder>
