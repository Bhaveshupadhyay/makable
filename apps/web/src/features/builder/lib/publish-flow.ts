import type { PublishResult, PublishTarget, WorkflowRun } from '../api/publish'
import type { ChatMessage, Conversation } from './conversation'

// Publishing, as part of the chat: pick a platform, then either paste its token (it's sent to the backend
// once, never kept in the chat) or add it on GitHub yourself. A pure reducer like the rest of the
// conversation; `usePublish` runs what a `running` stage asks for and reports back with events.

export type Published = { target: PublishTarget; repoName: string; siteUrl: string | null }

export type PublishStage =
  | 'target'
  | 'token-mode'
  | 'token'
  | 'confirm'
  | 'running'
  | 'deploying'
  | 'secrets'
  | 'overwrite'
  | 'repo-name'
  | 'project-name'
  | 'account'
  | 'reconnect'
  | 'failed'

export type PublishFlow = {
  stage: PublishStage
  target?: PublishTarget
  /** What a run does: commit the site and deploy it, or only run the deploy workflow again. */
  action?: 'publish' | 'deploy'
  /** The user pastes a token in the chat. usePublish keeps it in memory; it never enters the conversation. */
  paste?: boolean
  repoName?: string
  projectName?: string
  accountId?: string
  confirmOverwrite?: string
  accounts?: { id: string; name: string }[]
  /** A new id for every run, so each one runs once. */
  runId?: string
  /** While deploying: the commit being deployed (when known), when it started, and where to watch it. */
  commitSha?: string
  since?: string
  actionsUrl?: string
  siteUrl?: string | null
}

export type PublishEvent =
  /** The Publish button, or "publish" in the chat. */
  | { type: 'publish' }
  /** A token was entered (only its last 4 characters are shown). */
  | { type: 'publish-token'; last4: string }
  | { type: 'publish-done'; result: PublishResult }
  | { type: 'deploy-started'; actionsUrl: string; since: string }
  | { type: 'publish-failed'; code: string | undefined; message: string; details?: unknown }
  /** The deploy workflow finished, or null when it took too long to wait for. */
  | { type: 'deploy-finished'; run: WorkflowRun | null }

/** What the publish flow needs from outside: who's signed in, the site's last publish, and the open step's replies. */
export type PublishContext = { login: string | null; published: Published | null; resume: string[] | undefined }

export const PUBLISH = 'Publish'
export const CANCEL = 'Cancel'
const PASTE = 'Paste it here'
const ON_GITHUB = "I'll add it on GitHub"
const DEPLOY_NOW = 'Deploy now'
const PASTE_INSTEAD = 'Paste a token instead'
const OVERWRITE = 'Overwrite'
const TRY_AGAIN = 'Try again'
const OTHER_PLATFORM = 'Pick another platform'
export const PUBLISH_ELSEWHERE = 'Publish somewhere else'

export const TARGETS: Record<PublishTarget, { name: string; secrets: string[]; tokenUrl: string | null; permission?: string }> = {
  'github-pages': { name: 'GitHub Pages', secrets: [], tokenUrl: null },
  vercel: { name: 'Vercel', secrets: ['VERCEL_TOKEN'], tokenUrl: 'https://vercel.com/account/tokens' },
  'cloudflare-pages': {
    name: 'Cloudflare Pages',
    secrets: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
    tokenUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    permission: 'Cloudflare Pages: Edit',
  },
  netlify: { name: 'Netlify', secrets: ['NETLIFY_AUTH_TOKEN'], tokenUrl: 'https://app.netlify.com/user/applications#personal-access-tokens' },
}
const TARGET_IDS = Object.keys(TARGETS) as PublishTarget[]

/** "publish", "deploy it", "put it online"... in the chat. */
export const PUBLISH_REQUEST = /^(publish|deploy|go live|put (it|my site) (online|live))\b/i
/** Asking for another platform than the last publish's. */
const ELSEWHERE = /somewhere else|elsewhere|another (platform|host)|different (platform|host)/i
const REPO_NAME = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/
const PROJECT_NAME = /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/

const id = () => crypto.randomUUID()
const user = (text: string): ChatMessage => ({ id: id(), role: 'user', text })
const assistant = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: id(), role: 'assistant', text, ...extra })

function say(state: Conversation, publish: PublishFlow | undefined, text: string, replies?: string[], extra: Partial<ChatMessage> = {}): Conversation {
  return { ...state, publish, messages: [...state.messages, assistant(text, { ...(replies?.length ? { replies } : {}), ...extra })] }
}

/** Starts a run of what `flow` describes. */
function run(state: Conversation, flow: PublishFlow, text: string): Conversation {
  return say(state, { ...flow, stage: 'running', action: flow.action ?? 'publish', runId: id() }, text)
}

