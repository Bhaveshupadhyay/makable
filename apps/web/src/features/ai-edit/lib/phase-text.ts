import type { AiPending } from '../hooks/use-ai-run'

/** What the AI is doing, in a few words. */
export function phaseText(pending: AiPending): string {
  switch (pending.phase) {
    case 'thinking':
      return 'AI is working on it. Editing is paused until it’s done.'
    case 'checking':
      return 'Trying the change in the preview…'
    case 'saving':
      return 'It works. Saving it to GitHub…'
  }
}
