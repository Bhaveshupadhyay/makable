import { ArrowLeft } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { AddKeyButton, type ModelStatus } from '@/features/ai-models'
import { analytics } from '@/shared/lib/analytics'
import { Button } from '@/shared/ui/button'
import type { ChatMessage } from '../lib/chat'
import { ChatPanel } from './chat-panel'
import { ConnectGithub } from './connect-github'

type WaitingChatProps = {
  /** What was asked for: it's built once what's missing is there. */
  prompt: string
  /** makable's reply: what it needs first. */
  reply: string
  /** Under the reply: how to get it. */
  action: ReactNode
  placeholder: string
  /** Back to the landing page's prompt box, to change what was asked for. */
  onBack: () => void
}

/** A prompt that can't be built yet: the chat shows it, and makable saying what it needs first. */
function WaitingChat({ prompt, reply, action, placeholder, onBack }: WaitingChatProps) {
  const messages: ChatMessage[] = [
    { id: 'waiting-prompt', role: 'user', text: prompt, at: '' },
    { id: 'waiting-reply', role: 'assistant', text: reply, at: '' },
  ]
  return (
    <div className="h-[calc(100svh-3.5rem)]">
      <ChatPanel
        header={
          <>
            <span className="truncate text-sm font-medium">New site</span>
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft />
              Back
            </Button>
          </>
        }
        messages={messages}
        latestExtra={action}
        onSend={() => {}}
        composerDisabled
        placeholder={placeholder}
      />
    </div>
  )
}

const SIGN_IN_TEXT =
  'Before I start building, I need a place to save your site’s code: your GitHub account.\n\n' +
  'The code goes into a private repository on your account, so it stays 100% private and 100% yours. Sign in with GitHub and I’ll get started.'

type PromptProps = { prompt: string; onBack: () => void }

/** A guest's prompt: building needs their GitHub, so the chat asks them to sign in first. */
export function GuestChat({ prompt, onBack }: PromptProps) {
  return (
    <WaitingChat
      prompt={prompt}
      reply={SIGN_IN_TEXT}
      action={<ConnectGithub />}
      placeholder="Sign in with GitHub to start building"
      onBack={onBack}
    />
  )
}

type MissingModel = Exclude<ModelStatus, 'ready'>

const MODEL_TEXT: Record<MissingModel, { reply: string; placeholder: string }> = {
  'no-key': {
    reply:
      'Before I start building, I need an AI model to build it with: makable runs on your own API key.\n\n' +
      'An API key is like a password from an AI provider (OpenAI, Google Gemini, Groq and more) that lets makable use ' +
      'their AI on your account. Add one in Settings, and I’ll start building as soon as you’re back.',
    placeholder: 'Add an API key to start building',
  },
  'no-models': {
    reply: 'Your API key works, but no model is chosen for makable yet. Choose one in Settings, and I’ll start building as soon as you’re back.',
    placeholder: 'Choose a model to start building',
  },
  'key-invalid': {
    reply:
      'Your API key stopped working, so I can’t build with it. Add a new one, or check it again, in Settings, and I’ll ' +
      'start building as soon as you’re back.',
    placeholder: 'Fix your API key to start building',
  },
}

/** A signed-in user's prompt with no AI model to build it (no key, no model chosen, or a key that stopped working). */
export function ModelNeededChat({ prompt, status, onBack }: PromptProps & { status: MissingModel }) {
  useEffect(() => {
    analytics.track('ai_key_prompted', { status })
  }, [status])
  const text = MODEL_TEXT[status]
  return <WaitingChat prompt={prompt} reply={text.reply} action={<AddKeyButton status={status} />} placeholder={text.placeholder} onBack={onBack} />
}