/** Whether the publish flow is waiting for the user's answer in the chat. */
export function awaitingPublishAnswer(flow: PublishFlow | undefined): boolean {
  return !!flow && flow.stage !== 'running' && flow.stage !== 'deploying'
}

/**
 * Whether chat text answers the publish flow. Its questions take any text, but after a failure (or a request to
 * reconnect) only its own replies and publish requests do: anything else is ordinary chat, e.g. an AI request.
 */
export function isPublishAnswer(flow: PublishFlow | undefined, text: string): boolean {
  if (!awaitingPublishAnswer(flow)) return false
  if (flow?.stage !== 'failed' && flow?.stage !== 'reconnect') return true
  const t = text.trim().toLowerCase()
  return [TRY_AGAIN, CANCEL, OTHER_PLATFORM, PUBLISH_ELSEWHERE].some((r) => r.toLowerCase() === t) || PUBLISH_REQUEST.test(text.trim())
}

/** The conversation without a failed publish that other chat moved on from. */
export function dropStalePublish(state: Conversation): Conversation {
  return state.publish?.stage === 'failed' || state.publish?.stage === 'reconnect' ? { ...state, publish: undefined } : state
}

/** Whether chat text should go to the token box instead of the chat (so a token never enters the conversation). */
export function awaitingToken(flow: PublishFlow | undefined): boolean {
  return flow?.stage === 'token'
}

/** The Publish button or a publish request in the chat. */
export function startPublish(state: Conversation, ctx: PublishContext, said = PUBLISH): Conversation {
  const s = { ...state, messages: [...state.messages, user(said)] }
  if (state.publish?.stage === 'running' || state.publish?.stage === 'deploying') {
    return say(s, state.publish, "I'm already publishing your site. I'll tell you when it's done.")
  }
  if (!ctx.login) {
    // Repeated clicks don't stack sign-in prompts.
    if (state.awaitingSignIn && state.signInFor === 'publish') return state
    return say(
      { ...s, awaitingSignIn: true, signInFor: 'publish' },
      undefined,
      'Publishing puts your site in a repo on your GitHub account, so connect it first. Everything you built so far stays here.',
      ctx.resume,
      { widget: 'connect-github' },
    )
  }
  if (ctx.published && !ELSEWHERE.test(said)) {
    const { target, repoName } = ctx.published
    return run(s, { stage: 'running', target, repoName }, `Publishing your changes to ${TARGETS[target].name}…`)
  }
  return askTarget(s)
}

/** After connecting GitHub to publish: carry on with the platform question. */
export function publishAfterSignIn(state: Conversation, ctx: PublishContext): Conversation {
  const connected = { ...state, awaitingSignIn: false, signInFor: undefined }
  if (ctx.published) {
    const { target, repoName } = ctx.published
    return run(connected, { stage: 'running', target, repoName }, `Connected as @${ctx.login}. Publishing your changes to ${TARGETS[target].name}…`)
  }
  return askTarget(connected, `Connected as @${ctx.login}. `)
}

function askTarget(state: Conversation, lead = ''): Conversation {
  return say(state, { stage: 'target' }, `${lead}Where should I publish your site?`, [...TARGET_IDS.map((t) => TARGETS[t].name), CANCEL])
}

function chooseTarget(state: Conversation, target: PublishTarget, ctx: PublishContext): Conversation {
  const { name, secrets, tokenUrl, permission } = TARGETS[target]
  if (target === 'github-pages') {
    const login = (ctx.login ?? '').toLowerCase()
    return say(
      state,
      { stage: 'confirm', target },
      `I'll publish your site to https://${login}.github.io/ from a public repo, ${login}.github.io, on your GitHub. ` +
        "GitHub Pages needs a public repo, so your site's code will be public too.",
      [PUBLISH, CANCEL],
    )
  }
  const needs = permission ? ` with the ${permission} permission` : ''
  return say(
    state,
    { stage: 'token-mode', target },
    `${name} deploys need a ${name} token${needs} (make one at ${tokenUrl}). ` +
      `Paste it here and I'll check it, set up the ${name} project and save it to your site repo's GitHub Actions secrets; makable never stores it. ` +
      `Or add it on GitHub yourself as a repository secret named ${list(secrets)}.`,
    [PASTE, ON_GITHUB, CANCEL],
  )
}

function askToken(state: Conversation, flow: PublishFlow, lead = ''): Conversation {
  const { name, tokenUrl } = TARGETS[flow.target ?? 'vercel']
  return say(
    state,
    { ...flow, stage: 'token', paste: true },
    `${lead}Paste your ${name} token in the box below (make one at ${tokenUrl}). It goes straight to your repo's secrets and isn't shown in this chat.`,
    [CANCEL],
  )
}

