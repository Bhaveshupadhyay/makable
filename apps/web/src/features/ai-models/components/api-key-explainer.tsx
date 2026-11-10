import { CircleHelp } from 'lucide-react'
import { Popover } from 'radix-ui'
import { analytics } from '@/shared/lib/analytics'
import { Button } from '@/shared/ui/button'
import { FreeKeyTip, ProviderLinks } from './provider-links'

const POINTS = [
  { title: 'What it costs', text: 'The AI company bills your account for what makable uses, unless you’re on a free tier like Gemini’s.' },
  { title: 'Safe', text: 'makable checks it with the company, keeps it encrypted and only ever shows its last 4 characters.' },
  { title: 'Yours', text: 'You can remove it in Settings at any time.' },
]

/**
 * "What’s an API key?" for people who've never used one: what it is, the free option, each company's page for making
 * one, and why it's safe, in plain words.
 */
export function ApiKeyExplainer({ source }: { source: 'chat' }) {
  return (
    <Popover.Root onOpenChange={(open) => open && analytics.track('ai_key_help_opened', { source })}>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <CircleHelp />
          What’s an API key?
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          className="z-50 max-h-(--radix-popover-content-available-height) w-88 max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-md outline-none"
        >
          <div className="space-y-1">
            <p className="font-semibold">What’s an API key?</p>
            <p className="text-muted-foreground">
              A private code from an AI company that lets makable use their AI on your account, to build and change your site.
            </p>
          </div>
          <FreeKeyTip source={source} />
          <div className="space-y-1.5">
            <p>
              <span className="font-medium">Where to get one.</span>{' '}
              <span className="text-muted-foreground">On the AI company’s website. Each link opens its page for making a key:</span>
            </p>
            <ProviderLinks source={source} />
          </div>
          <ul className="space-y-2">
            {POINTS.map((point) => (
              <li key={point.title}>
                <span className="font-medium">{point.title}.</span> <span className="text-muted-foreground">{point.text}</span>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
