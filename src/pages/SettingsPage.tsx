import { KeyRound, Lock, LockOpen, Monitor, Moon, ShieldCheck, Sun, Unlock } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ProfileManager } from '../components/ProfileManager'
import { BackupRestoreCard } from '../components/BackupRestoreCard'
import { DataResetCard } from '../components/DataResetCard'
import { LocalSnapshotsCard } from '../components/LocalSnapshotsCard'
import { SafetySealCard } from '../components/SafetySealCard'
import { SyncStatusSummary, openSyncSettings } from '../components/SyncStatusBadge'
import { ScreenHeader, btnPrimaryClass, btnSecondaryClass, cardClass } from '../components/ui'
import { useParentGate } from '../context/ParentGateContext'
import { VERSION_SEAL } from '../config/version'
import { changePin, isValidPinFormat } from '../lib/admin'
import { PARENT_LOCK_OPTIONS, useParentLockMinutes } from '../lib/parentAutoLock'
import { THEME_CHANGED_EVENT, getStoredTheme, setThemeMode, type ThemeMode } from '../lib/themeMode'

function ParentModeCard() {
  const { parentMode, requestUnlock, lockParentMode } = useParentGate()
  const [lockMinutes, setLockMinutes] = useParentLockMinutes()
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
      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="text-sm font-black text-slate-900">Auto-lock timer</p>
        <p className="mb-2 text-xs font-semibold text-slate-500">
          Parent Mode locks itself after this much time without any activity.
        </p>
        <div className="flex flex-wrap gap-2">
          {PARENT_LOCK_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => setLockMinutes(minutes)}
              aria-pressed={lockMinutes === minutes}
              className={`min-h-[44px] rounded-2xl border-2 px-4 text-sm font-extrabold transition ${
                lockMinutes === minutes
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              {minutes} min
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function ChangePinCard() {
  const { parentMode, requestUnlock } = useParentGate()
  const [expanded, setExpanded] = useState(false)
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const closeForm = useCallback(() => {
    setExpanded(false)
    setOldPin('')
    setNewPin('')
    setConfirmPin('')
    setError(null)
    setNote(null)
  }, [])

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
    setExpanded(false)
  }, [oldPin, newPin, confirmPin])

  if (!parentMode) {
    return (
      <section className={cardClass}>
        <h2 className="text-base font-black text-slate-900">Change PIN</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">
          Enter Parent Mode to set or change the parent PIN for this device.
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
            <KeyRound className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900">Change PIN</h2>
            <p className="text-sm font-bold text-slate-500">4 to 6 digits. Stored only on this device.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => (expanded ? closeForm() : setExpanded(true))}
          aria-expanded={expanded}
          className={btnSecondaryClass}
        >
          {expanded ? 'Cancel' : 'Change PIN'}
        </button>
      </div>

      {note && !expanded ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800" role="status">
          {note}
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-4 flex flex-col gap-3">
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
          {error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={oldPin.length < 4 || newPin.length < 4 || confirmPin.length < 4}
            className={`${btnPrimaryClass} w-full disabled:opacity-50 sm:w-auto`}
          >
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            Update PIN
          </button>
        </div>
      ) : null}
    </section>
  )
}

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
  { mode: 'system', label: 'System', icon: Monitor },
]

function ThemeCard() {
  const [mode, setMode] = useState<ThemeMode>(getStoredTheme)

  useEffect(() => {
    const sync = () => setMode(getStoredTheme())
    window.addEventListener(THEME_CHANGED_EVENT, sync)
    return () => window.removeEventListener(THEME_CHANGED_EVENT, sync)
  }, [])

  return (
    <section className={cardClass}>
      <h2 className="mb-1 text-base font-black text-slate-900">Appearance</h2>
      <p className="mb-4 text-sm font-bold text-slate-500">
        Choose a light or dark look, or follow your device setting.
      </p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Appearance">
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon
          const active = mode === option.mode
          return (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setThemeMode(option.mode)}
              className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 text-sm font-extrabold transition ${
                active
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {option.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function SettingsPage() {
  const { parentMode } = useParentGate()
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">{VERSION_SEAL}</p>
        <ScreenHeader
          title="Settings"
          subtitle="Manage profiles, snapshots, resets, the PIN and cloud sync."
        />
      </div>

      <ParentModeCard />
      <ChangePinCard />
      <ThemeCard />

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
        <SyncStatusSummary onOpen={openSyncSettings} />
      </section>

      <BackupRestoreCard />

      <LocalSnapshotsCard />

      <SafetySealCard />

      <DataResetCard />

      <ProfileManager />
    </div>
  )
}
