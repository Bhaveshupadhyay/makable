import type { ReactNode } from 'react'
import { MakableIcon } from '@/shared/ui/makable-logo'
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
        <MakableIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{linkify(message.text)}</p>
        {children}
      </div>
    </div>
  )
}

// http(s) URLs in the assistant's text, without a closing punctuation mark after them.
const URL_IN_TEXT = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g

/** The assistant's text with its links clickable (they open in a new tab). */
function linkify(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  let at = 0
  for (const match of text.matchAll(URL_IN_TEXT)) {
    parts.push(text.slice(at, match.index))
    parts.push(
      <a key={match.index} href={match[0]} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
        {match[0]}
      </a>,
    )
    at = match.index + match[0].length
  }
  parts.push(text.slice(at))
  return parts
}
