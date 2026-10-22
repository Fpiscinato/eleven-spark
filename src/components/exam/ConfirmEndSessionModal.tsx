import { X } from 'lucide-react'

interface ConfirmEndSessionModalProps {
  open: boolean
  /** Title of the dialog. */
  title: string
  /** One short sentence explaining what happens. */
  message: string
  /** Label of the safe button (the child stays in the session). */
  keepLabel: string
  /** Label of the button that ends the session. */
  endLabel: string
  onKeepGoing: () => void
  onEnd: () => void
}

/**
 * A single, clean confirmation for ending a running question session.
 *
 * There is only ONE step on purpose: an accidental tap must not throw away a
 * session, but a real decision must never need two extra taps either.
 */
export function ConfirmEndSessionModal({
  open,
  title,
  message,
  keepLabel,
  endLabel,
  onKeepGoing,
  onEnd,
}: ConfirmEndSessionModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-900/60 p-4">
      <div
        className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl md:p-6"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-3 flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-100 text-rose-700">
            <X className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
        </div>
        <p className="mb-5 text-sm font-semibold leading-relaxed text-slate-600">{message}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onKeepGoing}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-700 transition hover:border-slate-300 active:scale-[0.98]"
          >
            {keepLabel}
          </button>
          <button
            type="button"
            onClick={onEnd}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-rose-700 active:scale-[0.98]"
          >
            {endLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
