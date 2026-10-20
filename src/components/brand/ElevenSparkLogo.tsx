import { useId } from 'react'

const SHIELD_PATH = 'M32 3 L60 13 V35 C60 53 48 65.5 32 70 C16 65.5 4 53 4 35 V13 Z'

export interface ElevenSparkLogoProps {
  className?: string
}

export function ElevenSparkLogo({ className }: ElevenSparkLogoProps) {
  const rawId = useId()
  const prefix = `es${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <svg
      viewBox="0 0 64 72"
      className={className}
      role="img"
      aria-label="ElevenSpark 11+ shield logo"
    >
      <defs>
        <linearGradient id={`${prefix}-shield`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#312e81" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
        <linearGradient id={`${prefix}-spark`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <path d={SHIELD_PATH} fill={`url(#${prefix}-shield)`} />
      <path
        d={SHIELD_PATH}
        fill="none"
        stroke="#4338ca"
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <rect x="16" y="24" width="5" height="20" rx="2" fill="#ffffff" />
      <rect x="12.5" y="24" width="7" height="4" rx="1.5" fill="#ffffff" />
      <rect x="24" y="24" width="5" height="20" rx="2" fill="#ffffff" />
      <rect x="20.5" y="24" width="7" height="4" rx="1.5" fill="#ffffff" />
      <rect x="32.5" y="25.5" width="12" height="4.5" rx="1.8" fill="#ffffff" />
      <rect x="36.25" y="22" width="4.5" height="11.5" rx="1.8" fill="#ffffff" />
      <path
        d="M44 40 L34.5 54 H40.5 L33 66 L52 48.5 H45 L53.5 40 Z"
        fill={`url(#${prefix}-spark)`}
        stroke="#b45309"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="28" r="2.2" fill="#fcd34d" />
      <circle cx="12" cy="46" r="1.5" fill="#fde68a" />
    </svg>
  )
}
