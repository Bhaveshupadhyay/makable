const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en')
const day = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const longDay = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** 1,284 / 12.9K / 4.2M: exact under 10,000, compact from there. */
export function formatCount(n: number): string {
  return Math.abs(n) < 10_000 ? whole.format(n) : compact.format(n)
}

/** 45s, 3m 05s, 1h 12m. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

/** A fraction as a percentage: 0.2761 → 27.6%. */
export function formatPercent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(1))}%`
}

/** The change from `previous` to `current` as a fraction, or null when there was nothing before to compare with. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return (current - previous) / previous
}

/** +12%, −8% (a real minus sign), 0%. */
export function formatChange(fraction: number): string {
  const pct = Math.round(fraction * 100)
  if (pct === 0) return '0%'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`
}

/** An ISO date (`2026-10-03`) as `Oct 3`, or with `long` as `Sat, Oct 3, 2026`. The date is the property's day. */
export function formatDay(iso: string, { long = false } = {}): string {
  const date = new Date(`${iso}T00:00:00Z`)
  return (long ? longDay : day).format(date)
}
