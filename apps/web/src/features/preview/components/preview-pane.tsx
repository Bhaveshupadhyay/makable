import { Minimize } from 'lucide-react'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { useElementSize } from '@/shared/hooks/use-element-size'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/button'
import type { usePreviewEngine } from '../hooks/use-preview-engine'
import { fitFrame } from '../lib/fit-frame'
import { DEVICES, type Device } from './devices'
import { PreviewError } from './preview-error'
import { PreviewToolbar, type PreviewView } from './preview-toolbar'

type PreviewPaneProps = {
  preview: ReturnType<typeof usePreviewEngine>
  /** Extra controls at the end of the toolbar. */
  actions?: ReactNode
  /** Shown between the toolbar and the frame, e.g. an edit-mode hint. */
  banner?: ReactNode
  /** What the pane shows. The frame stays mounted (and keeps running) in the code view. */
  view?: PreviewView
  onViewChange?: (view: PreviewView) => void
  /** Shown instead of the frame in the code view. Without it, there's no Preview/Code switch. */
  code?: ReactNode
  /**
   * Floats over the frame, e.g. a popover anchored to an element in the page. It's placed in a
   * box the size of the frame as drawn; position it with `absolute inset-0` to cover exactly the
   * frame's viewport (inside its 1px border). The page may be drawn scaled down (see `fitFrame`),
   * so page coordinates times `scale` are overlay coordinates. The overlay itself isn't scaled.
   */
  overlay?: (scale: number) => ReactNode
}

/** The frame's border (`border`, 1px each side). It's on a wrapper outside the zoom, so the page keeps its full
 * width: a border on the zoomed iframe is snapped to a whole screen pixel after zooming and eats into the page. */
const FRAME_BORDER = 1

/** Toolbar plus a device-sized iframe running the project in the browser. */
export function PreviewPane({ preview: { iframeRef, state, refresh }, actions, banner, overlay, view = 'preview', onViewChange, code }: PreviewPaneProps) {
  const [device, setDevice] = useState<Device>('desktop')
  const showCode = view === 'code' && !!code
  const stageRef = useRef<HTMLDivElement>(null)
  const stage = useElementSize(stageRef)
  const { width: deviceWidth, grow } = DEVICES[device]
  // The device width is the page's own (Tablet really is 768px); the border goes around it.
  const room = Math.max(0, (stage?.width ?? 0) - 2 * FRAME_BORDER)
  const { width, scale } = fitFrame(deviceWidth, room, grow)
  const fullscreen = useFullscreen(stageRef)

  return (
    <div className="flex h-full flex-col">
      <PreviewToolbar
        device={device}
        onDeviceChange={setDevice}
        state={state}
        onRefresh={refresh}
        onFullscreen={fullscreen.supported ? fullscreen.enter : undefined}
        actions={actions}
        view={code && onViewChange ? view : undefined}
        onViewChange={onViewChange}
      />
      {!showCode && banner}
      {showCode && <div className="min-h-0 flex-1">{code}</div>}
      <div
        ref={stageRef}
        className={cn('relative flex flex-1 justify-center overflow-hidden bg-muted', fullscreen.active ? 'p-0' : 'p-3', showCode && 'hidden')}
      >
        {/* The page is laid out at `width` and drawn at `scale`; this box is its drawn size plus
            the border. CSS zoom, not a transform: the page then renders at the drawn size (its
            devicePixelRatio drops by `scale`) instead of rendering big and being shrunk, which
            made WebGL sites lag. */}
        <div
          style={{ width: width * scale + 2 * FRAME_BORDER }}
          className="relative h-full overflow-hidden rounded-md border bg-white shadow-sm"
        >
          <iframe
            ref={iframeRef}
            title="Portfolio preview"
            style={{ width, height: `${100 / scale}%`, zoom: scale === 1 ? undefined : scale }}
            className="block"
          />
          {overlay?.(scale)}
        </div>
        {state.status === 'error' && <PreviewError error={state.error} />}
        {fullscreen.active && (
          <Button
            variant="secondary"
            size="sm"
            onClick={fullscreen.exit}
            className="absolute top-3 right-3 opacity-60 shadow-md transition-opacity hover:opacity-100"
          >
            <Minimize />
            Exit full screen
          </Button>
        )}
      </div>
    </div>
  )
}

/** Full screen for the frame's box (the page reloads nothing; it only gets more room). Esc also leaves it. */
function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false)
  useEffect(() => {
    const onChange = () => setActive(!!ref.current && document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [ref])
  return {
    active,
    supported: typeof document !== 'undefined' && document.fullscreenEnabled,
    enter: () => void ref.current?.requestFullscreen().catch(() => {}),
    exit: () => void document.exitFullscreen().catch(() => {}),
  }
}
