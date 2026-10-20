import { BarChart3, BookOpen, ClipboardList, Home, Lock, Settings, Sparkles, TrendingUp, Unlock, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useParentGate } from '../context/ParentGateContext'
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

interface AppShellProps {
  screen: ScreenId
  onNavigate: (screen: ScreenId) => void
  children: ReactNode
}

export function AppShell({ screen, onNavigate, children }: AppShellProps) {
  const { parentMode, requestUnlock, lockParentMode } = useParentGate()

  const handleParentToggle = () => {
    if (parentMode) {
      lockParentMode()
      return
    }
    void requestUnlock()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white md:flex">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-3 border-b border-slate-100 px-6 py-5 text-left transition hover:bg-slate-50"
        >
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-600 text-white">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-lg font-black leading-tight text-slate-900">ElevenSpark</p>
            <p className="text-xs font-bold text-slate-500">Gloucestershire 11+</p>
          </div>
        </button>
        <nav className="flex flex-1 flex-col gap-2 p-4" aria-label="Main navigation">
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
        <div className="mt-auto flex flex-col gap-2 p-4">
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
            Parent Dashboard
          </button>
        </div>
        <p className="px-6 pb-5 text-xs font-bold text-slate-400">
          Practice a little every day — small steps win big.
        </p>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur md:pl-[276px] md:pr-8 md:py-3">
        <div className="flex min-w-0 items-center gap-2 md:hidden">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="truncate text-base font-black text-slate-900">ElevenSpark</p>
        </div>
        <div className="hidden min-w-0 md:block" />
        <div className="flex shrink-0 items-center gap-2">
          <SyncStatusBadge />
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
            aria-label="Parent Dashboard settings"
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
        <div className="mx-auto max-w-5xl">{children}</div>
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
