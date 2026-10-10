import type { SessionSnapshot } from '@makable/shared'
import { Download, Upload, X } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { useAiEditPending } from '@/features/ai-edit'
import { Button } from '@/shared/ui/button'
import type { Builder } from '../hooks/use-builder'
import { checkSessionFileSize, readSessionFile, type SessionState } from '../lib/session-file'

type SessionActionsProps = { builder: Pick<Builder, 'exportSession' | 'importSession'> }

type Pending = { fileName: string; state: SessionState; snapshot: SessionSnapshot }

/** Export downloads the session as a file; Import replaces the session with one, after asking. */
export function SessionActions({ builder }: SessionActionsProps) {
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  // An AI answer is for the session as it was sent: don't swap the session out from under it.
  const aiPending = useAiEditPending()

  function exportSession() {
    setError(null)
    const file = builder.exportSession()
    if (!file) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(file.snapshot, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = file.fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Cleared so picking the same file again still fires a change.
    e.target.value = ''
    if (!file) return
    setPending(null)
    const tooLarge = checkSessionFileSize(file.size)
    if (tooLarge) return setError(tooLarge)
    const read = readSessionFile(await file.text())
    if (!read.ok) return setError(read.error)
    setError(null)
    setPending({ fileName: file.name, state: read.state, snapshot: read.snapshot })
  }

  function replace() {
    if (!pending) return
    builder.importSession(pending.state, pending.snapshot)
    setPending(null)
  }

  return (
    <div className="relative flex items-center gap-1">
      <Button variant="ghost" size="sm" title="Export this session as a file" onClick={exportSession}>
        <Download />
        <span className="hidden sm:inline">Export</span>
        <span className="sr-only sm:hidden">Export session</span>
      </Button>
      <Button variant="ghost" size="sm" title="Import a session file" disabled={aiPending} onClick={() => input.current?.click()}>
        <Upload />
        <span className="hidden sm:inline">Import</span>
        <span className="sr-only sm:hidden">Import session</span>
      </Button>
      <input ref={input} type="file" accept="application/json,.json" className="hidden" aria-hidden tabIndex={-1} onChange={pick} />

      {pending && (
        <div
          role="dialog"
          aria-label="Replace session"
          className="absolute top-full right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-background p-3 text-sm shadow-lg"
          onKeyDown={(e) => e.key === 'Escape' && setPending(null)}
        >
          <p className="font-medium">Replace your current session?</p>
          <p className="mt-1 text-muted-foreground">
            {pending.fileName}: {pending.snapshot.conversation.messages.length} messages, exported {pending.snapshot.exportedAt.slice(0, 10)}
            {pending.snapshot.login ? ` by @${pending.snapshot.login}` : ''}. Your current chat, site and AI history will be replaced.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            {/* Cancel takes focus: replacing can't be undone, so it shouldn't be one Enter away. */}
            <Button variant="outline" size="sm" autoFocus onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={aiPending} onClick={replace}>
              Replace
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="absolute top-full right-0 z-50 mt-2 flex w-80 max-w-[calc(100vw-2rem)] items-start gap-2 rounded-lg border bg-background p-3 text-sm text-destructive shadow-lg">
          <p className="flex-1">{error}</p>
          <button type="button" aria-label="Dismiss" className="text-muted-foreground hover:text-foreground" onClick={() => setError(null)}>
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
