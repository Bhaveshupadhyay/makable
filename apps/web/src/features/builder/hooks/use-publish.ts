import { useEffect, useRef } from 'react'
import { needsGithubReconnect, reconnectGithub } from '@/features/auth'
import { type SiteSync, useSiteStore } from '@/features/site'
import { analytics } from '@/shared/lib/analytics'
import { ApiError } from '@/shared/lib/api-client'
import { deploySite, getPublishStatus, publishSite } from '../api/publish'
import type { PublishContext, PublishEvent, PublishFlow } from '../lib/publish-flow'
import { reducePublish } from '../lib/publish-flow'
import { publishToken } from '../lib/publish-token'
import { useBuilderStore, useSiteChat } from '../store'

/** How often to ask how the deploy is going, and how long to wait for it. */
export const POLL_MS = 5_000
export const DEPLOY_TIMEOUT_MS = 10 * 60_000

// Errors the user fixes by answering in the chat (pick an account, another name, make the repo public): the pasted
// token is kept for the next try. Anything else drops it.
const KEEP_TOKEN = new Set(['platform_account_required', 'platform_project_taken', 'publish_pages_private'])

// Runs already started, by id. React can run an effect twice (Strict Mode, remounts), but each run goes out once:
// the backend allows one publish at a time per user, so a second request would be refused.
const started = new Set<string>()

type Deps = { projectId: string; ctx: PublishContext; sync: Pick<SiteSync, 'status' | 'flush' | 'reload'> }

/**
 * Publishing in the chat: `dispatch` moves the publish flow, and this carries out what a `running` stage asks for
 * (the user's edits are saved first, then the site is published from its repo, or the deploy is run again), then
 * follows a `deploying` stage until the deploy finishes.
 */
export function usePublish(projectId: string, ctx: PublishContext, sync: Pick<SiteSync, 'status' | 'flush' | 'reload'>) {
  const chat = useSiteChat(projectId)
  const deps = useRef<Deps>({ projectId, ctx, sync })
  useEffect(() => {
    deps.current = { projectId, ctx, sync }
  })

  const dispatch = (event: PublishEvent) => {
    const { projectId: id, ctx: c } = deps.current
    useBuilderStore.getState().update(id, (state) => reducePublish(state, event, c))
  }

  const flow = chat.publish
  const runId = flow?.stage === 'running' ? flow.runId : undefined
  // A run still `running` when the page opens (back from signing in to GitHub again, or a reload) waits for the site's
  // files: saving the edits first needs them.
  const loading = sync.status.state === 'loading' || sync.status.state === 'reconnecting'
  useEffect(() => {
    if (!runId || !flow || loading || started.has(runId)) return
    started.add(runId)
    void execute(flow, () => deps.current)
  }, [runId, flow, loading])

  const deploying = flow?.stage === 'deploying' ? flow : undefined
  const since = deploying?.since
  const target = deploying?.target ?? null
  useEffect(() => {
    if (!since) return
    // How long it's been deploying, on this browser's clock (only for giving up).
    const from = Date.now()
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const finish = (event: Extract<PublishEvent, { type: 'deploy-finished' }>) => {
      analytics.track('deploy_finished', { target, conclusion: event.run?.conclusion ?? null, timed_out: !event.run })
      const { projectId: id, ctx: c } = deps.current
      useBuilderStore.getState().update(id, (state) => reducePublish(state, event, c))
    }
    const tick = async () => {
      if (stopped) return
      if (Date.now() - from > DEPLOY_TIMEOUT_MS) return finish({ type: 'deploy-finished', run: null })
      try {
        // The backend only returns a run started since this deploy did (a re-run has the same commit as the last one).
        const { run } = await getPublishStatus(deps.current.projectId, since)
        if (!stopped && run?.status === 'completed') return finish({ type: 'deploy-finished', run })
      } catch {
        // A failed check isn't a failed deploy: ask again next time.
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS)
    }
    timer = setTimeout(tick, POLL_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [since, target])

  return {
    flow,
    dispatch,
    /** The Publish button. */
    start: () => {
      analytics.track('publish_started', { republish: !!deps.current.ctx.published, target: deps.current.ctx.published?.target ?? null })
      dispatch({ type: 'publish' })
    },
    /** A token from the token box: kept in memory for the run, only its last 4 characters go in the chat. */
    enterToken: (token: string) => {
      if (!token.trim()) return
      publishToken.set(token.trim())
      analytics.track('publish_token_entered', { target: flow?.target ?? null })
      dispatch({ type: 'publish-token', last4: token.trim().slice(-4) })
    },
  }
}

async function execute(flow: PublishFlow, get: () => Deps): Promise<void> {
  const { projectId } = get()
  const report = (event: PublishEvent) => {
    const { ctx } = get()
    useBuilderStore.getState().update(projectId, (state) => reducePublish(state, event, ctx))
  }
  const token = flow.paste ? publishToken.get() : null
  if (flow.paste && !token) return report({ type: 'publish-failed', code: 'token_lost', message: '' })
  const credentials = token ? { token, ...(flow.accountId ? { accountId: flow.accountId } : {}) } : undefined
  try {
    if (flow.action === 'deploy') {
      const { actionsUrl, startedAt } = await deploySite(projectId, { credentials })
      publishToken.clear()
      analytics.track('deploy_started', { target: flow.target ?? null })
      return report({ type: 'deploy-started', actionsUrl, since: startedAt })
    }
    // Publishing reads the site from its repo: save the user's edits there first.
    const baseCommit = await get().sync.flush()
    const result = await publishSite(projectId, {
      target: flow.target ?? 'github-pages',
      baseCommit,
      ...(flow.projectName ? { projectName: flow.projectName } : {}),
      ...(credentials ? { credentials } : {}),
      ...(flow.makePublic ? { makePublic: true } : {}),
    })
    publishToken.clear()
    // The deploy setup may be a new commit: build on it. Its files are makable's own, read again from GitHub.
    const site = useSiteStore.getState()
    if (site.projectId === projectId && result.commitSha !== site.commitSha) {
      site.committed(result.commitSha, {})
      if (Object.keys(useSiteStore.getState().dirty).length === 0) get().sync.reload()
    }
    useBuilderStore.getState().setPublished(projectId, { target: result.target, siteUrl: result.siteUrl })
    analytics.track('publish_succeeded', {
      target: result.target,
      repo: result.repoFullName,
      site_url: result.siteUrl,
      changed: result.changed,
      missing_secrets: result.missingSecrets,
    })
    report({ type: 'publish-done', result })
  } catch (e) {
    const code = e instanceof ApiError ? e.code : undefined
    if (!code || !KEEP_TOKEN.has(code)) publishToken.clear()
    const message = e instanceof ApiError ? e.message : "Couldn't reach the makable server."
    analytics.track('publish_failed', { code: code ?? null, message })
    // makable's GitHub token stopped working: the browser signs in again, and the run, still `running` in the stored
    // chat, goes again once it's back (this page's `started` goes with it).
    if (needsGithubReconnect(e) && reconnectGithub('publish')) return report({ type: 'publish-reconnecting' })
    report({ type: 'publish-failed', code, message, details: e instanceof ApiError ? e.details : undefined })
  }
}
