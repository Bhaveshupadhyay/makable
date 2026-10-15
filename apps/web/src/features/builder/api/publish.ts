import { backendFetch } from '@/shared/lib/api-client'

// Publishing through makable-backend, from the site's own repo: it commits the deploy workflow (when it changed) on
// the site's commit and starts the deploy to the platform the user picked. Pushes never deploy: only a publish (or
// "Deploy now") does.

export type PublishTarget = 'github-pages' | 'vercel' | 'cloudflare-pages' | 'netlify'

/** A platform token pasted in the chat. It goes to the backend once and is never kept by the SPA. */
export type PublishCredentials = { token: string; accountId?: string }

export type PublishRequest = {
  target: PublishTarget
  /** The commit the browser's copy of the site is at: it saves the user's edits first. */
  baseCommit: string
  projectName?: string
  credentials?: PublishCredentials
  /** GitHub Pages needs a public repo: the user agreed to make the site's repo public. */
  makePublic?: boolean
}

export type PublishResult = {
  target: PublishTarget
  repoFullName: string
  repoUrl: string
  branch: string
  /** The commit the site is at now (the deploy setup's commit, when this publish made one). */
  commitSha: string
  /** Whether this publish committed anything. Either way it deploys what's on GitHub. */
  changed: boolean
  siteUrl: string | null
  projectName: string | null
  missingSecrets: string[]
  secretsUrl: string
  actionsUrl: string
} & (
  // `started`: deploying, since `deployStartedAt` (UTC, to the second; pass it to `getPublishStatus` to follow this
  // deploy's run). `waiting_for_secrets`: not started; add `missingSecrets` on GitHub first.
  | { deploy: 'started'; deployStartedAt: string }
  | { deploy: 'waiting_for_secrets'; deployStartedAt: null }
)

export type WorkflowRun = { status: string; conclusion: string | null; headSha: string; htmlUrl: string; createdAt: string }
export type PublishStatus = { target: PublishTarget; siteUrl: string | null; run: WorkflowRun | null }

export function publishSite(projectId: string, request: PublishRequest): Promise<PublishResult> {
  return backendFetch<PublishResult>(`/publish/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

/** Runs the deploy workflow again (after the user added the secrets on GitHub, or with a pasted token). */
export function deploySite(
  projectId: string,
  request: { credentials?: PublishCredentials },
): Promise<{ repoUrl: string; actionsUrl: string; startedAt: string }> {
  return backendFetch(`/publish/${projectId}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

/** The deploy workflow's latest run; with `since` (a deploy's start time), only a run started then or later. */
export function getPublishStatus(projectId: string, since?: string): Promise<PublishStatus> {
  const query = since ? `?${new URLSearchParams({ since })}` : ''
  return backendFetch<PublishStatus>(`/publish/${projectId}/status${query}`)
}
