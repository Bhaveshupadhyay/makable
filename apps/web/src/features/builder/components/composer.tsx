import { ArrowUp } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useState } from 'react'
import { Button } from '@/shared/ui/button'

type ComposerProps = {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
}

/** Message box: Enter sends, Shift+Enter adds a line. */
export function Composer({ onSend, disabled, placeholder = 'Message makable…' }: ComposerProps) {
  const [text, setText] = useState('')

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!text.trim() || disabled) return
    onSend(text)
    setText('')
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
      className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-xs focus-within:ring-[3px] focus-within:ring-ring/30"
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
      <Button type="submit" size="icon" aria-label="Send" disabled={disabled || !text.trim()} className="rounded-full">
        <ArrowUp />
      </Button>
    </form>
  )
}
