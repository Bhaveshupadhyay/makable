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
}

/** Toolbar plus a device-sized iframe running the project in the browser. */
export function PreviewPane({ preview: { iframeRef, state, refresh }, actions, banner }: PreviewPaneProps) {
  const [device, setDevice] = useState<Device>('desktop')

  return (
    <div className="flex h-full flex-col">
      <PreviewToolbar device={device} onDeviceChange={setDevice} state={state} onRefresh={refresh} actions={actions} />
      {banner}
      <div className="relative flex flex-1 justify-center overflow-hidden bg-muted p-3">
        <iframe
          ref={iframeRef}
          title="Portfolio preview"
          style={{ width: DEVICES[device].width }}
          className="h-full max-w-full rounded-md border bg-white shadow-sm transition-[width] duration-300"
        />
        {state.status === 'error' && <PreviewError error={state.error} />}
      </div>
    </div>
  )
}
