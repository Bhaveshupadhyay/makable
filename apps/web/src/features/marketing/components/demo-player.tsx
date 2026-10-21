import { Play, RotateCcw, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { analytics } from '@/shared/lib/analytics'
import { Button } from '@/shared/ui/button'
import { DEMO_POSTER_URL, DEMO_VIDEO_URL, type DemoPlacement, playedSeconds, progressReached } from '../lib/demo'

type DemoPlayerProps = {
  placement: DemoPlacement
  /** Plays as soon as it shows (the dialog). Otherwise it waits for a click and loads nothing before (it's ~33 MB). */
  autoPlay?: boolean
  /** How much of the video has played, in seconds, as it plays. */
  onWatched?: (seconds: number) => void
  onEnded?: () => void
}

/**
 * The product demo's video: with sound where the browser allows it, else muted with a button to turn it on. A video
 * that can't load (the network, the host) says so and can be tried again. Reports its first play and each quarter
 * seen, so the dialog and the landing page are measured the same way.
 */
export function DemoPlayer({ placement, autoPlay = false, onWatched, onEnded }: DemoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(false)
  const [paused, setPaused] = useState(true)
  const [failed, setFailed] = useState(false)
  // Until it first plays, a player that waits for a click covers its poster with a big play button: browsers' own
  // controls only put a small one in a corner, which makes the poster look like a still picture.
  const [started, setStarted] = useState(autoPlay)
  // Sent once per player, also across Try again (which starts the video's played ranges over).
  const tracked = useRef({ played: false, progress: new Set<number>() })

  useEffect(() => {
    if (autoPlay && ref.current) autoplay(ref.current)
  }, [autoPlay])

  function turnOnSound() {
    const video = ref.current
    if (!video) return
    video.muted = false
    // A click lets it play with sound, also when it couldn't start by itself.
    video.play().catch(() => {})
  }

  function start() {
    const video = ref.current
    if (!video) return
    setStarted(true)
    autoplay(video)
  }

  function tryAgain() {
    const video = ref.current
    if (!video) return
    setFailed(false)
    video.load()
    autoplay(video)
  }

  function onPlaying(video: HTMLVideoElement) {
    if (tracked.current.played) return
    tracked.current.played = true
    analytics.track('demo_video_played', { placement, muted: video.muted })
  }

  function onTimeUpdate(video: HTMLVideoElement) {
    const seconds = playedSeconds(video.played)
    onWatched?.(seconds)
    for (const percent of progressReached(seconds, video.duration)) {
      if (tracked.current.progress.has(percent)) continue
      tracked.current.progress.add(percent)
      analytics.track('demo_video_progress', { placement, percent })
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video
        ref={ref}
        src={DEMO_VIDEO_URL}
        poster={DEMO_POSTER_URL}
        controls
        playsInline
        preload={autoPlay ? 'auto' : 'none'}
        className="aspect-video w-full"
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        onPlay={() => {
          setPaused(false)
          setStarted(true)
        }}
        onPause={() => setPaused(true)}
        onPlaying={(e) => onPlaying(e.currentTarget)}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget)}
        onEnded={onEnded}
        onError={(e) => {
          const error = e.currentTarget.error
          analytics.track('demo_video_failed', { placement, code: error?.code ?? null, message: error?.message ?? '' })
          setFailed(true)
        }}
      />
      {!started && !failed && (
        <button
          type="button"
          onClick={start}
          className="group absolute inset-0 flex items-center justify-center bg-black/15 transition-colors outline-none hover:bg-black/25 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          {/* White in both themes: it sits on the video, which looks the same in both. */}
          <span className="flex items-center gap-2.5 rounded-full bg-white/95 py-3 pr-5 pl-4 text-sm font-medium text-neutral-900 shadow-lg transition-transform group-hover:scale-105">
            <Play className="size-4 fill-current" />
            Watch the demo · 1 min
          </span>
        </button>
      )}
      {muted && !failed && (
        <Button size="sm" variant="secondary" className="absolute top-3 left-3 shadow-md" onClick={turnOnSound}>
          <Volume2 />
          {paused ? 'Play with sound' : 'Turn on sound'}
        </Button>
      )}
      {failed && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center text-sm text-white">
          <p>The demo couldn’t load. Check your connection and try again.</p>
          <Button size="sm" variant="secondary" onClick={tryAgain}>
            <RotateCcw />
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}

/** Plays with sound where the browser allows it, else muted. Refused even muted (iOS in low-power mode), it waits for a click. */
function autoplay(video: HTMLVideoElement) {
  video.play().catch((error: unknown) => {
    // Browsers only play sound by themselves once the visitor has interacted with the site. Other refusals (the
    // video can't load) come with the element's `error` event.
    if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') return
    video.muted = true
    video.play().catch(() => {})
  })
}
