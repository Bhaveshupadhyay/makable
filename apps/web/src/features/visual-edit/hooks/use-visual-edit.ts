import type { AiEditTarget, Portfolio } from '@makable/shared'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { applyContentEdit } from '../lib/apply-content-edit'
import { type ElementRect, HOST_SOURCE, type HostMessage, parseShimMessage, type ShimMode } from '../protocol'

const MAX_HISTORY = 100

type UseVisualEditOptions = {
  /** The preview iframe running the edit shim. */
  iframeRef: RefObject<HTMLIFrameElement | null>
  portfolio: Portfolio
  onChange: (portfolio: Portfolio) => void
  /** Select mode for AI edits: clicks pick an element instead of editing text. Owned by the caller. */
  selecting?: boolean
  /** Called when the user turns text editing on, so the caller can leave select mode. */
  onTextMode?: () => void
}

/** Edit mode, inline text edits from the preview iframe, undo/redo, and element selection for AI edits. */
export function useVisualEdit({ iframeRef, portfolio, onChange, selecting = false, onTextMode }: UseVisualEditOptions) {
  const [textMode, setTextMode] = useState(false)
  const [selection, setSelection] = useState<AiEditTarget | null>(null)
  const [selectionRect, setSelectionRect] = useState<ElementRect | null>(null)
  const enabled = textMode && !selecting
  const mode: ShimMode = selecting ? 'select' : enabled ? 'text' : 'off'
  // On a mode change, entering select mode ends text editing (it doesn't come back on its own),
  // and any selection is dropped: the shim clears its own when it leaves select mode.
  const [prevMode, setPrevMode] = useState(mode)
  if (mode !== prevMode) {
    setPrevMode(mode)
    if (selecting) setTextMode(false)
    setSelection(null)
    setSelectionRect(null)
  }
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ past: Portfolio[]; future: Portfolio[] }>({ past: [], future: [] })

  // The message listener outlives renders; read the latest values through a ref.
  const latest = useRef({ portfolio, onChange })
  useEffect(() => {
    latest.current = { portfolio, onChange }
  })

  // History only covers this hook's own edits. A portfolio change from elsewhere (e.g. the
  // chat switching template) clears it, so undo can't restore a snapshot that predates it.
  const emitted = useRef<Portfolio | null>(null)
  const emit = useCallback((next: Portfolio) => {
    emitted.current = next
    latest.current.onChange(next)
  }, [])
  useEffect(() => {
    if (emitted.current !== portfolio) setHistory({ past: [], future: [] })
    emitted.current = null
  }, [portfolio])

  const commit = useCallback((next: Portfolio) => {
    const current = latest.current.portfolio
    setHistory(({ past }) => ({ past: [...past, current].slice(-MAX_HISTORY), future: [] }))
    emit(next)
  }, [emit])

  const undo = useCallback(() => {
    const previous = history.past.at(-1)
    if (!previous) return
    setHistory({ past: history.past.slice(0, -1), future: [latest.current.portfolio, ...history.future] })
    emit(previous)
  }, [history, emit])

  const redo = useCallback(() => {
    const [next, ...rest] = history.future
    if (!next) return
    setHistory({ past: [...history.past, latest.current.portfolio], future: rest })
    emit(next)
  }, [history, emit])

  // Shim messaging. The shim announces `ready` on every page load, and we answer with the mode.
  useEffect(() => {
    const sendMode = () => {
      const msg: HostMessage = { source: HOST_SOURCE, type: 'mode', mode }
      iframeRef.current?.contentWindow?.postMessage(msg, '*')
    }
    sendMode()

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const msg = parseShimMessage(event.data)
      if (!msg) return
      if (msg.type === 'ready') {
        // A reload (static templates reload on every change) loses the shim's selection.
        setSelection(null)
        setSelectionRect(null)
        return sendMode()
      }
      if (msg.type === 'select') {
        setSelection(msg.target)
        return setSelectionRect(msg.rect)
      }
      if (msg.type === 'rect') return setSelectionRect(msg.rect)
      const result = applyContentEdit(latest.current.portfolio, msg.path, msg.value)
      if (result.ok) {
        setError(null)
        commit(result.portfolio)
      } else {
        setError(result.error)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [iframeRef, mode, commit])

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z while focus is in the builder (not in a text field).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable]')) return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  // Validation errors fade after a few seconds.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(timer)
  }, [error])

  const clearSelection = useCallback(() => {
    setSelection(null)
    setSelectionRect(null)
    const msg: HostMessage = { source: HOST_SOURCE, type: 'clear-selection' }
    iframeRef.current?.contentWindow?.postMessage(msg, '*')
  }, [iframeRef])

  return {
    enabled,
    toggle: () => {
      if (enabled) return setTextMode(false)
      setTextMode(true)
      onTextMode?.()
    },
    /** The element picked in select mode, as the page described it (validated). */
    selection,
    /** Where the selection is in the preview page's viewport, kept current as it scrolls. */
    selectionRect,
    clearSelection,
    /** Applies a change from outside the preview (e.g. AI ops) as one undoable step. */
    applyPortfolio: commit,
    error,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo,
    redo,
  }
}

export type VisualEdit = ReturnType<typeof useVisualEdit>
