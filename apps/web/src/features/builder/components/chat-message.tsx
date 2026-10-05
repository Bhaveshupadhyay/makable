import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ChatMessage as ChatMessageType } from '../lib/conversation'

export function ChatMessage({ message, children }: { message: ChatMessageType; children?: ReactNode }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
          {message.text}
        </p>
      </div>
    )
  }
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
        <Sparkles className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
        {children}
      </div>
    </div>
  )
}
