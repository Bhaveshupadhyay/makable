import { Check, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/shared/lib/cn'

/** What the AI did before a message (a creation's progress: planning, the files it wrote...), collapsed: a click shows each step. */
export function Steps({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-[13px] text-muted-foreground">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="-ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        {steps.length === 1 ? '1 step' : `${steps.length} steps`}
      </button>
      {open && (
        <ol className="mt-1.5 ml-1.5 space-y-1 border-l pl-3">
          {steps.map((step, i) => (
            <li key={`${i}-${step}`} className="flex items-center gap-2">
              <Check className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
