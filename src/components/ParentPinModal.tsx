import { Delete, Lock, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { btnPrimaryClass, btnSecondaryClass } from './ui'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']

interface ParentPinModalProps {
  open: boolean
  onSubmit: (pin: string) => void
  onCancel: () => void
}

export function ParentPinModal({ open, onSubmit, onCancel }: ParentPinModalProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (open) {
      setPin('')
      setError(false)
    }
  }, [open])

  const appendDigit = useCallback((digit: string) => {
    setError(false)
    setPin((current) => (current.length >= 6 ? current : current + digit))
  }, [])

  const backspace = useCallback(() => {
    setError(false)
    setPin((current) => current.slice(0, -1))
  }, [])

  const submit = useCallback(() => {
    if (pin.length < 4) {
      setError(true)
      return
    }
    onSubmit(pin)
  }, [pin, onSubmit])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" role="dialog" aria-modal="true" aria-label="Parent Mode PIN">
      <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 text-white shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-800 text-amber-400">
              <Lock className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-lg font-black">Parent Mode</p>
              <p className="text-xs font-semibold text-slate-400">Enter the 4 to 6 digit PIN</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Cancel"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div
          className={`mb-4 flex items-center justify-center gap-3 rounded-2xl border-2 py-4 ${
            error ? 'border-rose-400 bg-rose-950/40' : 'border-slate-700 bg-slate-800/60'
          }`}
          role="status"
          aria-live="polite"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={index}
              className={`h-3.5 w-3.5 rounded-full ${
                index < pin.length ? (error ? 'bg-rose-400' : 'bg-amber-400') : 'bg-slate-600'
              }`}
            />
          ))}
        </div>
        {error ? (
          <p className="mb-3 text-center text-sm font-bold text-rose-300">That PIN is not right. Try again.</p>
        ) : null}

        <div className="mb-5 grid grid-cols-3 gap-2">
          {KEYS.map((key, index) => {
            if (key === '') return <span key={`gap-${index}`} aria-hidden="true" />
            if (key === 'back') {
              return (
                <button
                  key="back"
                  type="button"
                  onClick={backspace}
                  className="grid min-h-[56px] place-items-center rounded-2xl bg-slate-800 text-slate-300 transition hover:bg-slate-700 active:scale-95"
                  aria-label="Delete last digit"
                >
                  <Delete className="h-6 w-6" aria-hidden="true" />
                </button>
              )
            }
            return (
              <button
                key={key}
                type="button"
                onClick={() => appendDigit(key)}
                className="min-h-[56px] rounded-2xl bg-slate-800 text-xl font-black text-white transition hover:bg-slate-700 active:scale-95"
              >
                {key}
              </button>
            )
          })}
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className={`${btnSecondaryClass} flex-1 border-slate-600 bg-slate-800 text-slate-200`}>
            Cancel
          </button>
          <button type="button" onClick={submit} className={`${btnPrimaryClass} flex-1 bg-amber-500 text-slate-900 hover:bg-amber-400`}>
            Unlock
          </button>
        </div>
      </div>
    </div>
  )
}
