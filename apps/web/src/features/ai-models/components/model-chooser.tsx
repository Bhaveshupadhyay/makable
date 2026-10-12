import { LoaderCircle, Search } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useSetKeyModels } from '../hooks/use-ai-keys'
import { errorText } from '../lib/error-text'
import { filterModels, MAX_ENABLED_MODELS, toggleModel } from '../lib/model-options'
import type { AiKey } from '../types'

type ModelChooserProps = {
  aiKey: AiKey
  /** Every chat model the key can use, from the server's last check of it. */
  available: string[]
  onDone: () => void
}

/** Checkboxes for the models a key shows in the chat's menu, saved together. */
export function ModelChooser({ aiKey, available, onDone }: ModelChooserProps) {
  const [enabled, setEnabled] = useState(aiKey.models)
  const [query, setQuery] = useState('')
  const save = useSetKeyModels()
  // Turned-on models first, so they stay easy to find in a long list.
  const shown = filterModels([...enabled.filter((m) => available.includes(m)), ...available.filter((m) => !enabled.includes(m))], query)
  const full = enabled.length >= MAX_ENABLED_MODELS

  return (
    <div className="space-y-3 border-t pt-3">
      {available.length > 10 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search models" placeholder={`Search ${available.length} models`} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
      )}
      {available.length === 0 ? (
        <p className="text-sm text-muted-foreground">The provider lists no chat models for this key.</p>
      ) : (
        <ul aria-label="Models" className="max-h-64 space-y-0.5 overflow-y-auto">
          {shown.map((model) => {
            const on = enabled.includes(model)
            return (
              <li key={model}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted has-disabled:cursor-not-allowed has-disabled:opacity-50">
                  <input type="checkbox" checked={on} disabled={!on && full} onChange={() => setEnabled((current) => toggleModel(current, model))} className="size-4 accent-primary" />
                  <span className="truncate font-mono text-xs">{model}</span>
                </label>
              </li>
            )
          })}
          {shown.length === 0 && <li className="px-2 py-1 text-sm text-muted-foreground">No model matches “{query}”.</li>}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {enabled.length} of {MAX_ENABLED_MODELS} shown in the chat
        </span>
        <Button type="button" size="sm" variant="ghost" className="ml-auto" disabled={save.isPending} onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={save.isPending}
          onClick={() => save.mutate({ keyId: aiKey.id, models: enabled }, { onSuccess: onDone })}
        >
          {save.isPending && <LoaderCircle className="animate-spin" />}
          Save models
        </Button>
      </div>
      {save.error && (
        <p role="alert" className="text-xs text-destructive">
          {errorText(save.error)}
        </p>
      )}
    </div>
  )
}
