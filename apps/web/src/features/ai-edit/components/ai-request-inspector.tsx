import type { AiEditRequest } from '@makable/shared'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/shared/ui/button'
import type { AiEditResponse } from '../api/ai-edit'

type AiRequestInspectorProps = { request: AiEditRequest; response: AiEditResponse; onClose: () => void }

/**
 * Shows what the last AI edit sent (the request body) and, from the dev endpoint, the context the
 * server built from it for the model. The system prompt never leaves the server.
 */
export function AiRequestInspector({ request, response, onClose }: AiRequestInspectorProps) {
  return (
    <section aria-label="AI request" className="max-h-[45svh] overflow-y-auto rounded-lg border bg-muted/40 text-xs">
      <header className="sticky top-0 flex items-center justify-between gap-2 border-b bg-muted px-3 py-1.5">
        <span className="font-medium">
          Sent to <code>POST /api/ai/edit</code> · {request.files.length} files as context
        </span>
        <Button variant="ghost" size="icon" aria-label="Close" className="size-6" onClick={onClose}>
          <X />
        </Button>
      </header>
      {response.note && <p className="border-b px-3 py-1.5 text-muted-foreground">{response.note}</p>}
      {response.debug && (
        <Block title="Context the server gives the model (dev only)" open>
          {response.debug.modelInput}
        </Block>
      )}
      <Block title="Files picked as context">
        {request.files.map((f) => `${f.path}  (${f.reason})`).join('\n')}
      </Block>
      <Block title="Request body sent by the browser (JSON)" open={!response.debug}>
        {JSON.stringify(request, null, 2)}
      </Block>
    </section>
  )
}

function Block({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="border-b last:border-b-0">
      <summary className="cursor-pointer px-3 py-1.5 font-medium select-none">{title}</summary>
      <pre className="overflow-x-auto px-3 pb-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{children}</pre>
    </details>
  )
}
