import type { AiUsage } from '@makable/shared'

// What an AI request took, as the chat says it: short under the reply ("12s · 12.4k tokens"), exact in its details.

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

/** Seconds as "0.8s", "12s", "1m 5s". */
export function durationText(seconds: number): string {
  if (seconds < 0.1) return '<0.1s'
  if (seconds < 10) return `${Math.round(seconds * 10) / 10}s`
  const whole = Math.round(seconds)
  if (whole < 60) return `${whole}s`
  const rest = whole % 60
  return rest ? `${Math.floor(whole / 60)}m ${rest}s` : `${whole / 60}m`
}

/** A token count, short: exact below 1,000, then "12.4k", "1.2M". */
export function tokenText(count: number): string {
  return compact.format(count).replace('K', 'k')
}

/** Dollars, with enough digits for a fraction of a cent. */
export function costText(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < 0.0001) return '<$0.0001'
  return `$${usd.toFixed(usd < 0.01 ? 4 : 2)}`
}

/** The line under the reply: how long it took and, when the provider said, how many tokens. */
export function usageSummary(usage: AiUsage): string {
  const parts = [durationText(usage.seconds)]
  if (usage.totalTokens !== null) parts.push(`${tokenText(usage.totalTokens)} tokens`)
  return parts.join(' · ')
}

/** The details, row by row. Counts the provider didn't report are left out. */
export function usageDetails(usage: AiUsage): { label: string; value: string }[] {
  const exact = (count: number) => count.toLocaleString('en-US')
  const rows: { label: string; value: string }[] = []
  if (usage.inputTokens !== null && usage.outputTokens !== null) {
    const cached = usage.cachedTokens ? `, ${exact(usage.cachedTokens)} from the cache` : ''
    const thinking = usage.reasoningTokens ? `, ${exact(usage.reasoningTokens)} thinking` : ''
    rows.push({ label: 'Input', value: `${exact(usage.inputTokens)} tokens${cached}` })
    rows.push({ label: 'Output', value: `${exact(usage.outputTokens)} tokens${thinking}` })
  } else {
    rows.push({ label: 'Tokens', value: "The provider didn't say" })
  }
  if (usage.costUsd !== null) rows.push({ label: 'Cost', value: costText(usage.costUsd) })
  const calls = usage.modelCalls === 1 ? '1 call' : `${usage.modelCalls} calls`
  rows.push({ label: 'Model', value: `${durationText(usage.modelSeconds)} over ${calls}` })
  rows.push({ label: 'In all', value: durationText(usage.seconds) })
  return rows
}
