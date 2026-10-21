import { Volume2, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import { analytics } from '@/shared/lib/analytics'
import { Button } from '@/shared/ui/button'
import { DEMO_VIDEO_URL, demoSource } from '../lib/demo'

/**
 * The product demo, played over the page when the visit's link asks for it (`?utm_source=res`, the resume's link).
 * Building needs a GitHub sign-in, which is a lot to ask of someone who only wants to see what makable does.
 */
export function DemoVideo() {
  // Read once: the parameter stays in the address for analytics, and coming back to it mustn't open the demo again.
  const [source] = useState(() => demoSource(window.location.search))
  const [open, setOpen] = useState(source !== null)
  const watched = useRef({ seconds: 0, ended: false })

  useEffect(() => {
    if (source) analytics.track('demo_video_shown', { source })
  }, [source])

  function onOpenChange(next: boolean) {
    if (!next) analytics.track('demo_video_closed', { watched_seconds: Math.round(watched.current.seconds), ended: watched.current.ended })
    setOpen(next)
  }

  if (!source) return null
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        {/* As wide as fits both ways: the video is 16:9, and the title and padding need about 11rem of the height. */}
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(calc(100vw_-_2rem),calc((100svh_-_11rem)*16/9),64rem)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl border bg-background p-4 shadow-lg sm:p-5">
          <div className="space-y-1 pr-10">
            <Dialog.Title className="text-lg font-semibold tracking-tight">See makable in action</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              A one-minute tour: a site built from a prompt, changed with AI and published.
            </Dialog.Description>
          </div>
          <DemoPlayer
            onTime={(seconds) => {
              watched.current.seconds = Math.max(watched.current.seconds, seconds)
            }}
            onEnded={() => {
              watched.current.ended = true
            }}
          />
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" aria-label="Close" className="absolute top-3 right-3 size-8">
              <X />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type DemoPlayerProps = {
  /** The playback position, in seconds, as it plays. */
  onTime: (seconds: number) => void
  onEnded: () => void
}

/** Plays as soon as it opens: with sound where the browser allows it, else muted with a button to turn it on. */
function DemoPlayer({ onTime, onEnded }: DemoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.play().catch((error: unknown) => {
      // Browsers only play sound by themselves once the visitor has interacted with the site.
      if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') return
      video.muted = true
      // Refused even muted (iOS in low-power mode, for one): the controls' play button is still there.
      video.play().catch(() => {})
    })
  }, [])

  function turnOnSound() {
    const video = ref.current
    if (!video) return
    video.muted = false
    // A click lets it play with sound, also when it couldn't start by itself.
    video.play().catch(() => {})
  }

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video
        ref={ref}
        src={DEMO_VIDEO_URL}
        controls
        playsInline
        preload="auto"
        className="aspect-video w-full"
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
        onEnded={onEnded}
      />
      {muted && (
        <Button size="sm" variant="secondary" className="absolute top-3 left-3 shadow-md" onClick={turnOnSound}>
          <Volume2 />
          Turn on sound
        </Button>
      )}
    </div>
  )
}
