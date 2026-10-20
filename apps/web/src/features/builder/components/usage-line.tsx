import type { AiUsage } from '@makable/shared'
import { ChevronRight } from 'lucide-react'
import { Fragment, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { usageDetails, usageSummary } from '../lib/usage-text'

/** What an AI request took (time, tokens), under its reply: one line, a click shows the details. */
export function UsageLine({ usage }: { usage: AiUsage }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-xs text-muted-foreground">
      <button
        type="button"
        aria-expanded={open}
        title="What this request took"
        onClick={() => setOpen((o) => !o)}
        className="-ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 tabular-nums outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        {usageSummary(usage)}
      </button>
      {open && (
        <dl className="mt-1.5 ml-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-l pl-3">
          {usageDetails(usage).map(({ label, value }) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd className="tabular-nums text-foreground/80">{value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  )
}
