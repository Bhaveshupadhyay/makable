import { type ReactNode, useEffect, useRef } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import type { ChatMessage as ChatMessageType } from '../lib/chat'
import { ChatMessage } from './chat-message'
import { Composer } from './composer'
import { ConnectGithub } from './connect-github'

type ChatPanelProps = {
  /** Shown at the top (the site's name and the sites menu). */
  header: ReactNode
  messages: ChatMessageType[]
  /** After the messages: what's in progress (the AI working, a question waiting). */
  tail?: ReactNode
  /** Under the last message (e.g. the token box). */
  latestExtra?: ReactNode
  onSend: (text: string) => void
  /** In the composer's place while it's set (the answers to a question the AI asked); undefined shows the composer. */
  footer?: ReactNode
  /** Quick replies of the latest message are offered while true. */
  repliesEnabled?: boolean
  composerDisabled?: boolean
  placeholder?: string
  /** While something runs: the composer's button stops it. */
  onStop?: () => void
  onUndo?: (commitSha: string) => void
  undoDisabled?: boolean
  className?: string
}

/** The conversation: messages with quick replies, what's in progress, and the composer (or what replaces it). */
export function ChatPanel({
  header,
  messages,
  tail,
  latestExtra,
  onSend,
  footer,
  repliesEnabled = true,
  composerDisabled,
  placeholder,
  onStop,
  onUndo,
  undoDisabled,
  className,
}: ChatPanelProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const latest = messages.at(-1)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, tail])

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3">{header}</div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-2xl space-y-5">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} onUndo={onUndo} undoDisabled={undoDisabled}>
              {message.widget === 'sign-in-github' && message === latest && <ConnectGithub />}
              {message.widget === 'reconnect-github' && message === latest && <ConnectGithub reconnect />}
              {message === latest && latestExtra}
              {message === latest && repliesEnabled && message.replies && message.replies.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {message.replies.map((reply) => (
                    <Button key={reply} variant="outline" size="sm" className="rounded-full" onClick={() => onSend(reply)}>
                      {reply}
                    </Button>
                  ))}
                </div>
              )}
            </ChatMessage>
          ))}
          {tail}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4">
        <div className="mx-auto max-w-2xl">
          {footer ?? <Composer onSend={onSend} disabled={composerDisabled} placeholder={placeholder} onStop={onStop} />}
        </div>
      </div>
    </div>
  )
}
