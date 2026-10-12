import { CircleAlert, CircleCheck, ListChecks, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import { useAvailableModels, useCheckKey, useDeleteKey } from '../hooks/use-ai-keys'
import { errorText } from '../lib/error-text'
import { providerName } from '../lib/labels'
import type { AiKey } from '../types'
import { ModelChooser } from './model-chooser'

type KeyCardProps = {
  aiKey: AiKey
  /** Opens the model checklist, e.g. right after the key was added. */
  choosing: boolean
  onChoosingChange: (choosing: boolean) => void
}

/** One saved key: its status, the models it shows in the chat, and Check again / Remove. */
export function KeyCard({ aiKey, choosing, onChoosingChange }: KeyCardProps) {
  const check = useCheckKey()
  const remove = useDeleteKey()
  const { data: available } = useAvailableModels(aiKey.id)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const valid = aiKey.status === 'valid'
  const error = check.error ?? remove.error

  function chooseModels() {
    // The list comes from the provider; without one from this tab, a check fetches it.
    if (available) onChoosingChange(true)
    else check.mutate(aiKey.id, { onSuccess: (data) => onChoosingChange(data.key.status === 'valid') })
  }

  return (
    <li aria-label={`${providerName(aiKey.provider)} key`} className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{providerName(aiKey.provider)}</span>
        <span className="font-mono text-xs text-muted-foreground">••••{aiKey.keyHint}</span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
            valid ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-destructive/10 text-destructive',
          )}
        >
          {valid ? <CircleCheck className="size-3" /> : <CircleAlert className="size-3" />}
          {valid ? 'Working' : 'Not working'}
        </span>
        <span className="text-xs text-muted-foreground">Checked {formatTime(aiKey.checkedAt)}</span>
      </div>

      {!valid && <p className="text-sm text-muted-foreground">The provider refused this key. Check it again, or add a new {providerName(aiKey.provider)} key above to replace it.</p>}

      {valid && !choosing && (
        <p className="text-sm text-muted-foreground">
          {aiKey.models.length ? (
            <>
              In the chat: <span className="text-foreground">{aiKey.models.join(', ')}</span>
            </>
          ) : (
            'No models in the chat yet. Choose which ones to show.'
          )}
        </p>
      )}

      {choosing && available && <ModelChooser aiKey={aiKey} available={available} onDone={() => onChoosingChange(false)} />}

      {!choosing && (
        <div className="flex flex-wrap items-center gap-2">
          {valid && (
            <Button type="button" size="sm" variant="outline" disabled={check.isPending} onClick={chooseModels}>
              <ListChecks />
              Choose models
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" disabled={check.isPending} onClick={() => check.mutate(aiKey.id)}>
            {check.isPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Check again
          </Button>
          {confirmRemove ? (
            <span className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Remove this key?</span>
              <Button type="button" size="sm" variant="ghost" autoFocus onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" variant="outline" className="text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(aiKey.id)}>
                Remove
              </Button>
            </span>
          ) : (
            <Button type="button" size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setConfirmRemove(true)}>
              <Trash2 />
              Remove
            </Button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {errorText(error)}
        </p>
      )}
    </li>
  )
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
