import { expect, test } from 'bun:test'
import { chatAnalytics } from './chat-analytics'
import { AI_EDIT, type ChatContext, type ChatEvent, type Conversation, initialConversation, reduceConversation } from './conversation'

const signedIn: ChatContext = {
  user: { login: 'octocat', name: 'The Octocat', avatarUrl: 'https://avatars.example/octocat.png' },
  templates: [{ id: 'minimal', name: 'Minimal' }],
}
const guest: ChatContext = { ...signedIn, user: null }

function step(event: ChatEvent, before: Conversation, ctx = signedIn) {
  const after = reduceConversation(before, event, ctx)
  return { after, events: chatAnalytics(event, before, after, ctx) }
}

test('a chat message carries the text, the step and the assistant reply, plus the step reached', () => {
  const { events } = step({ type: 'user-text', text: 'I want a portfolio' }, initialConversation())
  expect(events[0]).toMatchObject({
    event: 'chat_message_sent',
    props: { text: 'I want a portfolio', length: 18, step: 'intent', next_step: 'template', signed_in: true },
  })
  expect(events[0].event === 'chat_message_sent' && events[0].props.reply).toContain('Pick a template')
  expect(events[1]).toEqual({ event: 'chat_step_reached', props: { step: 'template', from: 'intent' } })
})

test('template picks say whether it was the first one', () => {
  const atTemplate = step({ type: 'user-text', text: 'I want a portfolio' }, initialConversation()).after
  const first = step({ type: 'select-template', template: 'minimal' }, atTemplate)
  expect(first.events[0]).toEqual({ event: 'template_selected', props: { template_id: 'minimal', step: 'template', first_pick: true } })
  const again = step({ type: 'select-template', template: 'minimal' }, first.after)
  expect(again.events[0]).toMatchObject({ props: { first_pick: false } })
})

test('a guest asking for AI edits is prompted to connect GitHub, and connecting is tracked once', () => {
  let state = step({ type: 'user-text', text: 'I want a portfolio' }, initialConversation(), guest).after
  state = step({ type: 'select-template', template: 'minimal' }, state, guest).after
  const prompted = step({ type: 'user-text', text: AI_EDIT }, state, guest)
  expect(prompted.events.map((e) => e.event)).toEqual(['chat_message_sent', 'github_sign_in_prompted'])
  const connected = step({ type: 'signed-in' }, prompted.after)
  expect(connected.events.map((e) => e.event)).toEqual(['github_connected_in_chat'])
  expect(step({ type: 'signed-in' }, connected.after).events).toEqual([])
})

test('a pasted token is never tracked, only that one was entered', () => {
  const { events } = step({ type: 'publish-token', last4: 'abcd' }, initialConversation())
  expect(events[0].event).toBe('publish_token_entered')
  expect(JSON.stringify(events)).not.toContain('abcd')
})

test('publish results and failures', () => {
  const done = chatAnalytics(
    {
      type: 'publish-done',
      result: {
        target: 'github-pages',
        repoFullName: 'octocat/octocat.github.io',
        repoUrl: 'https://github.com/octocat/octocat.github.io',
        branch: 'main',
        commitSha: 'abc',
        changed: true,
        siteUrl: 'https://octocat.github.io',
        projectName: null,
        missingSecrets: [],
      },
    } as ChatEvent,
    initialConversation(),
    initialConversation(),
    signedIn,
  )
  expect(done[0]).toMatchObject({ event: 'publish_succeeded', props: { target: 'github-pages', site_url: 'https://octocat.github.io' } })
  const failed = chatAnalytics({ type: 'publish-failed', code: 'publish_repo_taken', message: 'Taken' }, initialConversation(), initialConversation(), signedIn)
  expect(failed).toEqual([{ event: 'publish_failed', props: { code: 'publish_repo_taken', message: 'Taken' } }])
})