/** Chat text while the publish flow waits for an answer. Null when the text isn't for it. */
export function publishText(state: Conversation, text: string, ctx: PublishContext): Conversation | null {
  const flow = state.publish
  if (!flow || !isPublishAnswer(flow, text)) return null
  const is = (reply: string) => text.toLowerCase() === reply.toLowerCase()
  const s = { ...state, messages: [...state.messages, user(text)] }
  if (is(CANCEL)) return say(s, undefined, "OK, I won't publish for now.", ctx.resume)
  if (is(OTHER_PLATFORM) || is(PUBLISH_ELSEWHERE)) return askTarget(s)
  const again = (lead: string) => say(s, flow, lead, s.messages.at(-2)?.replies)

  switch (flow.stage) {
    case 'target': {
      const target = TARGET_IDS.find((t) => text.toLowerCase().includes(TARGETS[t].name.toLowerCase()) || text.toLowerCase() === t)
      return target ? chooseTarget(s, target, ctx) : again('Pick one of the platforms below.')
    }
    case 'token-mode':
      if (is(PASTE)) return askToken(s, { ...flow, action: 'publish' })
      if (is(ON_GITHUB)) return run(s, { ...flow, paste: false, action: 'publish' }, 'Setting up your site repo…')
      return again(`Paste the token here, or add it on GitHub yourself.`)
    case 'confirm':
      return is(PUBLISH) ? run(s, { ...flow, action: 'publish' }, 'Publishing your site…') : again('Publish, or cancel?')
    case 'overwrite':
      return is(OVERWRITE) ? run(s, flow, 'Publishing over the changes on GitHub…') : again('Overwrite them, or cancel?')
    case 'secrets':
      if (is(DEPLOY_NOW)) return run(s, { ...flow, action: 'deploy', paste: false }, 'Starting the deploy…')
      if (is(PASTE_INSTEAD)) return askToken(s, { ...flow, action: 'deploy' })
      return again('Tell me to deploy once the secrets are added.')
    case 'repo-name':
      return REPO_NAME.test(text)
        ? run(s, { ...flow, repoName: text, confirmOverwrite: undefined }, `Publishing to a repo named ${text}…`)
        : again('A repo name can only have letters, numbers, dots, dashes and underscores. Try another.')
    case 'project-name': {
      const name = text.toLowerCase()
      return PROJECT_NAME.test(name)
        ? run(s, { ...flow, projectName: name }, `Publishing as ${name}…`)
        : again('Use lowercase letters, numbers and dashes (up to 58). Try another.')
    }
    case 'account': {
      const account = flow.accounts?.find((a) => is(a.name) || is(a.id))
      return account ? run(s, { ...flow, accountId: account.id }, `Publishing to ${account.name}…`) : again('Pick one of the accounts below.')
    }
    case 'reconnect':
    case 'failed':
      return is(TRY_AGAIN) || PUBLISH_REQUEST.test(text) ? run(s, flow, 'Trying again…') : null
    case 'token':
    case 'running':
    case 'deploying':
      return null
  }
}

/** A token was entered in the token box. */
export function tokenEntered(state: Conversation, last4: string): Conversation {
  const flow = state.publish
  if (flow?.stage !== 'token') return state
  const s = { ...state, messages: [...state.messages, user(`Token ending in ${last4}`)] }
  return run(s, { ...flow, paste: true }, flow.action === 'deploy' ? 'Saving the token and starting the deploy…' : 'Checking the token and publishing…')
}

/** What a run brought back. */
export function publishOutcome(state: Conversation, event: Exclude<PublishEvent, { type: 'publish' | 'publish-token' }>, ctx: PublishContext): Conversation {
  const flow = state.publish
  if (!flow) return state
  switch (event.type) {
    case 'publish-done':
      return published(state, event.result, ctx)
    case 'deploy-started':
      return say(
        state,
        { ...flow, stage: 'deploying', commitSha: undefined, since: event.since, actionsUrl: event.actionsUrl },
        `Deploying now. I'll tell you when it's live. Follow it here: ${event.actionsUrl}`,
      )
    case 'deploy-finished': {
      if (flow.stage !== 'deploying') return state
      const latest = event.run
      if (!latest) return say(state, undefined, `It's taking longer than usual. Follow the deploy here: ${flow.actionsUrl}`, ctx.resume)
      if (latest.conclusion === 'success') {
        const where = flow.siteUrl ? ` at ${flow.siteUrl}` : ''
        return say(state, undefined, `Your site is live${where}. Publish again anytime to update it.`, [...(ctx.resume ?? []), PUBLISH_ELSEWHERE])
      }
      // The code is on GitHub already: trying again only runs the deploy again.
      return say(
        state,
        { ...flow, stage: 'failed', action: 'deploy', paste: false },
        `The deploy didn't finish (${latest.conclusion ?? latest.status}). The log says why: ${latest.htmlUrl}`,
        [TRY_AGAIN, CANCEL],
      )
    }
    case 'publish-failed':
      return failed(state, flow, event, ctx)
  }
}

