// The AI at work, as the chat shows it while a request runs (see `ThinkingLine`).

/** The time a request has taken so far, in whole seconds so it ticks steadily: "0s", "59s", "1m 0s", "12m 5s". */
export function elapsedText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  if (whole < 60) return `${whole}s`
  return `${Math.floor(whole / 60)}m ${whole % 60}s`
}
