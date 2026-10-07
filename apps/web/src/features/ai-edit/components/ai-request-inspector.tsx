import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/shared/ui/button'
import type { AiLast } from '../hooks/use-ai-edit'
import { describeOp } from '../lib/build-content-request'

type AiRequestInspectorProps = AiLast & { onClose: () => void }

/**
 * Shows the last AI edit: what the model answered and what happened to it, the request the
 * browser sent and, from the dev endpoint, the context the server built for the model. The
 * system prompt never leaves the server.
 */
export function AiRequestInspector({ request, response, outcome, onClose }: AiRequestInspectorProps) {
  return (
    <section aria-label="AI request" className="max-h-[45svh] overflow-y-auto rounded-lg border bg-muted/40 text-xs">
      <header className="sticky top-0 flex items-center justify-between gap-2 border-b bg-muted px-3 py-1.5">
        <span className="font-medium">
          <code>POST /api/ai/content</code> · {outcome.applied ? 'applied' : `not applied (${outcome.reason})`}
          {response.debug && ` · ${response.debug.model}, ${response.debug.attempts} ${response.debug.attempts === 1 ? 'try' : 'tries'}`}
        </span>
        <Button variant="ghost" size="icon" aria-label="Close" className="size-6" onClick={onClose}>
          <X />
        </Button>
      </header>
      <p className="border-b px-3 py-1.5 text-muted-foreground">{response.summary}</p>
      <Block title={`Ops from the model (${response.ops.length})`} open>
        {response.ops.map(describeOp).join('\n') || 'none'}
      </Block>
      {response.debug && <Block title="Context the server gave the model (dev only)">{response.debug.modelInput}</Block>}
      <Block title="Request body sent by the browser (JSON)">{JSON.stringify(request, null, 2)}</Block>
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
