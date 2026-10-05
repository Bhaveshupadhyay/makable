import { templateCatalog, templateIds, type TemplateId } from '@makable/shared'
import { Check } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { TemplateThumbnail } from './template-thumbnail'

type TemplatePickerProps = {
  selected: TemplateId | undefined
  onSelect: (template: TemplateId) => void
  disabled?: boolean
}

/** Template cards shown inline in the chat. */
export function TemplatePicker({ selected, onSelect, disabled }: TemplatePickerProps) {
  return (
    <div role="group" aria-label="Templates" className="grid grid-cols-2 gap-2">
      {templateIds.map((id) => {
        const template = templateCatalog[id]
        const isSelected = selected === id
        return (
          <button
            key={id}
            type="button"
            aria-pressed={isSelected}
            aria-label={`${template.name} template`}
            disabled={disabled}
            onClick={() => onSelect(id)}
            className={cn(
              'group flex flex-col gap-1.5 rounded-lg border bg-background p-1.5 text-left transition-colors hover:border-primary/50 disabled:pointer-events-none disabled:opacity-60',
              isSelected && 'border-primary ring-1 ring-primary',
            )}
          >
            <TemplateThumbnail thumbnail={template.thumbnail} />
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
  )
}
