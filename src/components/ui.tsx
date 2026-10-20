import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Difficulty, Subject } from '../db/schemas'
import { SUBJECT_META } from '../lib/theme'

export const cardClass = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6'

export const btnPrimaryClass =
  'inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-base font-extrabold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40'

export const btnSecondaryClass =
  'inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-6 py-3 text-base font-extrabold text-slate-700 transition hover:border-slate-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40'

export function ScreenHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-black text-slate-900 md:text-3xl">{title}</h1>
      <p className="mt-1 text-base font-semibold text-slate-600 md:text-lg">{subtitle}</p>
    </header>
  )
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accentClass = 'bg-indigo-100 text-indigo-700',
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  accentClass?: string
}) {
  return (
    <div className={cardClass}>
      <div className={`mb-3 grid h-11 w-11 place-items-center rounded-2xl ${accentClass}`}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-sm font-bold text-slate-600">{label}</p>
      {hint ? <p className="mt-1 text-xs font-semibold text-slate-400">{hint}</p> : null}
    </div>
  )
}

export function SubjectBadge({ subject }: { subject: Subject }) {
  const meta = SUBJECT_META[subject]
  const Icon = meta.icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold ${meta.badgeClass}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  )
}

export function DifficultyStars({ level }: { level: Difficulty }) {
  return (
    <span className="text-sm font-bold text-amber-500" aria-label={`Difficulty ${level} of 3`}>
      {'★'.repeat(level)}
      <span className="text-slate-300">{'★'.repeat(3 - level)}</span>
    </span>
  )
}

export function AccuracyBar({
  correct,
  total,
  barClass,
}: {
  correct: number
  total: number
  barClass: string
}) {
  const percent = total === 0 ? 0 : Math.round((correct / total) * 100)
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full transition-all ${barClass}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

export function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="text-lg font-extrabold text-slate-800">{title}</p>
      <p className="max-w-md text-sm font-semibold text-slate-500">{body}</p>
    </div>
  )
}

export function PageSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      <p className="text-sm font-bold text-slate-500">{label}</p>
    </div>
  )
}

export function FeedbackBanner({
  correct,
  children,
}: {
  correct: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`rounded-2xl border-2 px-4 py-3 text-base font-extrabold ${
        correct ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-rose-300 bg-rose-50 text-rose-800'
      }`}
      role="status"
    >
      {children}
    </div>
  )
}
