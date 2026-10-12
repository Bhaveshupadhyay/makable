import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { loginWithGithub, MOCK_AUTH, useSession } from '@/features/auth'
import { Button } from '@/shared/ui/button'
import { GithubIcon } from '@/shared/ui/github-icon'
import { AddKeyForm } from '../components/add-key-form'
import { KeyCard } from '../components/key-card'
import { useAiKeys, useAiProviders } from '../hooks/use-ai-keys'
import { errorText } from '../lib/error-text'

/** Settings → AI models: the user's own provider keys, and which of their models the chat offers. */
export function AiSettingsPage() {
  const session = useSession()
  const providers = useAiProviders()
  const keys = useAiKeys()
  // The key whose model checklist is open (a key that was just added opens it).
  const [choosing, setChoosing] = useState<string | null>(null)

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to the builder
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">AI models</h1>
        <p className="text-sm text-muted-foreground">
          Use your own API keys for AI edits, and pick the model in the chat. makable checks each key with the provider, stores it
          encrypted, and only ever shows its last 4 characters.
        </p>
      </div>

      {session.isPending ? (
        <Spinner />
      ) : !session.data ? (
        <div className="space-y-3 rounded-xl border p-6 text-center">
          <p className="text-sm text-muted-foreground">Connect GitHub to add your own API keys.</p>
          <Button onClick={() => loginWithGithub('/settings')}>
            <GithubIcon />
            Connect GitHub
          </Button>
        </div>
      ) : MOCK_AUTH ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
          Mock sign-in has no backend to keep API keys. Run makable-backend and sign in with GitHub to add them.
        </p>
      ) : providers.isPending || keys.isPending ? (
        <Spinner />
      ) : providers.error || keys.error ? (
        <div role="alert" className="space-y-3 rounded-xl border p-6 text-center">
          <p className="text-sm text-destructive">{errorText((providers.error ?? keys.error)!)}</p>
          <Button variant="outline" size="sm" onClick={() => void Promise.all([providers.refetch(), keys.refetch()])}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <AddKeyForm providers={providers.data} keys={keys.data} onAdded={setChoosing} />
          {keys.data.length > 0 ? (
            <ul aria-label="Your API keys" className="space-y-3">
              {keys.data.map((key) => (
                <KeyCard key={key.id} aiKey={key} choosing={choosing === key.id} onChoosingChange={(on) => setChoosing(on ? key.id : null)} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No keys yet. Until you add one, AI edits use makable's own model.</p>
          )}
        </>
      )}
    </main>
  )
}

function Spinner() {
  return (
    <div role="status" aria-label="Loading" className="flex justify-center py-10">
      <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}
