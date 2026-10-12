import { useEffect, useRef } from 'react'
import { ApiError } from '@/shared/lib/api-client'
import { deploySite, getPublishStatus, publishSite } from '../api/publish'
import type { PublishFlow } from '../lib/publish-flow'
import { publishToken } from '../lib/publish-token'
import type { Builder } from './use-builder'
import type { GithubSync } from './use-github-sync'

/** How often to ask how the deploy is going, and how long to wait for it. */
export const POLL_MS = 5_000
export const DEPLOY_TIMEOUT_MS = 10 * 60_000

// Errors the user fixes by answering in the chat (pick an account, another name, overwrite): the pasted token is
// kept for the next try. Anything else drops it.
const KEEP_TOKEN = new Set(['platform_account_required', 'platform_project_taken', 'publish_repo_taken', 'publish_changed_on_github'])

// Runs already started, by id. React can run an effect twice (Strict Mode, remounts), but each run goes out once:
// the backend allows one publish at a time per user, so a second request would be refused.
const started = new Set<string>()

type Deps = { builder: Builder; sync: Pick<GithubSync, 'flush'> }

/**
 * Carries out what the chat's publish flow asks for: a `running` stage saves the session to GitHub (publishing
 * reads it from there), then publishes or re-runs the deploy, and reports back to the chat. A `deploying` stage
 * polls the deploy workflow until it finishes.
 */
export function usePublish(builder: Builder, sync: Pick<GithubSync, 'flush'>) {
  // Runs and polls outlive renders: they always report through the newest builder.
  const deps = useRef<Deps>({ builder, sync })
  useEffect(() => {
    deps.current = { builder, sync }
  })

  const flow = builder.conversation.publish
  const runId = flow?.stage === 'running' ? flow.runId : undefined
  useEffect(() => {
    if (!runId || !flow || started.has(runId)) return
    started.add(runId)
    void execute(flow, () => deps.current)
  }, [runId, flow])

  const deploying = flow?.stage === 'deploying' ? flow : undefined
  const repoName = deploying?.repoName
  const since = deploying?.since
  const projectId = builder.publish.projectId
  useEffect(() => {
    if (!repoName) return
    // How long it's been deploying, on this browser's clock (only for giving up).
    const from = Date.now()
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      if (stopped) return
      if (Date.now() - from > DEPLOY_TIMEOUT_MS) return void deps.current.builder.publish.report({ type: 'deploy-finished', run: null })
      try {
        // The backend only returns a run started since this deploy did (a re-run has the same commit as the last one).
        const { run } = await getPublishStatus(projectId, repoName, since)
        if (!stopped && run?.status === 'completed') return void deps.current.builder.publish.report({ type: 'deploy-finished', run })
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
  }, [projectId, repoName, since])
}

async function execute(flow: PublishFlow, get: () => Deps): Promise<void> {
  const report: Builder['publish']['report'] = (event) => get().builder.publish.report(event)
  const { projectId, published, setPublished } = get().builder.publish
  const token = flow.paste ? publishToken.get() : null
  if (flow.paste && !token) return void report({ type: 'publish-failed', code: 'token_lost', message: '' })
  const credentials = token ? { token, ...(flow.accountId ? { accountId: flow.accountId } : {}) } : undefined
  try {
    if (flow.action === 'deploy') {
      const { actionsUrl, startedAt } = await deploySite(projectId, { repoName: flow.repoName ?? '', credentials })
      publishToken.clear()
      // After a publish whose deploy didn't start, the repo wasn't remembered yet: Publish should update it next time.
      if (flow.target && flow.repoName) {
        const same = published?.target === flow.target && published.repoName === flow.repoName
        setPublished({ target: flow.target, repoName: flow.repoName, siteUrl: same ? published.siteUrl : null })
      }
      return void report({ type: 'deploy-started', actionsUrl, since: startedAt })
    }
    // Publishing reads the site from the user's workspace repo: save it there first.
    const stateSha = await get().sync.flush()
    const result = await publishSite(projectId, {
      target: flow.target ?? 'github-pages',
      stateSha,
      repoName: flow.repoName,
      projectName: flow.projectName,
      credentials,
      confirmOverwrite: flow.confirmOverwrite,
    })
    publishToken.clear()
    setPublished({ target: result.target, repoName: result.repoFullName.split('/')[1], siteUrl: result.siteUrl })
    report({ type: 'publish-done', result })
  } catch (e) {
    const code = e instanceof ApiError ? e.code : undefined
    if (!code || !KEEP_TOKEN.has(code)) publishToken.clear()
    const message = e instanceof ApiError ? e.message : "Couldn't reach the makable server."
    report({ type: 'publish-failed', code, message, details: e instanceof ApiError ? e.details : undefined })
  }
}
