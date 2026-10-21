import { Eraser, Lock, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useParentGate } from '../context/ParentGateContext'
import { resetLocalData, type ResetScope } from '../services/dataReset'
import { Modal } from './Modal'
import { btnPrimaryClass, btnSecondaryClass, cardClass } from './ui'

const CONFIRM_WORD = 'RESET'

const COPY: Record<ResetScope, { title: string; body: string; confirm: string }> = {
  progress: {
    title: 'Clear all progress?',
    body: 'Every profile, practice session and answer on this device will be deleted. The question bank and your settings stay as they are, and the app will ask you to create a profile again.',
    confirm: 'Yes, clear progress',
  },
  settings: {
    title: 'Reset settings?',
    body: 'The parent PIN goes back to the default, the cloud sync account, the theme and the automatic snapshots are removed. Profiles and progress are kept.',
    confirm: 'Yes, reset settings',
  },
  factory: {
    title: 'Factory reset?',
    body: 'Everything on this device is erased: profiles, progress, snapshots, the parent PIN, the cloud sync account and the question bank. ElevenSpark will rebuild the question bank and ask you to create a profile again. This cannot be undone.',
    confirm: 'Erase everything',
  },
}

export function DataResetCard() {
  const { parentMode, requestUnlock } = useParentGate()
  const [pending, setPending] = useState<ResetScope | null>(null)
  const [typed, setTyped] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openConfirm = useCallback((scope: ResetScope) => {
    setPending(scope)
    setTyped('')
    setError(null)
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!pending) return
    if (pending === 'factory' && typed.trim().toUpperCase() !== CONFIRM_WORD) {
      setError(`Type ${CONFIRM_WORD} to confirm the factory reset.`)
      return
    }
    setWorking(true)
    try {
      await resetLocalData(pending)
      window.location.reload()
    } catch {
      setWorking(false)
      setError('The reset could not be completed. Please try again.')
    }
  }, [pending, typed])

  if (!parentMode) {
    return (
      <section className={cardClass}>
        <h2 className="text-base font-black text-slate-900">Reset data</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">
          Enter Parent Mode to clear progress, reset settings or erase everything on this device.
        </p>
        <button type="button" onClick={() => void requestUnlock()} className={`${btnPrimaryClass} mt-4`}>
          <Lock className="mr-2 inline h-5 w-5" aria-hidden="true" />
          Enter Parent Mode
        </button>
      </section>
    )
  }

  return (
    <section className={cardClass}>
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-100 text-rose-700">
          <Eraser className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-slate-900">Reset data</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            Clean up this device. Progress can also be restored from an automatic snapshot.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" onClick={() => openConfirm('progress')} className={btnSecondaryClass}>
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
          Clear all progress
        </button>
        <button type="button" onClick={() => openConfirm('settings')} className={btnSecondaryClass}>
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
          Reset settings
        </button>
        <button
          type="button"
          onClick={() => openConfirm('factory')}
          className={`${btnSecondaryClass} border-rose-200 text-rose-700 hover:border-rose-400`}
        >
          <Trash2 className="h-5 w-5" aria-hidden="true" />
          Factory reset
        </button>
      </div>

      {pending ? (
        <Modal open onClose={() => setPending(null)} label="Confirm reset">
          <div className="w-full rounded-3xl bg-white p-6 shadow-xl">
            <h2 className="mb-3 text-lg font-black text-slate-900">{COPY[pending].title}</h2>
            <p className="mb-5 text-sm font-semibold leading-relaxed text-slate-600">{COPY[pending].body}</p>
            {pending === 'factory' ? (
              <label className="mb-4 flex flex-col gap-1.5">
                <span className="text-sm font-black text-slate-800">Type {CONFIRM_WORD} to continue</span>
                <input
                  type="text"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value.toUpperCase())}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 font-mono text-base font-black tracking-[0.2em] text-slate-900 outline-none transition focus:border-rose-500 focus:bg-white"
                />
              </label>
            ) : null}
            {error ? (
              <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={working}
                className={`${btnPrimaryClass} flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-60`}
              >
                {working ? 'Working...' : COPY[pending].confirm}
              </button>
              <button type="button" onClick={() => setPending(null)} className={`${btnSecondaryClass} flex-1`}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}
