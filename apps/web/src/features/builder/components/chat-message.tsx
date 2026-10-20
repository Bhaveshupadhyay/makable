import { Crosshair, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { MakableIcon } from '@/shared/ui/makable-logo'
import type { ChatMessage as ChatMessageType } from '../lib/chat'
import { Steps } from './steps'
import { UsageLine } from './usage-line'

type ChatMessageProps = {
  message: ChatMessageType
  /** Undoes an AI change; left out where changes can't be undone. */
  onUndo?: (commitSha: string) => void
  undoDisabled?: boolean
  children?: ReactNode
}

export function ChatMessage({ message, onUndo, undoDisabled, children }: ChatMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        {message.caption && (
          <span className="flex max-w-[85%] items-center gap-1 truncate text-xs text-violet-700 dark:text-violet-300">
            <Crosshair className="size-3 shrink-0" />
            <span className="truncate">{message.caption}</span>
          </span>
        )}
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
        {!!message.steps?.length && <Steps steps={message.steps} />}
        <p className={cn('text-sm leading-relaxed break-words whitespace-pre-wrap', message.tone === 'error' && 'text-destructive')}>
          {linkify(message.text)}
          {message.settingsLink && (
            <>
              {' '}
              <Link to="/settings" className="font-medium underline underline-offset-2">
                Manage AI models
              </Link>
            </>
          )}
        </p>
        {message.usage && <UsageLine usage={message.usage} />}
        {message.undo &&
          onUndo &&
          (message.undo.done ? (
            <p className="text-xs text-muted-foreground">Undone.</p>
          ) : (
            <Button
              variant="outline"
              size="sm"
              aria-label="Undo this change"
              className="rounded-full"
              disabled={undoDisabled}
              onClick={() => onUndo(message.undo!.commitSha)}
            >
              <Undo2 />
              Undo
            </Button>
          ))}
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
