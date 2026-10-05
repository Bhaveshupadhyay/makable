import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Label } from './label'

type FieldProps = {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}

/** Label, control, then a hint or validation error underneath. */
export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
