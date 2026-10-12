import { Check, ChevronDown, Settings2 } from 'lucide-react'
import { Link } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { useModelChoice } from '../hooks/use-model-choice'
import { optionLabel, providerName } from '../lib/labels'
import { groupOptions } from '../lib/model-options'

/**
 * Picks the model for AI edits: makable's own, or one the user turned on for their own key in Settings. The pick
 * is remembered per account.
 */
export function ModelPicker({ disabled }: { disabled?: boolean }) {
  const { options, selected, select } = useModelChoice()
  const groups = groupOptions(options)
  const ownModels = options.some((o) => o.keyId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`AI model: ${optionLabel(selected)}`}
        className="flex max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-muted"
      >
        <span className="truncate">{optionLabel(selected)}</span>
        <ChevronDown className="size-3 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64">
        {groups.map((group, i) => (
          <DropdownMenuGroup key={group.keyId ?? 'default'}>
            {i > 0 && <DropdownMenuSeparator />}
            {group.keyId && <DropdownMenuLabel className="text-xs text-muted-foreground">{providerName(group.provider)}</DropdownMenuLabel>}
            {group.options.map((option) => {
              const active = (selected?.keyId ?? null) === option.keyId && (!option.keyId || selected?.model === option.model)
              return (
                <DropdownMenuItem key={`${option.keyId}:${option.model}`} onSelect={() => select(option.keyId ? option : null)}>
                  <Check className={active ? 'opacity-100' : 'opacity-0'} />
                  <span className="truncate">{optionLabel(option)}</span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings2 />
            {ownModels ? 'Manage models' : 'Use your own API key'}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
