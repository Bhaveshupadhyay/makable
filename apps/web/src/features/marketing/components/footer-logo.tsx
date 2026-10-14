import { type PointerEvent, useRef, useState } from 'react'
import { useMediaQuery } from '@/shared/hooks/use-media-query'
import { MakableIcon } from '@/shared/ui/makable-logo'
import { useInView } from '../hooks/use-in-view'

/**
 * The footer's big animated logo. When it scrolls into view the mark's ribbons fold up one
 * after another and the wordmark's outline draws itself; then a gradient light sweeps across
 * it, and follows the pointer while hovered. The keyframes live in `index.css` (`.mk-footer-logo`).
 */
export function FooterLogo() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, 0.3)
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [hover, setHover] = useState(false)

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mk-x', `${((e.clientX - box.left) / box.width) * 100}%`)
    e.currentTarget.style.setProperty('--mk-y', `${((e.clientY - box.top) / box.height) * 100}%`)
  }

  return (
    <div
      ref={ref}
      className="mk-footer-logo relative select-none"
      data-in-view={inView || undefined}
      data-hover={hover || undefined}
      aria-hidden="true"
    >
      <div className="flex justify-center">
        <MakableIcon className="mk-fold size-16 sm:size-20" glow />
      </div>
      {/* The word bleeds off the bottom edge of the footer. */}
      <div
        className="-mb-[6%] mt-4 overflow-hidden"
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onPointerMove={onPointerMove}
      >
        <div className="relative">
          <Wordmark className="mk-wordmark-stroke" />
          <Wordmark className="mk-wordmark-fill absolute inset-0" gradient animate={!reduceMotion} />
        </div>
      </div>
    </div>
  )
}

function Wordmark({ className, gradient, animate }: { className: string; gradient?: boolean; animate?: boolean }) {
  return (
    <svg viewBox="0 0 1000 250" className={`block w-full ${className}`}>
      {gradient && (
        <defs>
          <linearGradient id="mk-footer-sheen" x1="0" y1="0" x2="1" y2="0" spreadMethod="reflect">
            <stop offset="0%" stopColor="#FF2E63" />
            <stop offset="35%" stopColor="#FF5E3A" />
            <stop offset="65%" stopColor="#FF9500" />
            <stop offset="100%" stopColor="#8B5CF6" />
            {animate && (
              <animateTransform attributeName="gradientTransform" type="translate" values="0 0;1 0;0 0" dur="10s" repeatCount="indefinite" />
            )}
          </linearGradient>
        </defs>
      )}
      <text
        x="500"
        y="222"
        textAnchor="middle"
        textLength="980"
        lengthAdjust="spacingAndGlyphs"
        fontSize="268"
        fontWeight="800"
        fill={gradient ? 'url(#mk-footer-sheen)' : undefined}
      >
        makable
      </text>
    </svg>
  )
}
