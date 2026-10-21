import { BarChart3, BookOpen, ClipboardList, Home, Lock, Settings, Timer, TrendingUp, Unlock, X, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useParentAutoLock, useParentGate } from '../context/ParentGateContext'
import { VERSION_SEAL } from '../config/version'
import { ElevenSparkLogo } from './brand/ElevenSparkLogo'
import { VersionBadge } from './brand/VersionBadge'
import { MotivationalCard } from './MotivationalCard'
import { ProfileSwitcher } from './ProfileSwitcher'
import { SyncStatusBadge } from './SyncStatusBadge'
import type { ScreenId } from '../types'

const NAV_ITEMS = [
  { screen: 'dashboard' as const, label: 'Home', icon: Home },
  { screen: 'practice' as const, label: 'Practice', icon: Zap },
  { screen: 'mock' as const, label: 'Mock', icon: ClipboardList },
  { screen: 'progress' as const, label: 'Progress', icon: TrendingUp },
  { screen: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
  { screen: 'guide' as const, label: 'Guide', icon: BookOpen },
]

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

interface AppShellProps {
  screen: ScreenId
  onNavigate: (screen: ScreenId) => void
  children: ReactNode
}

export function AppShell({ screen, onNavigate, children }: AppShellProps) {
  const { parentMode, requestUnlock, lockParentMode } = useParentGate()
  const { secondsLeft, notice, clearNotice } = useParentAutoLock()

  const handleParentToggle = () => {
    if (parentMode) {
      lockParentMode()
      return
    }
    void requestUnlock()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white md:top-[69px] md:flex md:h-[calc(100dvh-69px)]">
        <nav className="flex flex-1 flex-col gap-2 p-4 pt-5" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = screen === item.screen
            return (
              <button
                key={item.screen}
                type="button"
                onClick={() => onNavigate(item.screen)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[52px] items-center gap-3 rounded-2xl px-4 text-base font-extrabold transition ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3 p-4">
          <button
            type="button"
            onClick={handleParentToggle}
            aria-pressed={parentMode}
            className={`flex min-h-[48px] items-center gap-3 rounded-2xl border-2 px-4 text-sm font-extrabold transition ${
              parentMode
                ? 'border-amber-400 bg-amber-50 text-amber-900'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {parentMode ? <Unlock className="h-5 w-5" aria-hidden="true" /> : <Lock className="h-5 w-5" aria-hidden="true" />}
            {parentMode ? 'Parent Mode Active' : 'Parent Mode'}
          </button>
          {parentMode && secondsLeft !== null ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-900">
              Auto-locks in {formatCountdown(secondsLeft)}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            aria-current={screen === 'settings' ? 'page' : undefined}
            className={`flex min-h-[48px] items-center gap-3 rounded-2xl border-2 px-4 text-sm font-extrabold transition ${
              screen === 'settings'
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
            Settings
          </button>
          <MotivationalCard />
        </div>
        <p className="px-6 pb-5 text-xs font-bold text-slate-400">{VERSION_SEAL}</p>
      </aside>

      <header className="app-print-header sticky top-0 z-40 flex h-[64px] items-center gap-2 border-b border-slate-200 bg-white/95 px-2 backdrop-blur md:h-[69px] md:gap-3 md:px-6">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          aria-label="Go to Home"
          className="flex min-w-0 items-center gap-2 md:w-64 md:shrink-0"
        >
          <ElevenSparkLogo className="h-8 w-auto shrink-0 md:h-9" />
          <span className="min-w-0">
            <span className="block truncate text-base font-black leading-tight text-slate-900">ElevenSpark</span>
            <span className="hidden text-xs font-bold leading-tight text-slate-500 md:block">
              Gloucestershire 11+
            </span>
          </span>
        </button>
        <div className="no-print ml-auto flex min-w-0 items-center gap-1.5 md:gap-2">
          <SyncStatusBadge />
          {parentMode && secondsLeft !== null ? (
            <span
              className="flex items-center gap-1 rounded-xl border-2 border-amber-200 bg-amber-50 px-2 py-1 text-xs font-extrabold text-amber-800"
              role="status"
              aria-label={`Parent mode auto-locks in ${formatCountdown(secondsLeft)}`}
            >
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden md:inline">Auto-lock in</span>
              {formatCountdown(secondsLeft)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleParentToggle}
            aria-pressed={parentMode}
            aria-label={parentMode ? 'Lock Parent Mode' : 'Unlock Parent Mode'}
            className={`grid h-11 w-11 place-items-center rounded-xl border-2 transition ${
              parentMode
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            {parentMode ? <Unlock className="h-5 w-5" aria-hidden="true" /> : <Lock className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            aria-label="Settings"
            aria-current={screen === 'settings' ? 'page' : undefined}
            className={`grid h-11 w-11 place-items-center rounded-xl border-2 transition ${
              screen === 'settings'
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </button>
          <ProfileSwitcher />
        </div>
      </header>

      <main className="px-4 pb-28 pt-5 md:pb-10 md:pl-[272px] md:pr-8 md:pt-6">
        <div className="mx-auto max-w-5xl">
          {notice ? (
            <p
              className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900"
              role="status"
            >
              <span>{notice}</span>
              <button
                type="button"
                onClick={clearNotice}
                aria-label="Dismiss message"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-amber-700 transition hover:bg-amber-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </p>
          ) : null}
          {screen === 'mock' ? null : <MotivationalCard variant="compact" className="mb-4 md:hidden" />}
          {children}
          <div className="no-print mt-8 flex justify-center pb-2 md:hidden">
            <VersionBadge />
          </div>
        </div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Main navigation"
      >
        <div className="grid grid-cols-6">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = screen === item.screen
            return (
              <button
                key={item.screen}
                type="button"
                onClick={() => onNavigate(item.screen)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[64px] flex-col items-center justify-center gap-1 px-0.5 text-[10px] font-extrabold transition ${
                  active ? 'text-indigo-600' : 'text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
