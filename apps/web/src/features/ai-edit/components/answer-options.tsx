import { Button } from '@/shared/ui/button'

// An option that's a colour (`#1e40af`, `rgb(...)`, `hsl(...)`) gets a swatch.
const COLOUR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch)\([^)]*\))$/i

/** The choices of a question the AI asked, and Skip (ends the run without a change). */
type AnswerOptionsProps = {
  options: string[]
  onPick: (option: string) => void
  onSkip?: () => void
  /** What Skip says (e.g. Cancel, where skipping ends more than the question). */
  skipLabel?: string
  disabled?: boolean
}

export function AnswerOptions({ options, onPick, onSkip, skipLabel = 'Skip', disabled }: AnswerOptionsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <Button key={option} type="button" variant="outline" size="sm" className="rounded-full" disabled={disabled} onClick={() => onPick(option)}>
          {COLOUR.test(option.trim()) && <span aria-hidden className="size-3.5 rounded-full border" style={{ background: option.trim() }} />}
          {option}
        </Button>
      ))}
      {onSkip && (
        <Button type="button" variant="ghost" size="sm" className="rounded-full text-muted-foreground" disabled={disabled} onClick={onSkip}>
          {skipLabel}
        </Button>
      )}
    </div>
  )
}
