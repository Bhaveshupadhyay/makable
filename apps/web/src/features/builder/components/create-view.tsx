import { useQueryClient } from '@tanstack/react-query'
import { Check, LoaderCircle } from 'lucide-react'
import { AnswerOptions, dismissRun, threadKey, useThread } from '@/features/ai-edit'
import { useSession } from '@/features/auth'
import { useSiteStore } from '@/features/site'
import type { CreateSite, Creating } from '../hooks/use-create-site'
import { TRY_AGAIN } from '../hooks/use-create-site'
import { buildChat, type ChatMessage as Message } from '../lib/chat'
import { useSiteChat } from '../store'
import { ChatMessage } from './chat-message'
import { ChatPanel } from './chat-panel'
import { SiteMenu } from './site-menu'

/** The chat while a site is being built from its prompt: progress, the name question, or why it stopped. */
export function CreateView({ creation }: { creation: CreateSite }) {
  const login = useSession().data?.login
  const queryClient = useQueryClient()
  const projectId = useSiteStore((s) => s.projectId)
  const thread = useThread(projectId)
  const chat = useSiteChat(projectId)
  const run = thread.data?.run?.mode === 'create' ? thread.data.run : null
  const question = run?.question ?? null
  const { creating } = creation
  const messages = buildChat(thread.data ?? null, chat)

  function send(text: string) {
    if (creating) return
    if (run && question) return creation.answer(run.runId, run.instruction, text)
    // "Try again" builds the last prompt that didn't make it.
    if (text === TRY_AGAIN) {
      const prompt = [...chat.messages].reverse().find((m) => m.role === 'user')?.text
      if (prompt) creation.start(prompt)
      return
    }
    creation.start(text)
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
      onSend={send}
      onStop={creating ? creation.stop : undefined}
      placeholder={question ? 'Type a name for your site' : 'Describe the site you want to build…'}
      tail={
        creating ? (
          <Progress creating={creating} />
        ) : (
          run &&
          question && (
            <>
              <ChatMessage message={asked(run.runId, run.instruction)} />
              <ChatMessage message={{ id: `${run.runId}-question`, role: 'assistant', text: question.question, at: '' }}>
                <AnswerOptions options={question.options} onPick={send} onSkip={() => void cancel()} skipLabel="Cancel" />
              </ChatMessage>
            </>
          )
        )
      }
    />
  )
}

const asked = (id: string, text: string): Message => ({ id: `${id}-asked`, role: 'user', text, at: '' })

/** What the creation has done so far: its steps, the last one in progress. */
function Progress({ creating }: { creating: Creating }) {
  const { steps, written } = creating
  return (
    <>
      <ChatMessage message={asked('creating', creating.prompt)} />
      <div className="space-y-1.5 pl-8 text-sm" role="status">
        {steps.length === 0 && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            Starting…
          </p>
        )}
        {steps.map((step, i) => (
          <p key={`${i}-${step}`} className="flex items-center gap-2 text-muted-foreground">
            {i === steps.length - 1 ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" /> : <Check className="size-3.5 shrink-0" />}
            <span className="truncate">{step}</span>
          </p>
        ))}
        {written && (
          <div className="h-1 w-48 overflow-hidden rounded-full bg-muted" aria-label={`${written.done} of ${written.total} files written`}>
            <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round((100 * written.done) / Math.max(written.total, 1))}%` }} />
          </div>
        )}
      </div>
    </>
  )
}
