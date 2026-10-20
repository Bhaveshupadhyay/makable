import type { AiPending } from '../hooks/use-ai-run'

/** Said after the time while the AI works: the user's own edits (text, code) wait until it's done. */
export const EDITS_PAUSED = 'manual edits paused'

/** What the AI is doing, in a few words (`ThinkingLine` adds the time and `EDITS_PAUSED`). */
export function phaseText(pending: AiPending): string {
  switch (pending.phase) {
    case 'thinking':
      return 'Thinking…'
    case 'checking':
      return 'Trying it in the preview…'
    case 'saving':
      return 'It works. Saving to GitHub…'
  }
}
