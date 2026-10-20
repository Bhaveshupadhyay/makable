import { type AiEditTarget, MAX_INSTRUCTION } from '@makable/shared'
import { ArrowUp, Crosshair, MessageCircleQuestion, Square, X } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AddKeyPrompt, ModelPicker, useModelStatus } from '@/features/ai-models'
import { useElementSize } from '@/shared/hooks/use-element-size'
import { Button } from '@/shared/ui/button'
import type { AiRun } from '../hooks/use-ai-run'
import { EDITS_PAUSED, phaseText } from '../lib/phase-text'
import { type Box, placePopover } from '../lib/place-popover'
import { targetLabel } from '../lib/target-label'
import { AnswerOptions } from './answer-options'
import { ThinkingLine } from './thinking-line'

type AiEditPopoverProps = {
  ai: AiRun
  /** The element picked in the preview. The popover shows only while there is one. */
  target: AiEditTarget | null
  /** Where that element is, in the preview page's viewport. */
  anchor: Box | null
  /** The scale the page is drawn at (from the preview's overlay slot). */
  scale?: number
  onClear: () => void
}

/**
 * "Ask AI to make changes", floating next to the selected element. Render it in the preview's
 * overlay slot: it covers the frame's viewport exactly, so page coordinates times `scale` place it.
 */
export function AiEditPopover({ ai, target, anchor, scale = 1, onClear }: AiEditPopoverProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bounds = useElementSize(overlayRef)
  const [text, setText] = useState('')
  const status = useModelStatus()
  // The question the AI asked (a run paused for the user's answer): typing here answers it.
  const asked = ai.question?.question ?? null
  const question = asked?.question
  // What was sent from here: once it's done (without an error), the box clears it and the selection.
  const sent = useRef<{ text: string; target: AiEditTarget | null } | null>(null)
  const targetRef = useRef(target)
  useEffect(() => {
    targetRef.current = target
  }, [target])
  const busy = ai.busy
  useEffect(() => {
    const done = sent.current
    if (busy || !done) return
    sent.current = null
    if (ai.error) return
    setText((current) => (current === done.text ? '' : current))
    if (targetRef.current === done.target && !question) onClear()
  }, [busy, ai.error, question, onClear])

  // A click in the preview picks the element; typing should follow without another click.
  useEffect(() => {
    if (target) inputRef.current?.focus()
  }, [target])

  const place = target && anchor && bounds ? placePopover(scaleBox(anchor, scale), bounds) : null

  async function submit(e?: FormEvent, value = text) {
    e?.preventDefault()
    if (!value.trim() || ai.busy) return
    const started = question ? await ai.answer(value) : await ai.send(value, target)
    if (started) sent.current = { text: value, target }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      // While the AI works the box stays open, so Stop stays reachable.
      if (!ai.busy) onClear()
    } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      {place && target && (
        <form
          onSubmit={(e) => void submit(e)}
          aria-label="Ask AI"
          style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom }}
          className="pointer-events-auto absolute space-y-1.5 rounded-xl border bg-background p-2 shadow-lg"
        >
          <div className="flex items-center gap-1.5 px-1 text-xs text-violet-700 dark:text-violet-300">
            <Crosshair className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{targetLabel(target)}</span>
            <button
              type="button"
              aria-label="Clear selection"
              disabled={ai.busy}
              onClick={onClear}
              className="rounded-full p-0.5 hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {question && !ai.busy && (
            <div className="space-y-1.5 px-1">
              <p className="flex gap-1.5 text-sm">
                <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-400" />
                {question}
              </p>
              <AnswerOptions
                options={asked?.options ?? []}
                onPick={(option) => void submit(undefined, option)}
                onChat={(message) => void ai.answer(message, { chat: true })}
                onSkip={() => void ai.skip()}
              />
            </div>
          )}
          {status !== 'ready' && !ai.busy ? (
            <AddKeyPrompt status={status} className="px-1 pb-1" />
          ) : (
            <>
              <div className="flex items-end gap-2 rounded-lg border p-1 focus-within:ring-[3px] focus-within:ring-ring/30">
                <textarea
                  ref={inputRef}
                  aria-label={question ? 'Answer the AI' : 'Ask AI to make changes'}
                  rows={1}
                  value={text}
                  readOnly={ai.busy}
                  maxLength={MAX_INSTRUCTION}
                  placeholder={question ? 'Type your answer' : 'Ask AI to make changes'}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onKeyDown}
                  className="field-sizing-content max-h-28 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                />
                {/* Separate keys: if React reused the element, Stop would turn into a submit button
                    mid-click and send the request again. */}
                {ai.busy ? (
                  <Button
                    key="stop"
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Stop AI"
                    title="Stop"
                    onClick={(e) => {
                      e.preventDefault()
                      ai.stop()
                    }}
                    className="size-8 rounded-full"
                  >
                    <Square className="fill-current" />
                  </Button>
                ) : (
                  <Button key="send" type="submit" size="icon" aria-label="Send to AI" disabled={!text.trim()} className="size-8 rounded-full">
                    <ArrowUp />
                  </Button>
                )}
              </div>
              <div className="flex min-w-0 items-center">
                <ModelPicker disabled={ai.busy} />
              </div>
            </>
          )}
          {ai.pending && <ThinkingLine role="status" label={phaseText(ai.pending)} since={ai.pending.since} hint={EDITS_PAUSED} className="px-1" />}
          {ai.error && (
            <p role="alert" className="px-1 text-xs text-destructive">
              {ai.error.message}{' '}
              {ai.error.inSettings && (
                <Link to="/settings" className="font-medium underline underline-offset-2">
                  Manage AI models
                </Link>
              )}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

const scaleBox = (box: Box, scale: number): Box =>
  scale === 1 ? box : { x: box.x * scale, y: box.y * scale, width: box.width * scale, height: box.height * scale }

/** Banner while AI mode is on and nothing is selected yet. Asks for an API key first when there's no model to use. */
export function AiEditHint() {
  const status = useModelStatus()
  if (status !== 'ready') return <AddKeyPrompt status={status} className="border-b bg-violet-500/5 px-4 py-2" />
  return (
    <p role="status" className="border-b bg-violet-500/5 px-4 py-2 text-xs text-muted-foreground">
      Click anything in the preview to change it with AI. <kbd className="font-sans font-medium">Esc</kbd> clears the selection.
    </p>
  )
}
