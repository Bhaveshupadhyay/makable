import { CircleHelp } from 'lucide-react'
import { Popover } from 'radix-ui'
import { analytics } from '@/shared/lib/analytics'
import { Button } from '@/shared/ui/button'

const POINTS = [
  {
    title: 'Where to get one',
    text: 'On the AI company’s website: OpenAI, Anthropic (Claude), Google Gemini, Groq, Mistral and more. Settings takes you to the right page.',
  },
  { title: 'What it costs', text: 'The AI company bills your account for what makable uses. Some have a free tier to start with.' },
  { title: 'Safe', text: 'makable checks it with the company, keeps it encrypted and only ever shows its last 4 characters.' },
  { title: 'Yours', text: 'You can remove it in Settings at any time.' },
]

/** "What’s an API key?" for people who've never used one: what it is and why makable asks for it, in plain words. */
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
          className="z-50 w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-md outline-none"
        >
          <div className="space-y-1">
            <p className="font-semibold">What’s an API key?</p>
            <p className="text-muted-foreground">
              A private code from an AI company that lets makable use their AI on your account, to build and change your site.
            </p>
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
