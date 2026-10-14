import type { AnalyticsEvent } from '@/shared/lib/analytics'
import type { ChatContext, ChatEvent, Conversation } from './conversation'

/**
 * The analytics events for one chat event, from the conversation before and after it. Pure, so the reducer stays
 * free of side effects and this stays testable. Tokens never appear here: `publish-token` carries only the last 4
 * characters, and that isn't sent either.
 */
export function chatAnalytics(event: ChatEvent, before: Conversation, after: Conversation, ctx: ChatContext): AnalyticsEvent[] {
  const out: AnalyticsEvent[] = []
  const target = after.publish?.target ?? before.publish?.target ?? ctx.published?.target ?? null
  switch (event.type) {
    case 'user-text':
      out.push({
        event: 'chat_message_sent',
        props: {
          text: event.text,
          length: event.text.length,
          step: before.step,
          next_step: after.step,
          reply: assistantReply(before, after),
          signed_in: !!ctx.user,
        },
      })
      break
    case 'select-template':
      out.push({ event: 'template_selected', props: { template_id: event.template, step: before.step, first_pick: !before.portfolio } })
      break
    case 'github-loaded':
      out.push({ event: 'github_profile_loaded', props: { login: event.data.profile.login } })
      break
    case 'github-failed':
      out.push({ event: 'github_profile_failed', props: { login: event.login } })
      break
    case 'signed-in':
      // Only when the chat was waiting for it: a repeat (React may run the effect twice) changes nothing.
      if (before.awaitingSignIn) out.push({ event: 'github_connected_in_chat', props: { reason: before.signInFor ?? 'ai-edit' } })
      break
    case 'session-imported':
      out.push({ event: 'session_imported', props: { source: event.source } })
      break
    case 'sync-started':
      out.push({ event: 'github_sync_started', props: {} })
      break
    case 'publish':
      out.push({ event: 'publish_started', props: { republish: !!ctx.published, target: ctx.published?.target ?? null } })
      break
    case 'publish-token':
      out.push({ event: 'publish_token_entered', props: { target } })
      break
    case 'publish-done':
      out.push({
        event: 'publish_succeeded',
        props: {
          target: event.result.target,
          repo: event.result.repoFullName,
          site_url: event.result.siteUrl,
          changed: event.result.changed,
          missing_secrets: event.result.missingSecrets,
        },
      })
      break
    case 'publish-failed':
      out.push({ event: 'publish_failed', props: { code: event.code ?? null, message: event.message } })
      break
    case 'deploy-started':
      out.push({ event: 'deploy_started', props: { target } })
      break
    case 'deploy-finished':
      out.push({ event: 'deploy_finished', props: { target, conclusion: event.run?.conclusion ?? null, timed_out: !event.run } })
      break
    // `ai-sent` is tracked by the AI edit hook, with the model's answer.
    case 'ai-sent':
    case 'ai-edit':
      break
  }
  if (!before.awaitingSignIn && after.awaitingSignIn) {
    out.push({ event: 'github_sign_in_prompted', props: { reason: after.signInFor ?? 'ai-edit' } })
  }
  if (before.step !== after.step) out.push({ event: 'chat_step_reached', props: { step: after.step, from: before.step } })
  return out
}

/** What the assistant answered: the text of the messages the event added. */
function assistantReply(before: Conversation, after: Conversation): string | null {
  if (after.messages === before.messages) return null
  const added = after.messages.filter((m) => !before.messages.includes(m) && m.role === 'assistant')
  return added.length ? added.map((m) => m.text).join('\n\n') : null
}
