import type { Portfolio } from '@makable/shared'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { applyContentEdit } from '../lib/apply-content-edit'
import { HOST_SOURCE, type HostMessage, parseShimMessage } from '../protocol'

const MAX_HISTORY = 100

type UseVisualEditOptions = {
  /** The preview iframe running the edit shim. */
  iframeRef: RefObject<HTMLIFrameElement | null>
  portfolio: Portfolio
  onChange: (portfolio: Portfolio) => void
}

/** Edit mode, inline text edits from the preview iframe, and undo/redo. */
export function useVisualEdit({ iframeRef, portfolio, onChange }: UseVisualEditOptions) {
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ past: Portfolio[]; future: Portfolio[] }>({ past: [], future: [] })

  // The message listener outlives renders; read the latest values through a ref.
  const latest = useRef({ portfolio, onChange })
  useEffect(() => {
    latest.current = { portfolio, onChange }
  })

  const commit = useCallback((next: Portfolio) => {
    const current = latest.current.portfolio
    setHistory(({ past }) => ({ past: [...past, current].slice(-MAX_HISTORY), future: [] }))
    latest.current.onChange(next)
  }, [])

  const undo = useCallback(() => {
    const previous = history.past.at(-1)
    if (!previous) return
    setHistory({ past: history.past.slice(0, -1), future: [latest.current.portfolio, ...history.future] })
    latest.current.onChange(previous)
  }, [history])

  const redo = useCallback(() => {
    const [next, ...rest] = history.future
    if (!next) return
    setHistory({ past: [...history.past, latest.current.portfolio], future: rest })
    latest.current.onChange(next)
  }, [history])

  // Shim messaging. The shim announces `ready` on every page load, and we answer with the mode.
  useEffect(() => {
    const sendMode = () => {
      const msg: HostMessage = { source: HOST_SOURCE, type: 'mode', enabled }
      iframeRef.current?.contentWindow?.postMessage(msg, '*')
    }
    sendMode()

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const msg = parseShimMessage(event.data)
      if (!msg) return
      if (msg.type === 'ready') return sendMode()
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
  }, [iframeRef, enabled, commit])

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

  return {
    enabled,
    toggle: () => setEnabled((value) => !value),
    error,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo,
    redo,
  }
}

export type VisualEdit = ReturnType<typeof useVisualEdit>
