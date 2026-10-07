import type { AiEditTarget, Portfolio } from '@makable/shared'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { applyContentEdit } from '../lib/apply-content-edit'
import { type ElementRect, HOST_SOURCE, type HostMessage, parseShimMessage, type ShimMode } from '../protocol'

const MAX_HISTORY = 100

/**
 * What the user is editing: the site's content, plus project files changed by AI code edits
 * (repo path → full contents, layered over the template's files).
 */
export type SiteDraft = { portfolio: Portfolio; files: Record<string, string> }

type UseVisualEditOptions = {
  /** The preview iframe running the edit shim. */
  iframeRef: RefObject<HTMLIFrameElement | null>
  /** The caller must hand back the exact `portfolio` and `files` objects it was given in `onChange`. */
  draft: SiteDraft
  onChange: (draft: SiteDraft) => void
  /** Select mode for AI edits: clicks pick an element instead of editing text. Owned by the caller. */
  selecting?: boolean
  /** Called when the user turns text editing on, so the caller can leave select mode. */
  onTextMode?: () => void
  /**
   * No edits while true (an AI request is pending): text mode can't be turned on, undo and redo
   * do nothing, and the preview ignores clicks but keeps the current selection.
   */
  locked?: boolean
}

/** Edit mode, inline text edits from the preview iframe, undo/redo, and element selection for AI edits. */
export function useVisualEdit({ iframeRef, draft, onChange, selecting = false, onTextMode, locked = false }: UseVisualEditOptions) {
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
  const [history, setHistory] = useState<{ past: SiteDraft[]; future: SiteDraft[] }>({ past: [], future: [] })

  // The message listener outlives renders; read the latest values through a ref.
  const latest = useRef({ draft, onChange })
  useEffect(() => {
    latest.current = { draft, onChange }
  })

  // History only covers this hook's own edits. A change from elsewhere (e.g. the chat switching
  // template) clears it, so undo can't restore a snapshot that predates it.
  const emitted = useRef<SiteDraft | null>(null)
  const emit = useCallback((next: SiteDraft) => {
    emitted.current = next
    latest.current.onChange(next)
  }, [])
  const { portfolio, files } = draft
  useEffect(() => {
    if (emitted.current?.portfolio !== portfolio || emitted.current.files !== files) setHistory({ past: [], future: [] })
    emitted.current = null
  }, [portfolio, files])

  const commit = useCallback((next: SiteDraft) => {
    const current = latest.current.draft
    setHistory(({ past }) => ({ past: [...past, current].slice(-MAX_HISTORY), future: [] }))
    emit(next)
  }, [emit])

  const undo = useCallback(() => {
    const previous = history.past.at(-1)
    if (!previous || locked) return
    setHistory({ past: history.past.slice(0, -1), future: [latest.current.draft, ...history.future] })
    emit(previous)
  }, [history, emit, locked])

  const redo = useCallback(() => {
    const [next, ...rest] = history.future
    if (!next || locked) return
    setHistory({ past: [...history.past, latest.current.draft], future: rest })
    emit(next)
  }, [history, emit, locked])

  // Shim messaging. The shim announces `ready` on every page load, and we answer with the mode.
  useEffect(() => {
    const sendMode = () => {
      const messages: HostMessage[] = [
        { source: HOST_SOURCE, type: 'mode', mode },
        { source: HOST_SOURCE, type: 'lock', locked },
      ]
      for (const msg of messages) iframeRef.current?.contentWindow?.postMessage(msg, '*')
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
      // A locked page shouldn't send these; ignore them if it does.
      if (locked && (msg.type === 'select' || msg.type === 'edit')) return
      if (msg.type === 'select') {
        setSelection(msg.target)
        return setSelectionRect(msg.rect)
      }
      if (msg.type === 'rect') return setSelectionRect(msg.rect)
      const current = latest.current.draft
      const result = applyContentEdit(current.portfolio, msg.path, msg.value)
      if (result.ok) {
        setError(null)
        commit({ ...current, portfolio: result.portfolio })
      } else {
        setError(result.error)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [iframeRef, mode, locked, commit])

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
    locked,
    toggle: () => {
      if (locked) return
      if (enabled) return setTextMode(false)
      setTextMode(true)
      onTextMode?.()
    },
    /** The element picked in select mode, as the page described it (validated). */
    selection,
    /** Where the selection is in the preview page's viewport, kept current as it scrolls. */
    selectionRect,
    clearSelection,
    /** Applies a change from outside the preview (e.g. an AI edit) as one undoable step. */
    applyDraft: commit,
    error,
    canUndo: !locked && history.past.length > 0,
    canRedo: !locked && history.future.length > 0,
    undo,
    redo,
  }
}

export type VisualEdit = ReturnType<typeof useVisualEdit>
