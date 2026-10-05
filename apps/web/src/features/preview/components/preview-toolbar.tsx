import { LoaderCircle, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import type { PreviewState } from '../engine/types'
import { DEVICES, type Device } from './devices'

type PreviewToolbarProps = {
  device: Device
  onDeviceChange: (device: Device) => void
  state: PreviewState
  onRefresh: () => void
  actions?: ReactNode
}

const STATUS_LABEL: Record<PreviewState['status'], string> = {
  loading: 'Building preview…',
  ready: 'Live preview',
  error: 'Preview error',
}

export function PreviewToolbar({ device, onDeviceChange, state, onRefresh, actions }: PreviewToolbarProps) {
  return (
    <div className="flex h-12 items-center justify-between gap-2 border-b px-3">
      <div role="radiogroup" aria-label="Device" className="flex items-center rounded-md border p-0.5">
        {(Object.keys(DEVICES) as Device[]).map((key) => {
          const { label, icon: Icon } = DEVICES[key]
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={device === key}
              aria-label={label}
              title={label}
              onClick={() => onDeviceChange(key)}
              className={cn(
                'rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground',
                device === key && 'bg-accent text-foreground',
              )}
            >
              <Icon className="size-4" />
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-1">
        <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          {state.status === 'loading' ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : (
            <span className={cn('size-2 rounded-full', state.status === 'ready' ? 'bg-green-500' : 'bg-destructive')} />
          )}
          {STATUS_LABEL[state.status]}
        </span>
        <Button variant="ghost" size="icon" aria-label="Refresh preview" onClick={onRefresh}>
          <RotateCw />
        </Button>
        {actions && <div className="ml-1 flex items-center gap-1 border-l pl-2">{actions}</div>}
      </div>
    </div>
  )
}
