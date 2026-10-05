import { TriangleAlert } from 'lucide-react'
import type { VisualEdit } from '../hooks/use-visual-edit'

/** Hint while edit mode is on, and the last rejected edit. */
export function VisualEditBanner({ edit }: { edit: VisualEdit }) {
  if (edit.error) {
    return (
      <p role="alert" className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
        <TriangleAlert className="size-3.5" />
        Couldn't save that edit: {edit.error}
      </p>
    )
  }
  if (!edit.enabled) return null
  return (
    <p role="status" className="border-b bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
      Click any text in the preview to edit it. <kbd className="font-sans font-medium">Enter</kbd> saves,{' '}
      <kbd className="font-sans font-medium">Esc</kbd> cancels.
    </p>
  )
}
