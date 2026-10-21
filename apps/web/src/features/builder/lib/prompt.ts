import { MAX_PROMPT } from '@makable/shared'

const count = (n: number) => n.toLocaleString('en-US')

/** Why a site's description can't be sent (longer than the request allows), or null when it can. */
export function promptProblem(prompt: string): string | null {
  const length = prompt.trim().length
  return length > MAX_PROMPT ? `Keep the description under ${count(MAX_PROMPT)} characters (it’s ${count(length)}).` : null
}
