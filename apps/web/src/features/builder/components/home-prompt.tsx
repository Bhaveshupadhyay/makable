import { ArrowUpRight } from 'lucide-react'
import { type ClipboardEvent, type KeyboardEvent, useState } from 'react'
import { SignInDialog } from '@/features/auth'
import { analytics } from '@/shared/lib/analytics'
import type { Builder } from '../hooks/use-builder'
import { savePendingPrompt } from '../lib/pending-prompt'
import { Composer } from './composer'

// Any of these starts the portfolio flow (the intent step accepts "portfolio", "site", "resume"…).
const IDEAS = ['A minimal portfolio site', 'A portfolio for my GitHub projects', 'A resume site']

/** Keys that would type into the prompt box (Tab, arrows and shortcuts still work for guests). */
function isTyping(e: KeyboardEvent) {
  return (e.key.length === 1 || e.key === 'Enter') && !e.metaKey && !e.ctrlKey && !e.altKey
}

/**
 * The landing page's prompt box: the chat's first message, before the chat opens. Building needs GitHub, so a
 * guest who clicks or types into it, or picks an idea, is asked to sign in first; what they picked is sent once
 * they're back.
 */
export function HomePrompt({ builder }: { builder: Builder }) {
  const { conversation, busy, send, signedIn } = builder
  const replies = conversation.messages[0]?.replies ?? []
  const [signingIn, setSigningIn] = useState(false)

  function askToSignIn(prompt: string | null = null) {
    savePendingPrompt(prompt)
    if (!signingIn) analytics.track('github_sign_in_prompted', { reason: 'home' })
    setSigningIn(true)
  }
  const start = signedIn ? send : (text: string) => askToSignIn(text)
  // Mouse down is stopped so the box doesn't take focus (or open the keyboard on a phone) behind the dialog.
  const guestGate = signedIn
    ? {}
    : {
        onMouseDownCapture: (e: { preventDefault: () => void }) => e.preventDefault(),
        onClickCapture: () => askToSignIn(),
        onKeyDownCapture: (e: KeyboardEvent) => {
          if (!isTyping(e)) return
          e.preventDefault()
          askToSignIn()
        },
        onPasteCapture: (e: ClipboardEvent) => {
          e.preventDefault()
          askToSignIn(e.clipboardData.getData('text').trim() || null)
        },
      }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div {...guestGate} className="rounded-3xl bg-linear-to-br from-[#FF2E63]/40 via-[#FF9500]/30 to-[#8B5CF6]/40 p-px shadow-lg shadow-[#FF3366]/10">
        <Composer
          onSend={start}
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
            onClick={() => start(idea)}
            className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-3 py-1.5 text-sm text-muted-foreground shadow-xs backdrop-blur transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {idea}
            <ArrowUpRight className="size-3.5" />
          </button>
        ))}
      </div>
      <SignInDialog open={signingIn} onOpenChange={setSigningIn} />
    </div>
  )
}
