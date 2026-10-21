import { Sparkles } from 'lucide-react'
import { cardClass } from './ui'

interface MotivationalCardProps {
  variant?: 'desktop' | 'compact'
  className?: string
}

const HEADLINE = 'Practice a bit every day'
const TAGLINE = 'Small steps, big wins'

export function MotivationalCard({ variant = 'desktop', className = '' }: MotivationalCardProps) {
  if (variant === 'compact') {
    return (
      <p
        className={`flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold leading-snug text-amber-900 ${className}`}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <span>
          {HEADLINE} — {TAGLINE}
        </span>
      </p>
    )
  }

  return (
    <div className={`${cardClass} border-2 border-amber-200 bg-amber-50 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-lg" aria-hidden="true">
          <Sparkles className="h-5 w-5 text-amber-600" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-amber-950">{HEADLINE}</p>
          <p className="text-sm font-bold text-amber-800">{TAGLINE}</p>
        </div>
      </div>
    </div>
  )
}
