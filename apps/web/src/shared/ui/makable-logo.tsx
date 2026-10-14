import type { ComponentProps } from 'react'

export interface MakableIconProps extends ComponentProps<'svg'> {
  /** Optional glow effect */
  glow?: boolean
}

/**
 * Makable's signature Origami Ribbon 'M' icon mark.
 * Scalable vector with radiant coral-to-amber gradients.
 */
export function MakableIcon({ glow = false, className = 'size-6', ...props }: MakableIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="mk-react-g1" x1="0%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#FF2E63" />
          <stop offset="60%" stopColor="#FF3366" />
          <stop offset="100%" stopColor="#FF5376" />
        </linearGradient>
        <linearGradient id="mk-react-g2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF3366" />
          <stop offset="50%" stopColor="#E11D48" />
          <stop offset="100%" stopColor="#BE185D" />
        </linearGradient>
        <linearGradient id="mk-react-g3" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#E11D48" />
          <stop offset="45%" stopColor="#FF5E3A" />
          <stop offset="100%" stopColor="#FF9500" />
        </linearGradient>
        <linearGradient id="mk-react-g4" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFA000" />
          <stop offset="50%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        {glow && (
          <filter id="mk-react-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#FF3366" floodOpacity="0.45" />
          </filter>
        )}
      </defs>

      <g filter={glow ? 'url(#mk-react-glow)' : undefined}>
        {/* Left pillar and outer shoulder */}
        <path
          d="M18 78V35C18 21.2 28.5 12 41 12C46.8 12 52 14.8 55.5 19.5L46.8 29.5C45.2 27.2 43.2 26 41 26C35.5 26 31 30.5 31 36.5V78H18Z"
          fill="url(#mk-react-g1)"
        />
        {/* Left inner fold curving inward */}
        <path
          d="M41 12C48 12 54 16 56.5 22.5L43.5 54C40 62.5 32.5 67 24 67H18V54H24C28 54 31.5 51.5 33.5 47L41 29L41 12Z"
          fill="url(#mk-react-g2)"
          opacity="0.95"
        />
        {/* Dynamic center fold & rising ribbon */}
        <path
          d="M36 67C44 67 51 62 54.5 54L66 27.5C68.5 21.5 74 18 80.5 18C89.5 18 96.5 25 96.5 34V78H84V35C84 31 81 28 77 28C73.8 28 70.8 30 69.2 33.2L57 60C52.5 70 42.5 76 31 76H18V67H36Z"
          fill="url(#mk-react-g3)"
        />
        {/* Right shoulder & trailing facet */}
        <path
          d="M68 33.5C70.8 29.5 75.5 27 80.5 27C89 27 96 34 96 42.5V78H84V44C84 38.5 80.5 35 76 35C72.8 35 70 37 68.5 39.8L59 61.5L50 61.5L68 33.5Z"
          fill="url(#mk-react-g4)"
        />
      </g>
    </svg>
  )
}

export interface MakableLogoProps extends ComponentProps<'div'> {
  iconClassName?: string
  textClassName?: string
  glow?: boolean
}

/**
 * Makable horizontal lockup (Icon + lowercase geometric wordmark).
 */
export function MakableLogo({
  iconClassName = 'size-6',
  textClassName = 'text-base font-bold tracking-tight',
  glow = false,
  className = 'flex items-center gap-2',
  ...props
}: MakableLogoProps) {
  return (
    <div className={className} {...props}>
      <MakableIcon glow={glow} className={iconClassName} />
      <span className={textClassName}>makable</span>
    </div>
  )
}
