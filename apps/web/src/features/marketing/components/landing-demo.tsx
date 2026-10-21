import { useEffect, useRef } from 'react'
import { analytics } from '@/shared/lib/analytics'
import { useInView } from '../hooks/use-in-view'
import { DemoPlayer } from './demo-player'

/** The product demo on the landing page, under how it works. It plays on a click; seeing it is counted once. */
export function LandingDemo() {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, 0.5)

  useEffect(() => {
    if (inView) analytics.track('demo_video_shown', { placement: 'landing', source: null })
  }, [inView])

  return (
    <figure ref={ref} data-analytics-section="demo_landing" className="mx-auto mt-14 max-w-4xl">
      <div className="rounded-2xl border bg-background p-2 shadow-xs sm:p-3">
        <DemoPlayer placement="landing" />
      </div>
      <figcaption className="mt-4 text-center text-sm text-muted-foreground">
        A one-minute tour: a site built from a prompt, changed with AI and published.
      </figcaption>
    </figure>
  )
}
