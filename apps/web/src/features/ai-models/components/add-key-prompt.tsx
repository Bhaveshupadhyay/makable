import { KeyRound } from 'lucide-react'
import { Link } from 'react-router'
import { analytics } from '@/shared/lib/analytics'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import type { ModelStatus } from '../lib/model-options'

const PROMPTS: Record<Exclude<ModelStatus, 'ready'>, { text: string; action: string }> = {
  'no-key': {
    text: 'AI edits run on your own API key (OpenAI, Gemini, Groq and more). Add one to start.',
    action: 'Add an API key',
  },
  'no-models': { text: 'Your API key works. Choose which of its models to use for AI edits.', action: 'Choose models' },
  'key-invalid': { text: 'Your API key stopped working. Add a new one, or check it again, in Settings.', action: 'Fix your API key' },
}

type MissingModel = Exclude<ModelStatus, 'ready'>

/** Asks for what AI edits are missing (a key, a model, a working key) and links to Settings. */
export function AddKeyPrompt({ status, className }: { status: MissingModel; className?: string }) {
  return (
    <div role="status" className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      <p className="min-w-0 flex-1 basis-56 text-sm text-muted-foreground">{PROMPTS[status].text}</p>
      <AddKeyButton status={status} source="ai_box" size="sm" />
    </div>
  )
}

type AddKeyButtonProps = {
  status: MissingModel
  /** Where it's offered: the chat's request for a key, or the AI box. */
  source: 'chat' | 'ai_box'
  size?: 'default' | 'sm'
}

/** The way to Settings for what's missing: "Add an API key", "Choose models" or "Fix your API key". */
export function AddKeyButton({ status, source, size = 'default' }: AddKeyButtonProps) {
  return (
    <Button asChild size={size}>
      <Link to="/settings" onClick={() => analytics.track('ai_key_setup_clicked', { status, source })}>
        <KeyRound />
        {PROMPTS[status].action}
      </Link>
    </Button>
  )
}
