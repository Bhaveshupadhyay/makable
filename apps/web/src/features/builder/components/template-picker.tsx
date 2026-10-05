import type { TemplateId } from '@makable/shared'
import { Check, ChevronDown, ChevronUp, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useTemplateCatalog } from '@/features/templates'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'

type TemplatePickerProps = {
  selected: TemplateId | undefined
  onSelect: (template: TemplateId) => void
  disabled?: boolean
}

// The chat shows a short list; the rest are one click away.
const SHORTLIST_SIZE = 6

/** Template cards from the published catalog, shown inline in the chat. */
export function TemplatePicker({ selected, onSelect, disabled }: TemplatePickerProps) {
  const { data, isPending, isError, refetch, isFetching } = useTemplateCatalog()
  const [showAll, setShowAll] = useState(false)

  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
        Loading templates…
      </p>
    )
  }
  if (isError || !data.templates.length) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <span className="flex-1">{isError ? "Couldn't load the templates." : 'No templates are published yet.'}</span>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          Try again
        </Button>
      </div>
    )
  }

  const { templates } = data
  const collapsible = templates.length > SHORTLIST_SIZE
  const visible =
    showAll || !collapsible
      ? templates
      : // Keep the current template visible even if it's past the short list.
        templates.filter((t, i) => i < SHORTLIST_SIZE || t.id === selected)

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Templates" className="grid grid-cols-2 gap-2">
        {visible.map((template) => {
          const isSelected = selected === template.id
          return (
            <button
              key={template.id}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${template.name} template`}
              disabled={disabled}
              onClick={() => onSelect(template.id)}
              className={cn(
                'group flex flex-col gap-1.5 rounded-lg border bg-background p-1.5 text-left transition-colors hover:border-primary/50 disabled:pointer-events-none disabled:opacity-60',
                isSelected && 'border-primary ring-1 ring-primary',
              )}
            >
              <img
                src={template.thumbnailUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="aspect-video w-full rounded-md border bg-muted object-cover object-top"
              />
              <span className="flex items-center justify-between gap-1 px-1">
                <span className="text-xs font-medium">{template.name}</span>
                {isSelected ? (
                  <Check className="size-3.5" />
                ) : (
                  <span className="text-[10px] text-muted-foreground uppercase">{template.kind === 'react' ? 'React' : 'HTML'}</span>
                )}
              </span>
              <span className="line-clamp-2 px-1 pb-0.5 text-[11px] leading-snug text-muted-foreground">{template.description}</span>
            </button>
          )
        })}
      </div>
      {collapsible && (
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
          {showAll ? <ChevronUp /> : <ChevronDown />}
          {showAll ? 'Show fewer' : `Show all ${templates.length} templates`}
        </Button>
      )}
    </div>
  )
}
