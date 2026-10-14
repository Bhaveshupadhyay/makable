import { ArrowUpRight } from 'lucide-react'
import type { Builder } from '../hooks/use-builder'
import { Composer } from './composer'

// Any of these starts the portfolio flow (the intent step accepts "portfolio", "site", "resume"…).
const IDEAS = ['A minimal portfolio site', 'A portfolio for my GitHub projects', 'A resume site']

/** The landing page's prompt box: the chat's first message, before the chat opens. */
export function HomePrompt({ builder }: { builder: Builder }) {
  const { conversation, busy, send } = builder
  const replies = conversation.messages[0]?.replies ?? []

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="rounded-3xl bg-linear-to-br from-[#FF2E63]/40 via-[#FF9500]/30 to-[#8B5CF6]/40 p-px shadow-lg shadow-[#FF3366]/10">
        <Composer
          onSend={send}
          disabled={busy}
          placeholder="Ask makable to build your portfolio…"
          className="rounded-[calc(1.5rem-1px)] border-0 p-3 shadow-none [&_textarea]:min-h-16 [&_textarea]:text-base"
        />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {[...replies, ...IDEAS].map((idea) => (
          <button
            key={idea}
            type="button"
            disabled={busy}
            onClick={() => send(idea)}
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
