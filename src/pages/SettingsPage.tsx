import { KeyRound, Lock, LockOpen, ShieldCheck, Unlock } from 'lucide-react'
import { useCallback, useState } from 'react'
import { ProfileManager } from '../components/ProfileManager'
import { SyncStatusBadge } from '../components/SyncStatusBadge'
import { ScreenHeader, btnPrimaryClass, btnSecondaryClass, cardClass } from '../components/ui'
import { useParentGate } from '../context/ParentGateContext'
import { changePin, DEFAULT_PARENT_PIN, isValidPinFormat } from '../lib/admin'

function ParentModeCard() {
  const { parentMode, requestUnlock, lockParentMode } = useParentGate()
  return (
    <section className={cardClass}>
      <div className="flex items-center gap-3">
        <div
          className={`grid h-11 w-11 place-items-center rounded-2xl ${
            parentMode ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {parentMode ? <Unlock className="h-6 w-6" aria-hidden="true" /> : <Lock className="h-6 w-6" aria-hidden="true" />}
        </div>
        <div className="flex-1">
          <h2 className="text-base font-black text-slate-900">Parent Mode</h2>
          <p className="text-sm font-bold text-slate-500">
            {parentMode
              ? 'Unlocked. You can manage profiles, resets and cloud sync.'
              : 'Locked. Enter your PIN to unlock parent controls.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          if (parentMode) lockParentMode()
          else void requestUnlock()
        }}
        className={`${parentMode ? btnSecondaryClass : btnPrimaryClass} mt-4 w-full sm:w-auto`}
      >
        {parentMode ? <Lock className="h-5 w-5" aria-hidden="true" /> : <Unlock className="h-5 w-5" aria-hidden="true" />}
        {parentMode ? 'Lock Parent Mode' : 'Enter Parent Mode'}
      </button>
    </section>
  )
}

function ChangePinCard() {
  const { parentMode, requestUnlock } = useParentGate()
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(() => {
    setError(null)
    setNote(null)
    if (!isValidPinFormat(newPin)) {
      setError('The new PIN must be 4 to 6 digits.')
      return
    }
    if (newPin !== confirmPin) {
      setError('The two new PINs do not match.')
      return
    }
    if (!changePin(oldPin, newPin)) {
      setError('The current PIN is not correct.')
      return
    }
    setOldPin('')
    setNewPin('')
    setConfirmPin('')
    setNote('PIN changed. Keep it somewhere safe.')
  }, [oldPin, newPin, confirmPin])

  if (!parentMode) {
    return (
      <section className={cardClass}>
        <h2 className="text-base font-black text-slate-900">Change PIN</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">
          Enter Parent Mode to change the PIN. The default PIN is {DEFAULT_PARENT_PIN}.
        </p>
        <button type="button" onClick={() => void requestUnlock()} className={`${btnSecondaryClass} mt-4`}>
          <Lock className="h-5 w-5" aria-hidden="true" />
          Enter Parent Mode
        </button>
      </section>
    )
  }

  return (
    <section className={cardClass}>
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
          <KeyRound className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-black text-slate-900">Change PIN</h2>
          <p className="text-sm font-bold text-slate-500">4 to 6 digits. Stored only on this device.</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-black text-slate-800">Current PIN</span>
          <input
            type="password"
            inputMode="numeric"
            value={oldPin}
            onChange={(event) => setOldPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            autoComplete="off"
            className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 font-mono text-base tracking-[0.3em] text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-black text-slate-800">New PIN</span>
          <input
            type="password"
            inputMode="numeric"
            value={newPin}
            onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            autoComplete="off"
            className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 font-mono text-base tracking-[0.3em] text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-black text-slate-800">Confirm new PIN</span>
          <input
            type="password"
            inputMode="numeric"
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            autoComplete="off"
            className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 font-mono text-base tracking-[0.3em] text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
          />
        </label>
      </div>
      {error ? (
        <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800" role="status">
          {note}
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={oldPin.length < 4 || newPin.length < 4 || confirmPin.length < 4}
        className={`${btnPrimaryClass} mt-4 w-full sm:w-auto disabled:opacity-50`}
      >
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        Update PIN
      </button>
    </section>
  )
}

export function SettingsPage() {
  const { parentMode } = useParentGate()
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <ScreenHeader
        title="Parent Dashboard"
        subtitle="Manage profiles, resets, the PIN and cloud sync."
      />

      <ParentModeCard />
      <ChangePinCard />

      <section className={cardClass}>
        <h2 className="mb-1 text-base font-black text-slate-900">Cloud sync</h2>
        <p className="mb-4 text-sm font-bold text-slate-500">
          {parentMode ? (
            <span className="inline-flex items-center gap-1.5">
              <LockOpen className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              Configure the GitHub Gist to keep progress safe across devices.
            </span>
          ) : (
            'Status only — enter Parent Mode to change credentials.'
          )}
        </p>
        <SyncStatusBadge />
      </section>

      <ProfileManager />
    </div>
  )
}
