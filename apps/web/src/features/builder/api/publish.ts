import { backendFetch } from '@/shared/lib/api-client'

// Publishing through makable-backend: it builds the site from the session saved in the user's private
// `makable-workspace` repo, commits it with a deploy workflow to a site repo on their GitHub, and the push
// deploys it to the platform they picked.

export type PublishTarget = 'github-pages' | 'vercel' | 'cloudflare-pages' | 'netlify'

/** A platform token pasted in the chat. It goes to the backend once and is never kept by the SPA. */
export type PublishCredentials = { token: string; accountId?: string }

export type PublishRequest = {
  target: PublishTarget
  /** The SHA of the saved state to publish (what the last save returned). */
  stateSha: string
  repoName?: string
  projectName?: string
  credentials?: PublishCredentials
  /** The head commit the user agreed to overwrite after `publish_changed_on_github`. */
  confirmOverwrite?: string
}

export type PublishResult = {
  target: PublishTarget
  repoFullName: string
  repoUrl: string
  branch: string
  commitSha: string
  /** `started`: deploying. `waiting_for_secrets`: add `missingSecrets` on GitHub first. `unchanged`: nothing to do. */
  deploy: 'started' | 'waiting_for_secrets' | 'unchanged'
  siteUrl: string | null
  projectName: string | null
  missingSecrets: string[]
  secretsUrl: string
  actionsUrl: string
}

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
export function deploySite(projectId: string, request: { repoName: string; credentials?: PublishCredentials }): Promise<{ repoUrl: string; actionsUrl: string }> {
  return backendFetch(`/publish/${projectId}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

export function getPublishStatus(projectId: string, repoName: string): Promise<PublishStatus> {
  return backendFetch<PublishStatus>(`/publish/${projectId}/status?repoName=${encodeURIComponent(repoName)}`)
}
