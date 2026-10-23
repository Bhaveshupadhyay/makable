import { ExternalLink } from 'lucide-react'
import { analytics } from '@/shared/lib/analytics'
import { cn } from '@/shared/lib/cn'
import { useAiProviders } from '../hooks/use-ai-keys'
import { FREE_PROVIDER } from '../lib/providers'

type Source = 'chat' | 'settings'

const track = (provider: string, source: Source, placement: 'free_tip' | 'providers') =>
  analytics.track('ai_key_provider_link_clicked', { provider, source, placement })

/** For people who'd rather not pay: Google Gemini's free tier, with the page that makes a key. */
export function FreeKeyTip({ source, className }: { source: Source; className?: string }) {
  const gemini = useAiProviders().data?.find((p) => p.id === FREE_PROVIDER)
  if (!gemini) return null
  return (
    <div className={cn('space-y-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm', className)}>
      <p>
        <span className="font-medium">Want it free?</span> Google Gemini has a free tier, no card needed.
      </p>
      <a
        href={gemini.keysUrl}
        target="_blank"
        rel="noreferrer"
        onClick={() => track(gemini.id, source, 'free_tip')}
        className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
      >
        Get a free Gemini key
        <ExternalLink className="size-3.5" />
      </a>
      <p className="text-xs text-muted-foreground">
        Free use has daily limits and works with Gemini’s Flash models. Google may use it to improve its products.
      </p>
    </div>
  )
}

/** Each AI company's page for making an API key, so nobody has to search for it. */
export function ProviderLinks({ source }: { source: Source }) {
  const providers = useAiProviders().data ?? []
  return (
    <ul aria-label="Where to get an API key" className="flex flex-wrap gap-1.5">
      {providers.map((provider) => (
        <li key={provider.id}>
          <a
            href={provider.keysUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => track(provider.id, source, 'providers')}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-accent"
          >
            {provider.name}
            <ExternalLink className="size-3 opacity-60" />
          </a>
        </li>
      ))}
    </ul>
  )
}
