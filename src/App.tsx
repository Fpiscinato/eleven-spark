import { Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { SUBJECTS, type Subject } from './db/schemas'
import { initializeDatabase } from './db/database'
import { ProfileProvider } from './context/ProfileContext'
import { ParentGateProvider } from './context/ParentGateContext'
import { Dashboard } from './screens/Dashboard'
import { MockExamPage } from './pages/MockExamPage'
import { PracticePage } from './pages/PracticePage'
import { Progress } from './screens/Progress'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { GuidePage } from './pages/GuidePage'
import { SettingsPage } from './pages/SettingsPage'
import { SpecialDedicationHost } from './components/brand/SpecialDedicationModal'
import { startSyncListeners } from './services/gistSync'
import type { NavParams, ScreenId } from './types'

interface RouteState {
  screen: ScreenId
  params: NavParams
}

const SCREEN_IDS: ScreenId[] = ['dashboard', 'practice', 'mock', 'progress', 'analytics', 'guide', 'settings']

function parseHash(): RouteState {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [path = '', query = ''] = raw.split('?')
  const search = new URLSearchParams(query)
  const screen = (SCREEN_IDS as string[]).includes(path) ? (path as ScreenId) : 'dashboard'
  const params: NavParams = {}
  const subjectParam = search.get('subject')
  if (subjectParam && (SUBJECTS as readonly string[]).includes(subjectParam)) {
    params.subject = subjectParam as Subject
  }
  const topicParam = search.get('topic')
  if (topicParam) {
    params.topic = topicParam
  }
  const clinicParam = search.get('clinic')
  if (clinicParam) {
    params.clinicIds = clinicParam.split(',').filter((id) => id.length > 0)
  }
  return { screen, params }
}

function buildHash(screen: ScreenId, params: NavParams): string {
  const search = new URLSearchParams()
  if (params.subject) search.set('subject', params.subject)
  if (params.topic) search.set('topic', params.topic)
  if (params.clinicIds && params.clinicIds.length > 0) search.set('clinic', params.clinicIds.join(','))
  const query = search.toString()
  return `#/${screen}${query ? `?${query}` : ''}`
}

export default function App() {
  const [booted, setBooted] = useState(false)
  const [route, setRoute] = useState<RouteState>(() => parseHash())

  useEffect(() => {
    void initializeDatabase().then(() => {
      setBooted(true)
      startSyncListeners()
    })
  }, [])

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((screen: ScreenId, params: NavParams = {}) => {
    window.location.hash = buildHash(screen, params)
  }, [])

  if (!booted) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="grid h-16 w-16 animate-pulse place-items-center rounded-3xl bg-indigo-600 text-white">
            <Sparkles className="h-8 w-8" aria-hidden="true" />
          </div>
          <p className="text-base font-extrabold text-slate-600">Setting up your practice desk...</p>
        </div>
      </div>
    )
  }

  return (
    <ProfileProvider>
      <ParentGateProvider>
        <AppShell screen={route.screen} onNavigate={(screen) => navigate(screen)}>
          {route.screen === 'dashboard' ? <Dashboard onNavigate={navigate} /> : null}
          {route.screen === 'practice' ? (
            <PracticePage
              key={`practice-${route.params.subject ?? 'all'}-${route.params.topic ?? 'all'}`}
              params={route.params}
              onNavigate={navigate}
            />
          ) : null}
          {route.screen === 'mock' ? <MockExamPage onNavigate={navigate} /> : null}
          {route.screen === 'progress' ? <Progress onNavigate={navigate} /> : null}
          {route.screen === 'analytics' ? <AnalyticsPage onNavigate={navigate} /> : null}
          {route.screen === 'guide' ? <GuidePage onNavigate={navigate} /> : null}
          {route.screen === 'settings' ? <SettingsPage /> : null}
        </AppShell>
        <SpecialDedicationHost />
      </ParentGateProvider>
    </ProfileProvider>
  )
}
