import { ArrowRight, ArrowLeft, Check, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useProfile } from '../context/ProfileContext'
import { TARGET_SCHOOLS, createProfile, isValidPinFormat, setParentPin } from '../lib/admin'
import { ElevenSparkLogo } from './brand/ElevenSparkLogo'
import { btnPrimaryClass, btnSecondaryClass } from './ui'

const AVATAR_CHOICES = ['🌟', '🚀', '🦁', '🦋', '🐉', '🎨', '🚴', '🔬']

type Step = 'welcome' | 'child' | 'pin' | 'done'

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const { switchProfile } = useProfile()
  const [step, setStep] = useState<Step>('welcome')
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('🌟')
  const [targetSchool, setTargetSchool] = useState('')
  const [childId, setChildId] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreateChild = useCallback(async () => {
    if (name.trim().length === 0) return
    setWorking(true)
    setError(null)
    try {
      const profile = await createProfile({ name, avatar, targetSchool })
      setChildId(profile.id)
      await switchProfile(profile.id)
      setStep('pin')
    } catch {
      setError('Something went wrong while creating the profile. Please try again.')
    } finally {
      setWorking(false)
    }
  }, [name, avatar, targetSchool, switchProfile])

  const handleSavePin = useCallback(() => {
    setPinError(null)
    if (!isValidPinFormat(pin)) {
      setPinError('The PIN must be 4 to 6 digits.')
      return
    }
    if (pin !== confirmPin) {
      setPinError('The two PINs do not match.')
      return
    }
    setParentPin(pin)
    setStep('done')
  }, [pin, confirmPin])

  const skipPin = useCallback(() => {
    setStep('done')
  }, [])

  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-100 p-4 py-6 sm:py-10 dark:bg-slate-900">
      <div className="my-auto w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-col items-center gap-2 rounded-t-[2rem] bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 px-6 py-7 text-center text-white">
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-white/10 ring-2 ring-amber-300/50">
            <ElevenSparkLogo className="h-12 w-auto" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Welcome to ElevenSpark</p>
          <h1 className="text-2xl font-black">
            {step === 'welcome'
              ? 'Gloucestershire 11+ Prep'
              : step === 'child'
                ? "Who is practising?"
                : step === 'pin'
                  ? 'Parent PIN'
                  : "All set!"}
          </h1>
        </div>

        <div className="px-6 py-6">
          {step === 'welcome' ? (
            <div className="flex flex-col gap-4">
              <p className="text-base font-semibold leading-relaxed text-slate-700">
                Friendly practice and realistic mock exams for the Gloucestershire Grammar Schools test —
                English, Maths and Compass, plus an optional Brain Gym for extra logic practice.
              </p>
              <ul className="flex flex-col gap-2 text-sm font-bold text-slate-600">
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  Practice a little every day with the 20-Minute Spark
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  Real two-paper mock exams with section locks
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  A parent Settings area to track progress
                </li>
              </ul>
              <button type="button" onClick={() => setStep('child')} className={`${btnPrimaryClass} mt-1`}>
                Get started
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {step === 'child' ? (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-black text-slate-800">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Amelia"
                  maxLength={40}
                  autoFocus
                  className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 text-base font-bold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-black text-slate-800">Pick an avatar</span>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_CHOICES.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setAvatar(choice)}
                      aria-pressed={avatar === choice}
                      className={`grid h-12 w-12 place-items-center rounded-2xl border-2 text-xl transition ${
                        avatar === choice
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-black text-slate-800">Target school (optional)</span>
                <select
                  value={targetSchool}
                  onChange={(event) => setTargetSchool(event.target.value)}
                  className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 text-base font-bold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                >
                  <option value="">Not sure yet</option>
                  {TARGET_SCHOOLS.map((school) => (
                    <option key={school} value={school}>
                      {school}
                    </option>
                  ))}
                </select>
              </label>
              {error ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleCreateChild()}
                  disabled={working || name.trim().length === 0}
                  className={`${btnPrimaryClass} flex-1 disabled:opacity-60`}
                >
                  {working ? 'Creating...' : 'Continue'}
                  {!working ? <ArrowRight className="h-5 w-5" aria-hidden="true" /> : null}
                </button>
                <button type="button" onClick={() => setStep('welcome')} className={`${btnSecondaryClass} flex-1`}>
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                  Back
                </button>
              </div>
            </div>
          ) : null}

          {step === 'pin' ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
                  <KeyRound className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold leading-relaxed text-slate-600">
                  Set a parent PIN to protect Settings. You can change it later.
                </p>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-black text-slate-800">Parent PIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="4 to 6 digits"
                  autoComplete="off"
                  className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 font-mono text-base tracking-[0.3em] text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-black text-slate-800">Confirm PIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  value={confirmPin}
                  onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoComplete="off"
                  className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 font-mono text-base tracking-[0.3em] text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                />
              </label>
              {pinError ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700" role="alert">
                  {pinError}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={handleSavePin} className={`${btnPrimaryClass} flex-1`}>
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  Set PIN
                </button>
                <button type="button" onClick={skipPin} className={`${btnSecondaryClass} flex-1`}>
                  Not now
                </button>
              </div>
            </div>
          ) : null}

          {step === 'done' ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-3xl bg-emerald-100 text-emerald-700">
                <Sparkles className="h-8 w-8" aria-hidden="true" />
              </div>
              <p className="text-base font-bold leading-relaxed text-slate-700">
                You're ready, {name.trim() || 'friend'}! Start with the 20-Minute Spark on your home screen —
                a little every day makes a big difference.
              </p>
              <button
                type="button"
                onClick={() => {
                  void (childId ? switchProfile(childId) : Promise.resolve()).then(() => onComplete())
                }}
                className={`${btnPrimaryClass} w-full`}
              >
                Let's go!
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
