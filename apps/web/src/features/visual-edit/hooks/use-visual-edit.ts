import { type AiEditTarget, MAX_SCREENSHOT_CHARS } from '@makable/shared'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { parseSource, patchText } from '@/features/site'
import { analytics } from '@/shared/lib/analytics'
import { type ElementRect, HOST_SOURCE, type HostMessage, parseShimMessage, type ShimMode } from '../protocol'

const MAX_HISTORY = 100
const CAPTURE_TIMEOUT_MS = 4_000
const SCREENSHOT = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/

/** A text edit made in the preview: the file it changed, before and after. */
type Step = { path: string; before: string; after: string }

type UseVisualEditOptions = {
  /** The preview iframe running the edit shim. */
  iframeRef: RefObject<HTMLIFrameElement | null>
  /** The site's file as the user sees it now (their unsaved edits included). */
  read: (path: string) => string | undefined
  /** Changes a file of the site (a manual edit, saved to GitHub later). */
  write: (path: string, content: string) => void
  /** Changes when the site changed some other way (an AI change, an Undo, another version loaded): undo history ends there. */
  historyKey: unknown
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
export function useVisualEdit({ iframeRef, read, write, historyKey, selecting = false, onTextMode, locked = false }: UseVisualEditOptions) {
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
  const [history, setHistory] = useState<{ past: Step[]; future: Step[]; key: unknown }>({ past: [], future: [], key: historyKey })
  // The site changed some other way: the steps no longer apply.
  if (history.key !== historyKey) setHistory({ past: [], future: [], key: historyKey })

  // The message listener outlives renders; read the latest values through a ref.
  const latest = useRef({ read, write })
  useEffect(() => {
    latest.current = { read, write }
  })
  const captures = useRef(new Map<string, (dataUrl: string | null) => void>())

  /** Puts a file back to `content` if it's still `expected` (it wasn't edited some other way since). */
  const restore = useCallback((path: string, expected: string, content: string) => {
    if (latest.current.read(path) !== expected) return false
    latest.current.write(path, content)
    return true
  }, [])

  const canUndo = !locked && history.past.length > 0
  const canRedo = !locked && history.future.length > 0

  const undo = useCallback(() => {
    const step = history.past.at(-1)
    if (!step || locked) return
    if (!restore(step.path, step.after, step.before)) return setHistory({ past: [], future: [], key: historyKey })
    setHistory({ past: history.past.slice(0, -1), future: [step, ...history.future], key: historyKey })
  }, [history, locked, restore, historyKey])

  const redo = useCallback(() => {
    const [step, ...rest] = history.future
    if (!step || locked) return
    if (!restore(step.path, step.before, step.after)) return setHistory({ past: [], future: [], key: historyKey })
    setHistory({ past: [...history.past, step], future: rest, key: historyKey })
  }, [history, locked, restore, historyKey])

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
        // A reload loses the shim's selection.
        setSelection(null)
        setSelectionRect(null)
        return sendMode()
      }
      if (msg.type === 'capture') {
        captures.current.get(msg.id)?.(msg.dataUrl)
        return captures.current.delete(msg.id)
      }
      // A locked page shouldn't send these; ignore them if it does.
      if (locked && (msg.type === 'select' || msg.type === 'edit')) return
      if (msg.type === 'select') {
        const target = msg.target
        if (target) {
          analytics.track('preview_element_selected', {
            tag: target.tag,
            text: target.text,
            source: target.source ? `${target.source.path}:${target.source.line}` : null,
            section: target.section ? (target.section.heading ?? target.section.id ?? target.section.tag) : null,
            selector: target.selector,
          })
        }
        setSelection(msg.target)
        return setSelectionRect(msg.rect)
      }
      if (msg.type === 'rect') return setSelectionRect(msg.rect)
      const source = parseSource(msg.src)
      const before = source ? latest.current.read(source.path) : undefined
      const result =
        source && before !== undefined
          ? patchText(source.path, before, source.line, source.column, msg.oldText, msg.value)
          : { ok: false as const, error: "This text isn't written in the site's code, so it can't be edited here. Ask the AI to change it." }
      if (result.ok && source && before !== undefined) {
        setError(null)
        analytics.track('visual_text_edited', { path: source.path, value: msg.value })
        latest.current.write(source.path, result.code)
        setHistory(({ past }) => ({ past: [...past, { path: source.path, before, after: result.code }].slice(-MAX_HISTORY), future: [], key: historyKey }))
      } else if (!result.ok) {
        analytics.track('visual_edit_rejected', { path: source?.path ?? msg.src, error: result.error })
        setError(result.error)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [iframeRef, mode, locked, historyKey])

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z while focus is in the builder (not in a text field or the code editor).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable], .monaco-editor')) return
      e.preventDefault()
      if (e.shiftKey) {
        if (canRedo) analytics.track('edit_redone', { source: 'keyboard' })
        redo()
      } else {
        if (canUndo) analytics.track('edit_undone', { source: 'keyboard' })
        undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, canUndo, canRedo])

  // Errors fade after a few seconds.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(timer)
  }, [error])

  const clearSelection = useCallback(() => {
    setSelection(null)
    setSelectionRect(null)
    const msg: HostMessage = { source: HOST_SOURCE, type: 'clear-selection' }
    iframeRef.current?.contentWindow?.postMessage(msg, '*')
  }, [iframeRef])

  /** A picture of the selected element (a data URL), or undefined when the page couldn't take one in time. */
  const capture = useCallback(
    () =>
      new Promise<string | undefined>((resolve) => {
        const id = crypto.randomUUID()
        const timer = setTimeout(() => {
          captures.current.delete(id)
          resolve(undefined)
        }, CAPTURE_TIMEOUT_MS)
        captures.current.set(id, (dataUrl) => {
          clearTimeout(timer)
          resolve(dataUrl && dataUrl.length <= MAX_SCREENSHOT_CHARS && SCREENSHOT.test(dataUrl) ? dataUrl : undefined)
        })
        const msg: HostMessage = { source: HOST_SOURCE, type: 'capture', id }
        iframeRef.current?.contentWindow?.postMessage(msg, '*')
      }),
    [iframeRef],
  )

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
    capture,
    error,
    canUndo,
    canRedo,
    undo,
    redo,
  }
}

export type VisualEdit = ReturnType<typeof useVisualEdit>
