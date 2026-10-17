import { ArrowUp } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useRef, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'

// An option that's a colour (`#1e40af`, `rgb(...)`, `hsl(...)`) gets a swatch.
const COLOUR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch)\([^)]*\))$/i

/**
 * The answers to a question the AI asked: its options, numbered; an answer of the user's own (`typeLabel`); "Chat
 * about this" (a message about the question, not its answer: the AI replies and asks again); and Skip (ends the run
 * without a change). In the chat it takes the composer's place until the question is answered. With the focus in it,
 * a number key picks that option and the arrow keys move between the answers.
 */
type AnswerOptionsProps = {
  options: string[]
  /** An option, or the user's own answer. */
  onPick: (answer: string) => void
  /** Offers an answer of the user's own, with this placeholder (e.g. "Type a name"); left out where there's a text box already. */
  typeLabel?: string
  /** Sends a message about the question; left out where there's no chat. */
  onChat?: (message: string) => void
  onSkip?: () => void
  /** What Skip says (e.g. Cancel, where skipping ends more than the question). */
  skipLabel?: string
  disabled?: boolean
  className?: string
}

const ROW = 'flex w-full items-center gap-3 rounded-xl px-3 text-left text-sm'
const NUMBER = 'w-3 shrink-0 text-xs text-muted-foreground tabular-nums'
const QUIET = 'h-8 rounded-lg px-2.5 text-[13px] font-normal text-muted-foreground hover:text-foreground'

export function AnswerOptions({ options, onPick, typeLabel, onChat, onSkip, skipLabel = 'Skip', disabled, className }: AnswerOptionsProps) {
  const [own, setOwn] = useState('')
  const [chatting, setChatting] = useState(false)
  const [message, setMessage] = useState('')
  const panel = useRef<HTMLDivElement>(null)

  function answerOwn(e: FormEvent) {
    e.preventDefault()
    if (!own.trim() || disabled) return
    onPick(own.trim())
    setOwn('')
  }

  function sendChat(e: FormEvent) {
    e.preventDefault()
    if (!message.trim() || disabled) return
    onChat?.(message.trim())
    setMessage('')
    setChatting(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const typing = e.target instanceof HTMLInputElement
    if (e.key === 'Escape' && chatting) {
      e.preventDefault()
      setChatting(false)
      return
    }
    if (!typing && /^[1-9]$/.test(e.key) && !disabled) {
      const option = options[Number(e.key) - 1]
      if (option !== undefined) {
        e.preventDefault()
        onPick(option)
      }
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const answers = [...(panel.current?.querySelectorAll<HTMLElement>('[data-answer]') ?? [])]
      const at = answers.indexOf(e.target as HTMLElement)
      if (at === -1) return
      e.preventDefault()
      answers[(at + (e.key === 'ArrowDown' ? 1 : answers.length - 1)) % answers.length]?.focus()
    }
  }

  return (
    <div ref={panel} role="group" aria-label="Answers" onKeyDown={onKeyDown} className={cn('rounded-2xl border bg-background p-1.5 shadow-xs', className)}>
      {options.map((option, i) => (
        <button
          key={option}
          type="button"
          data-answer
          disabled={disabled}
          onClick={() => onPick(option)}
          className={cn(ROW, 'py-2 outline-none hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-50')}
        >
          <span aria-hidden className={NUMBER}>
            {i + 1}
          </span>
          {COLOUR.test(option.trim()) && <span aria-hidden className="size-3.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: option.trim() }} />}
          <span className="min-w-0 flex-1 break-words">{option}</span>
        </button>
      ))}

      {typeLabel && (
        <form onSubmit={answerOwn} className={cn(ROW, 'py-1 focus-within:bg-muted')}>
          <span aria-hidden className={NUMBER}>
            {options.length + 1}
          </span>
          <input
            data-answer
            aria-label={typeLabel}
            placeholder={`${typeLabel}…`}
            value={own}
            maxLength={2000}
            disabled={disabled}
            onChange={(e) => setOwn(e.target.value)}
            className="h-8 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          {own.trim() && (
            <Button type="submit" size="icon" aria-label="Send answer" disabled={disabled} className="size-7 rounded-full">
              <ArrowUp className="size-3.5" />
            </Button>
          )}
        </form>
      )}

      {(onChat || onSkip) && (
        <div className="mt-1.5 flex min-h-10 items-center gap-1 border-t px-1 pt-1.5">
          {chatting ? (
            <form onSubmit={sendChat} className="flex flex-1 items-center gap-1.5">
              <input
                // Opened by a click on "Chat about this", so it takes the focus.
                autoFocus
                aria-label="Ask the AI about this question"
                placeholder="Ask about this question…"
                value={message}
                maxLength={2000}
                disabled={disabled}
                onChange={(e) => setMessage(e.target.value)}
                className="h-8 min-w-0 flex-1 rounded-lg bg-muted px-3 text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button type="submit" size="icon" aria-label="Send" disabled={disabled || !message.trim()} className="size-7 rounded-full">
                <ArrowUp className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" className={QUIET} onClick={() => setChatting(false)}>
                Back
              </Button>
            </form>
          ) : (
            <>
              {onChat && (
                <Button type="button" variant="ghost" className={QUIET} disabled={disabled} onClick={() => setChatting(true)}>
                  Chat about this
                </Button>
              )}
              {onSkip && (
                <Button type="button" variant="ghost" className={cn(QUIET, 'ml-auto')} disabled={disabled} onClick={onSkip}>
                  {skipLabel}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
