import { type AiEditTarget, MAX_INSTRUCTION } from '@makable/shared'
import { ArrowUp, Crosshair, LoaderCircle, X } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useElementSize } from '@/shared/hooks/use-element-size'
import { Button } from '@/shared/ui/button'
import type { AiEdit } from '../hooks/use-ai-edit'
import { targetLabel } from '../lib/build-content-request'
import { type Box, placePopover } from '../lib/place-popover'

type AiEditPopoverProps = {
  ai: AiEdit
  /** The element picked in the preview. The popover shows only while there is one. */
  target: AiEditTarget | null
  /** Where that element is, in the preview page's viewport. */
  anchor: Box | null
  onClear: () => void
}

/**
 * "Ask AI to make changes", floating next to the selected element. Render it in the preview's
 * overlay slot: it covers the frame's viewport exactly, so page coordinates need no conversion.
 */
export function AiEditPopover({ ai, target, anchor, onClear }: AiEditPopoverProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bounds = useElementSize(overlayRef)
  const [text, setText] = useState('')
  // The latest selection, for the send callback: the user may pick another element while it's pending.
  const targetRef = useRef(target)
  useEffect(() => {
    targetRef.current = target
  }, [target])

  // A click in the preview picks the element; typing should follow without another click.
  useEffect(() => {
    if (target) inputRef.current?.focus()
  }, [target])

  const place = target && anchor && bounds ? placePopover(anchor, bounds) : null

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!text.trim() || ai.pending) return
    const sent = { text, target }
    // Only clear what was sent: a new selection or draft made while waiting stays.
    ai.send(text, target, () => {
      setText((current) => (current === sent.text ? '' : current))
      if (targetRef.current === sent.target) onClear()
    })
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClear()
    } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-px overflow-hidden">
      {place && target && (
        <form
          onSubmit={submit}
          aria-label="Ask AI"
          style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom }}
          className="pointer-events-auto absolute space-y-1.5 rounded-xl border bg-background p-2 shadow-lg"
        >
          <div className="flex items-center gap-1.5 px-1 text-xs text-violet-700 dark:text-violet-300">
            <Crosshair className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{targetLabel(target)}</span>
            <button type="button" aria-label="Clear selection" onClick={onClear} className="rounded-full p-0.5 hover:bg-muted">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="flex items-end gap-2 rounded-lg border p-1 focus-within:ring-[3px] focus-within:ring-ring/30">
            <textarea
              ref={inputRef}
              aria-label="Ask AI to make changes"
              rows={1}
              value={text}
              maxLength={MAX_INSTRUCTION}
              placeholder="Ask AI to make changes"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              className="field-sizing-content max-h-28 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" size="icon" aria-label="Send to AI" disabled={!text.trim() || ai.pending} className="size-8 rounded-full">
              {ai.pending ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
            </Button>
          </div>
          {ai.invalid && (
            <p role="alert" className="px-1 text-xs text-destructive">
              {ai.invalid}
            </p>
          )}
          {ai.error && (
            <p role="alert" className="px-1 text-xs text-destructive">
              Couldn't reach the AI service. {ai.error.message}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

/** Banner while AI mode is on and nothing is selected yet. */
export function AiEditHint() {
  return (
    <p role="status" className="border-b bg-violet-500/5 px-4 py-2 text-xs text-muted-foreground">
      Click anything in the preview to change it with AI. <kbd className="font-sans font-medium">Esc</kbd> clears the selection.
    </p>
  )
}
