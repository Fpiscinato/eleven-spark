import { Heart, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ElevenSparkLogo } from './ElevenSparkLogo'

const SPECIAL_EDITION_KEY = 'elevenspark.special_edition'
const DEDICATION_SEEN_KEY = 'elevenspark.dedication_seen'
const SETTINGS_CHANGED_EVENT = 'elevenspark:settings-changed'
const OPEN_DEDICATION_EVENT = 'elevenspark:open-dedication'
const CELEBRATE_EVENT = 'elevenspark:celebrate'

export interface CelebrationDetail {
  title: string
  message: string
}

export function celebrateSpecial(detail: CelebrationDetail): void {
  window.dispatchEvent(new CustomEvent<CelebrationDetail>(CELEBRATE_EVENT, { detail }))
}

export function notifySettingsChanged(): void {
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
}

export function requestDedicationOpen(): void {
  window.dispatchEvent(new Event(OPEN_DEDICATION_EVENT))
}

export function isSpecialEditionEnabled(): boolean {
  try {
    return window.localStorage.getItem(SPECIAL_EDITION_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSpecialEditionEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SPECIAL_EDITION_KEY, enabled ? 'on' : 'off')
  } catch {
    return
  }
}

function readDedicationSeen(): boolean {
  try {
    return window.localStorage.getItem(DEDICATION_SEEN_KEY) === 'yes'
  } catch {
    return true
  }
}

function markDedicationSeen(): void {
  try {
    window.localStorage.setItem(DEDICATION_SEEN_KEY, 'yes')
  } catch {
    return
  }
}

export function SpecialEditionBadge({ onOpen }: { onOpen: () => void }) {
  const [enabled, setEnabled] = useState(isSpecialEditionEnabled)

  useEffect(() => {
    const refresh = () => setEnabled(isSpecialEditionEnabled())
    window.addEventListener(SETTINGS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, refresh)
  }, [])

  if (!enabled) return null

  return (
    <button
      type="button"
      onClick={onOpen}
      title="A special message for you"
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 px-3 py-1.5 text-xs font-black text-amber-800 shadow-sm transition hover:border-amber-400 hover:from-amber-100 active:scale-[0.98]"
    >
      <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
      <span className="hidden sm:inline">✨ Special Edition</span>
      <span className="sm:hidden">✨</span>
    </button>
  )
}

function DedicationCard({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Special dedication"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-amber-200 bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#3730a3] px-6 pb-5 pt-6 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-white/10 ring-2 ring-amber-400/60">
            <ElevenSparkLogo className="h-12 w-auto" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">✨ Special Edition ✨</p>
          <h2 className="mt-1 text-2xl font-black text-white">Built Especially for You</h2>
        </div>
        <div className="space-y-3 px-6 py-5 text-center">
          <p className="text-base font-bold leading-relaxed text-slate-800">
            Hello! This app was built, bit by bit and question by question, by{' '}
            <strong className="text-indigo-700">Uncle Fernando</strong> — just for you.
          </p>
          <p className="text-base font-semibold leading-relaxed text-slate-700">
            Every exercise here exists to help you win your place at Grammar School. Some days will feel
            easy and some will feel tough, but remember:{' '}
            <strong className="text-amber-700">
              effort and consistency beat talent every single time
            </strong>
            . Ten minutes today is worth more than an hour “someday”.
          </p>
          <p className="text-base font-bold leading-relaxed text-slate-800">
            Uncle Fernando is cheering for you — now go spark your way to success! ⚡
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 px-6 py-3 text-base font-black text-slate-950 shadow-sm transition hover:from-amber-600 hover:to-yellow-600 active:scale-[0.98]"
          >
            <Heart className="h-5 w-5" aria-hidden="true" />
            I'm ready — let's go!
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close special message"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function CelebrationCard({ detail, onClose }: { detail: CelebrationDetail; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Celebration"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-[2rem] border border-amber-200 bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 px-6 py-6 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-white drop-shadow" aria-hidden="true" />
          <h2 className="mt-2 text-2xl font-black text-white drop-shadow">{detail.title}</h2>
        </div>
        <div className="space-y-4 px-6 py-5 text-center">
          <p className="text-base font-bold leading-relaxed text-slate-800">{detail.message}</p>
          <p className="text-sm font-black text-amber-700">
            A little cheer from Uncle Fernando, with lots of pride ⚡
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-indigo-600 px-6 py-3 text-base font-black text-white transition hover:bg-indigo-700 active:scale-[0.98]"
          >
            Keep going!
          </button>
        </div>
      </div>
    </div>
  )
}

export function SpecialDedicationHost() {
  const [dedicationOpen, setDedicationOpen] = useState(false)
  const [celebration, setCelebration] = useState<CelebrationDetail | null>(null)

  useEffect(() => {
    if (!readDedicationSeen()) {
      markDedicationSeen()
      setDedicationOpen(true)
    }
    const openDedication = () => setDedicationOpen(true)
    const celebrate = (event: Event) => {
      const detail = (event as CustomEvent<CelebrationDetail>).detail
      if (detail && detail.title && detail.message) {
        setCelebration(detail)
      }
    }
    window.addEventListener(OPEN_DEDICATION_EVENT, openDedication)
    window.addEventListener(CELEBRATE_EVENT, celebrate)
    return () => {
      window.removeEventListener(OPEN_DEDICATION_EVENT, openDedication)
      window.removeEventListener(CELEBRATE_EVENT, celebrate)
    }
  }, [])

  return (
    <>
      {dedicationOpen ? <DedicationCard onClose={() => setDedicationOpen(false)} /> : null}
      {celebration ? (
        <CelebrationCard detail={celebration} onClose={() => setCelebration(null)} />
      ) : null}
    </>
  )
}
