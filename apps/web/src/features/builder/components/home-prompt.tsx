import { ArrowUpRight } from 'lucide-react'
import { Composer } from './composer'

// Starting points: each one is sent as the prompt.
const IDEAS = ['A landing page for a neighbourhood bakery', 'A portfolio for a product designer', 'A one-page resume for a data scientist']

type HomePromptProps = {
  onStart: (prompt: string) => void
  busy?: boolean
  /** Text already in the box (what a guest asked for, back from their chat). */
  initialText?: string
}

/** The landing page's prompt box: the description of the site to build, typed or picked from the ideas. */
export function HomePrompt({ onStart, busy = false, initialText }: HomePromptProps) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="rounded-3xl bg-linear-to-br from-[#FF2E63]/40 via-[#FF9500]/30 to-[#8B5CF6]/40 p-px shadow-lg shadow-[#FF3366]/10">
        <Composer
          onSend={onStart}
          disabled={busy}
          initialText={initialText}
          placeholder="Describe the site you want to build…"
          className="rounded-[calc(1.5rem-1px)] border-0 p-3 shadow-none [&_textarea]:min-h-16 [&_textarea]:text-base"
        />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            disabled={busy}
            onClick={() => onStart(idea)}
            className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-3 py-1.5 text-sm text-muted-foreground shadow-xs backdrop-blur transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {idea}
            <ArrowUpRight className="size-3.5" />
          </button>
        ))}
      </div>
    </div>
  )
}
