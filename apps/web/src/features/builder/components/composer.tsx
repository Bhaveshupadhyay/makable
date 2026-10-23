import { ArrowUp, Square } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'

type ComposerProps = {
  /** Returning `false` keeps the text in the box (it wasn't sent). */
  onSend: (text: string) => void | false
  disabled?: boolean
  placeholder?: string
  /** While something runs: the button stops it instead of sending. */
  onStop?: () => void
  /** What's in the box when it appears. */
  initialText?: string
  className?: string
}

/** Message box: Enter sends, Shift+Enter adds a line. */
export function Composer({ onSend, disabled, placeholder = 'Message makable…', onStop, initialText = '', className }: ComposerProps) {
  const [text, setText] = useState(initialText)

  function submit(e?: FormEvent) {
    e?.preventDefault()
    // While something runs (Stop is shown), the text stays in the box until it's over.
    if (!text.trim() || disabled || onStop) return
    if (onSend(text) !== false) setText('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        'flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-xs focus-within:ring-[3px] focus-within:ring-ring/30',
        className,
      )}
    >
      <textarea
        aria-label="Message"
        rows={1}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
      />
      {/* Separate keys: if React reused the element, Stop would turn into a submit button mid-click. */}
      {onStop ? (
        <Button key="stop" type="button" size="icon" variant="outline" aria-label="Stop" title="Stop" onClick={onStop} className="rounded-full">
          <Square className="fill-current" />
        </Button>
      ) : (
        <Button key="send" type="submit" size="icon" aria-label="Send" disabled={disabled || !text.trim()} className="rounded-full">
          <ArrowUp />
        </Button>
      )}
    </form>
  )
}
