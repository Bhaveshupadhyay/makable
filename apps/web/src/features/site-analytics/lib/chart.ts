/** Round y-axis ticks from 0 to at least `max`: 0 / 5 / 10 / 15, 0 / 2K / 4K... (`count` steps, about). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude
  const wholeStep = Math.max(1, step)
  const top = Math.ceil(max / wholeStep) * wholeStep
  const ticks = []
  for (let v = 0; v <= top + wholeStep / 2; v += wholeStep) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

/** Which of `n` points get an x-axis label: about `max` of them, evenly spaced, always the first and the last. */
export function labelIndexes(n: number, max = 6): number[] {
  if (n <= 0) return []
  if (n <= max) return Array.from({ length: n }, (_, i) => i)
  const step = Math.ceil((n - 1) / (max - 1))
  const picked = []
  for (let i = 0; i < n - 1; i += step) picked.push(i)
  // The last label replaces one that would sit too close to it.
  if (n - 1 - picked[picked.length - 1]! <= step / 2) picked.pop()
  picked.push(n - 1)
  return picked
}

/** The point of `n` nearest to `x`, for a plot `width` wide whose points are spread evenly from 0 to `width`. */
export function nearestIndex(x: number, width: number, n: number): number {
  if (n <= 1 || width <= 0) return 0
  return Math.min(n - 1, Math.max(0, Math.round((x / width) * (n - 1))))
}
