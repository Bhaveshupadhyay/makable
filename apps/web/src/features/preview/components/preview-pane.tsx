import { type ReactNode, useState } from 'react'
import type { usePreviewEngine } from '../hooks/use-preview-engine'
import { DEVICES, type Device } from './devices'
import { PreviewError } from './preview-error'
import { PreviewToolbar } from './preview-toolbar'

type PreviewPaneProps = {
  preview: ReturnType<typeof usePreviewEngine>
  /** Extra controls at the end of the toolbar. */
  actions?: ReactNode
  /** Shown between the toolbar and the frame, e.g. an edit-mode hint. */
  banner?: ReactNode
  /** Shown under the frame, e.g. the AI request inspector. */
  footer?: ReactNode
  /**
   * Floats over the frame, e.g. a popover anchored to an element in the page. It's placed in a
   * box the size of the frame; position it with `absolute inset-px` to cover exactly the frame's
   * viewport (inside its 1px border), so the page's own coordinates apply unchanged.
   */
  overlay?: ReactNode
}

/** Toolbar plus a device-sized iframe running the project in the browser. */
export function PreviewPane({ preview: { iframeRef, state, refresh }, actions, banner, footer, overlay }: PreviewPaneProps) {
  const [device, setDevice] = useState<Device>('desktop')

  return (
    <div className="flex h-full flex-col">
      <PreviewToolbar device={device} onDeviceChange={setDevice} state={state} onRefresh={refresh} actions={actions} />
      {banner}
      <div className="relative flex flex-1 justify-center overflow-hidden bg-muted p-3">
        <div style={{ width: DEVICES[device].width }} className="relative h-full max-w-full transition-[width] duration-300">
          <iframe
            ref={iframeRef}
            title="Portfolio preview"
            className="h-full w-full rounded-md border bg-white shadow-sm"
          />
          {overlay}
        </div>
        {state.status === 'error' && <PreviewError error={state.error} />}
      </div>
      {footer}
    </div>
  )
}
