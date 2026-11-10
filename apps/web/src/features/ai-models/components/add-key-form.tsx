import { ExternalLink, KeyRound, LoaderCircle } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { analytics } from '@/shared/lib/analytics'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { useAddKey } from '../hooks/use-ai-keys'
import { errorText } from '../lib/error-text'
import { FREE_PROVIDER } from '../lib/providers'
import type { AiKey, AiProvider, AiProviderId } from '../types'

type AddKeyFormProps = {
  providers: AiProvider[]
  keys: AiKey[]
  /** After the server checked and saved the key. */
  onAdded: (keyId: string) => void
}

/**
 * Adds a key, or replaces the one for that provider. The server checks it with the provider before keeping it,
 * so a typo is caught here. The key is cleared from the page once it's sent.
 */
export function AddKeyForm({ providers, keys, onAdded }: AddKeyFormProps) {
  const [provider, setProvider] = useState<AiProviderId>(providers[0]?.id ?? 'openai')
  const [apiKey, setApiKey] = useState('')
  const add = useAddKey()
  const spec = providers.find((p) => p.id === provider)
  const replaces = keys.some((k) => k.provider === provider)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!apiKey.trim() || add.isPending) return
    add.mutate({ provider, apiKey: apiKey.trim() }, {
      onSuccess: (data) => {
        setApiKey('')
        onAdded(data.key.id)
      },
    })
  }

  return (
    <form onSubmit={submit} aria-label="Add an API key" className="space-y-3 rounded-xl border p-4">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="grid gap-2">
          <Label htmlFor="ai-provider">Provider</Label>
          <select
            id="ai-provider"
            value={provider}
            disabled={add.isPending}
            onChange={(e) => {
              setProvider(e.target.value as AiProviderId)
              add.reset()
            }}
            className="h-9 rounded-md border bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === FREE_PROVIDER ? `${p.name} (free tier)` : p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ai-api-key">API key</Label>
          <Input
            id="ai-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={spec ? `${spec.name} API key` : 'API key'}
            value={apiKey}
            readOnly={add.isPending}
            aria-invalid={add.isError || undefined}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {spec && (
          // The provider's own page for making a key, so nobody has to search for it.
          <Button asChild variant="outline" size="sm">
            <a
              href={spec.keysUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => analytics.track('ai_key_provider_link_clicked', { provider: spec.id, source: 'settings', placement: 'form' })}
            >
              Get your {spec.name} API key
              <ExternalLink />
            </a>
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!apiKey.trim() || add.isPending} className="ml-auto">
          {add.isPending ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
          {add.isPending ? 'Checking the key…' : replaces ? 'Replace key' : 'Add key'}
        </Button>
      </div>
      {add.error && (
        <p role="alert" className="text-xs text-destructive">
          {errorText(add.error)}
        </p>
      )}
    </form>
  )
}
