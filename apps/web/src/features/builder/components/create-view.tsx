import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { AnswerOptions, dismissRun, ThinkingLine, threadKey, useThread } from '@/features/ai-edit'
import { useModelStatus } from '@/features/ai-models'
import { useSession } from '@/features/auth'
import { useSiteStore } from '@/features/site'
import { analytics } from '@/shared/lib/analytics'
import type { CreateSite, Creating } from '../hooks/use-create-site'
import { TRY_AGAIN } from '../hooks/use-create-site'
import { buildChat, type ChatMessage as Message, modelNeededReply, pausedRunChat, user } from '../lib/chat'
import { useBuilderStore, useSiteChat } from '../store'
import { ChatMessage } from './chat-message'
import { ChatPanel } from './chat-panel'
import { SiteMenu } from './site-menu'

/** The chat while a site is being built from its prompt: progress, its questions (about the site, then its name), or why it stopped. */
export function CreateView({ creation }: { creation: CreateSite }) {
  const login = useSession().data?.login
  const queryClient = useQueryClient()
  const projectId = useSiteStore((s) => s.projectId)
  const thread = useThread(projectId)
  const chat = useSiteChat(projectId)
  const run = thread.data?.run?.mode === 'create' ? thread.data.run : null
  const question = run?.question ?? null
  const { creating } = creation
  const model = useModelStatus()
  const messages = buildChat(thread.data ?? null, chat)

  // `aboutQuestion`: a message about the question ("Chat about this"), not its answer.
  function send(text: string, aboutQuestion = false) {
    if (creating) return
    // "Try again" builds the last prompt that didn't make it.
    const asked = text === TRY_AGAIN && !question ? [...chat.messages].reverse().find((m) => m.role === 'user')?.text : text
    if (!asked) return
    // With no AI model to build it, nothing goes out: the chat asks for an API key, and Try again sends it once there's one.
    if (model !== 'ready') {
      analytics.track('ai_message_needs_key', { status: model, where: 'create' })
      const { say } = useBuilderStore.getState()
      say(projectId, user(asked.trim()))
      return say(projectId, modelNeededReply(model, question ? {} : { replies: [TRY_AGAIN] }))
    }
    if (run && question) return creation.answer(run, text, { chat: aboutQuestion })
    creation.start(asked)
  }

  async function cancel() {
    await dismissRun(projectId).catch(() => {})
    await queryClient.invalidateQueries({ queryKey: threadKey(login, projectId) })
  }

  return (
    <ChatPanel
      header={<SiteMenu disabled={!!creating} />}
      messages={messages}
      repliesEnabled={!creating && !question}
      onSend={(text) => send(text)}
      footer={
        !creating && run && question ? (
          <AnswerOptions
            options={question.options}
            onPick={(answer) => send(answer)}
            typeLabel={question.kind === 'project_name' ? 'Type a name' : 'Type something else'}
            onChat={(message) => send(message, true)}
            onSkip={() => void cancel()}
            skipLabel="Cancel"
          />
        ) : undefined
      }
      onStop={creating ? creation.stop : undefined}
      placeholder="Describe the site you want to build…"
      tail={
        creating ? (
          <Progress creating={creating} />
        ) : (
          run &&
          question &&
          pausedRunChat(run).map((message) => <ChatMessage key={message.id} message={message} />)
        )
      }
    />
  )
}

const asked = (id: string, text: string): Message => ({ id: `${id}-asked`, role: 'user', text, at: '' })

/** What the creation has done so far: its steps, the last one in progress. */
function Progress({ creating }: { creating: Creating }) {
  const { steps, written, answering } = creating
  // Answering a question: the conversation so far and what was just sent stay on screen.
  const said = answering ? pausedRunChat(answering.run, answering.sent) : [asked('creating', creating.prompt)]
  return (
    <>
      {said.map((message) => (
        <ChatMessage key={message.id} message={message} />
      ))}
      <div className="space-y-1.5 pl-8 text-sm" role="status">
        {steps.slice(0, -1).map((step, i) => (
          <p key={`${i}-${step}`} className="flex items-center gap-2 text-muted-foreground">
            <Check className="size-3.5 shrink-0" />
            <span className="truncate">{step}</span>
          </p>
        ))}
        {/* The step in progress, with the time the request has taken so far. */}
        <ThinkingLine label={steps.at(-1) ?? (answering ? 'Thinking…' : 'Starting…')} since={creating.since} className="text-sm" />
        {written && (
          <div className="h-1 w-48 overflow-hidden rounded-full bg-muted" aria-label={`${written.done} of ${written.total} files written`}>
            <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round((100 * written.done) / Math.max(written.total, 1))}%` }} />
          </div>
        )}
      </div>
    </>
  )
}
