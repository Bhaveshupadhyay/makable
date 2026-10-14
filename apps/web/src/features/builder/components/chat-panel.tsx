import { LoaderCircle, RotateCcw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import type { Builder } from '../hooks/use-builder'
import { ChatMessage } from './chat-message'
import { Composer } from './composer'
import { ConnectGithub } from './connect-github'
import { PublishTokenForm } from './publish-token-form'
import { TemplatePicker } from './template-picker'
import { TARGETS } from '../lib/publish-flow'

/** The conversation: messages with inline widgets and quick replies, and the composer. */
export function ChatPanel({ builder, className }: { builder: Builder; className?: string }) {
  const { conversation, busy, send, selectTemplate, startOver } = builder
  const { messages, portfolio, publish } = conversation
  const endRef = useRef<HTMLDivElement>(null)
  const latest = messages.at(-1)
  const fresh = messages.length === 1

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, busy])

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <span className="text-sm font-medium">Chat</span>
        <Button variant="ghost" size="sm" onClick={startOver} disabled={messages.length < 2}>
          <RotateCcw />
          Start over
        </Button>
      </div>

      <div className={cn('flex-1 overflow-y-auto px-4 py-5', fresh && 'flex flex-col justify-center')}>
        <div className={cn('mx-auto max-w-2xl space-y-5', fresh && 'w-full')}>
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message}>
              {message.widget === 'template-picker' && (
                <TemplatePicker selected={portfolio?.template} onSelect={selectTemplate} disabled={busy} />
              )}
              {message.widget === 'connect-github' && <ConnectGithub />}
              {/* Publishing's inline parts live in this browser only (the token never enters the chat). */}
              {message === latest && publish?.stage === 'token' && (
                <PublishTokenForm platform={TARGETS[publish.target ?? 'vercel'].name} onSubmit={builder.publish.enterToken} />
              )}
              {message === latest && publish?.stage === 'reconnect' && <ConnectGithub reconnect />}
              {message === latest && !busy && message.replies && message.replies.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {message.replies.map((reply) => (
                    <Button key={reply} variant="outline" size="sm" className="rounded-full" onClick={() => send(reply)}>
                      {reply}
                    </Button>
                  ))}
                </div>
              )}
            </ChatMessage>
          ))}
          {busy && (
            <p className="flex items-center gap-2 pl-8 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              {publish?.stage === 'running' ? 'Publishing…' : 'Working…'}
            </p>
          )}
          {publish?.stage === 'deploying' && (
            <p className="flex items-center gap-2 pl-8 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              Deploying to {TARGETS[publish.target ?? 'github-pages'].name}…
            </p>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4">
        <div className="mx-auto max-w-2xl">
          <Composer onSend={send} disabled={busy} />
        </div>
      </div>
    </div>
  )
}
