import { TriangleAlert } from 'lucide-react'
import type { PreviewError as PreviewErrorType } from '../engine/types'

export function PreviewError({ error }: { error: PreviewErrorType }) {
  return (
    <div role="alert" className="absolute inset-x-3 bottom-3 max-h-1/2 overflow-auto rounded-lg border border-destructive/40 bg-background p-4 shadow-lg">
      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
        <TriangleAlert className="size-4" />
        {error.title}
      </p>
      {error.path && (
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {error.path}
          {error.line ? `:${error.line}` : ''}
        </p>
      )}
      <pre className="mt-2 text-xs whitespace-pre-wrap">{error.message}</pre>
    </div>
  )
}
