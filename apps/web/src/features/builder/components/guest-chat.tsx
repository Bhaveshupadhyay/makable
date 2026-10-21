import { ArrowLeft } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import type { ChatMessage } from '../lib/chat'
import { ChatPanel } from './chat-panel'

const SIGN_IN_TEXT =
  'Before I start building, I need a place to save your site’s code: your GitHub account.\n\n' +
  'The code goes into a private repository on your account, so it stays 100% private and 100% yours. Sign in with GitHub and I’ll get started.'

type GuestChatProps = {
  /** What the guest asked for: it's built once they're signed in. */
  prompt: string
  /** Back to the landing page's prompt box, to change what they asked for. */
  onBack: () => void
}

/** A guest's chat after sending a prompt: building needs their GitHub, so the chat asks them to sign in first. */
export function GuestChat({ prompt, onBack }: GuestChatProps) {
  const messages: ChatMessage[] = [
    { id: 'guest-prompt', role: 'user', text: prompt, at: '' },
    { id: 'guest-sign-in', role: 'assistant', text: SIGN_IN_TEXT, at: '', widget: 'sign-in-github' },
  ]
  return (
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
      onSend={() => {}}
      composerDisabled
      placeholder="Sign in with GitHub to start building"
    />
  )
}
