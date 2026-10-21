import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import { analytics } from '@/shared/lib/analytics'
import { Button } from '@/shared/ui/button'
import { demoSource } from '../lib/demo'
import { DemoPlayer } from './demo-player'

/**
 * The product demo, played over the page when the visit's link asks for it (`?utm_source=res` or `resume`, the
 * resume's links). Building needs a GitHub sign-in, which is a lot to ask of someone who only wants to see what
 * makable does.
 */
export function DemoVideo() {
  // Read once: the parameter stays in the address for analytics, and coming back to it mustn't open the demo again.
  const [source] = useState(() => demoSource(window.location.search))
  const [open, setOpen] = useState(source !== null)
  const watched = useRef({ seconds: 0, ended: false })

  useEffect(() => {
    if (source) analytics.track('demo_video_shown', { placement: 'dialog', source })
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
        <Dialog.Content
          data-analytics-section="demo_dialog"
          className="fixed top-1/2 left-1/2 z-50 w-[min(calc(100vw_-_2rem),calc((100svh_-_11rem)*16/9),64rem)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl border bg-background p-4 shadow-lg sm:p-5"
        >
          <div className="space-y-1 pr-10">
            <Dialog.Title className="text-lg font-semibold tracking-tight">See makable in action</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              A one-minute tour: a site built from a prompt, changed with AI and published.
            </Dialog.Description>
          </div>
          <DemoPlayer
            placement="dialog"
            autoPlay
            onWatched={(seconds) => {
              watched.current.seconds = seconds
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