function published(state: Conversation, result: PublishResult, ctx: PublishContext): Conversation {
  const { name, tokenUrl } = TARGETS[result.target]
  const repoName = result.repoFullName.split('/')[1]
  switch (result.deploy) {
    case 'unchanged':
      return say(state, undefined, `Nothing changed since your last publish. Your site is at ${result.siteUrl ?? result.repoUrl}`, ctx.resume)
    case 'waiting_for_secrets':
      return say(
        state,
        { stage: 'secrets', target: result.target, repoName },
        `Your site's code is in ${result.repoUrl}. To deploy it to ${name}, add ${result.missingSecrets.length > 1 ? 'these repository secrets' : 'this repository secret'} ` +
          `on GitHub: ${list(result.missingSecrets)}. Add ${result.missingSecrets.length > 1 ? 'them' : 'it'} here: ${result.secretsUrl}` +
          `${tokenUrl ? ` (make a token at ${tokenUrl})` : ''}. Then tell me to deploy.`,
        [DEPLOY_NOW, PASTE_INSTEAD, CANCEL],
      )
    case 'started': {
      const firstPages = result.target === 'github-pages' && !ctx.published ? ' The first GitHub Pages deploy can take a few extra minutes.' : ''
      return say(
        state,
        {
          stage: 'deploying',
          target: result.target,
          repoName,
          commitSha: result.commitSha,
          since: new Date().toISOString(),
          actionsUrl: result.actionsUrl,
          siteUrl: result.siteUrl,
        },
        `Published to ${name}! It's deploying now, which usually takes a minute or two. I'll tell you when it's live.${firstPages}\n` +
          `Site: ${result.siteUrl}\nCode: ${result.repoUrl}\nDeploy log: ${result.actionsUrl}`,
      )
    }
  }
}

function failed(state: Conversation, flow: PublishFlow, { code, message, details }: { code: string | undefined; message: string; details?: unknown }, ctx: PublishContext): Conversation {
  const target = flow.target ? TARGETS[flow.target].name : 'the platform'
  const d = (details ?? {}) as { headSha?: string; paths?: string[]; accounts?: { id: string; name: string }[]; missing?: string[]; secretsUrl?: string }
  switch (code) {
    case 'workspace_conflict':
      return say(state, undefined, 'This chat was also changed on another device. Choose which version to keep from the cloud button at the top, then publish again.', ctx.resume)
    case 'publish_changed_on_github':
      return say(
        state,
        { ...flow, stage: 'overwrite', confirmOverwrite: d.headSha },
        `Some of your site's files were changed on GitHub since you last published${d.paths?.length ? ` (${d.paths.join(', ')})` : ''}. Publishing will overwrite those changes.`,
        [OVERWRITE, CANCEL],
      )
    case 'publish_repo_taken':
      return say(state, { ...flow, stage: 'repo-name' }, `${message} What should I call the repo?`, [CANCEL])
    case 'platform_project_taken':
      return say(state, { ...flow, stage: 'project-name' }, `That project name is taken on ${target}. What should I call the project?`, [CANCEL])
    case 'platform_token_invalid':
      return askToken(state, flow, `${message} `)
    case 'platform_account_required':
      return say(state, { ...flow, stage: 'account', accounts: d.accounts }, `${message}`, [...(d.accounts ?? []).map((a) => a.name).slice(0, 10), CANCEL])
    case 'publish_secrets_missing':
      return say(
        state,
        { ...flow, stage: 'secrets' },
        `The repo doesn't have ${list(d.missing ?? [])} yet. Add ${(d.missing?.length ?? 0) > 1 ? 'them' : 'it'} here: ${d.secretsUrl}. Then tell me to deploy.`,
        [DEPLOY_NOW, PASTE_INSTEAD, CANCEL],
      )
    case 'token_lost':
      return askToken(state, flow, "I don't keep tokens after the page reloads. ")
    case 'github_missing_scope':
    case 'github_reconnect':
    case 'unauthorized':
      return say(state, { ...flow, stage: 'reconnect' }, `${code === 'unauthorized' ? 'Your GitHub session expired.' : message} Connect GitHub again, then try again.`, [TRY_AGAIN, CANCEL])
    case 'publish_pages_private':
    case 'publish_repo_archived':
    case 'github_pages_unavailable':
      return say(state, { ...flow, stage: 'failed' }, message, [OTHER_PLATFORM, CANCEL])
    default:
      return say(state, { ...flow, stage: 'failed' }, `Publishing didn't work: ${message}`, [TRY_AGAIN, CANCEL])
  }
}

function list(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '')
}
