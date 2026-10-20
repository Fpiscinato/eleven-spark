import { ClipboardList, Flame, Rocket, Sparkles, Target, Timer, Trophy, Zap } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { SUBJECTS } from '../db/schemas'
import { useProfile } from '../context/ProfileContext'
import { formatClock, formatDateTime } from '../lib/format'
import {
  getAbandonedSessions,
  getAllAttempts,
  getDashboardStats,
  getRecentSessions,
  getSubjectStats,
  type DashboardStats,
  type SubjectStat,
} from '../lib/stats'
import { SESSION_MODE_LABELS, SUBJECT_META } from '../lib/theme'
import {
  computeRoadmap,
  computeTodaysSpark,
  todaysAnsweredToday,
  type RoadmapSnapshot,
  type SparkPlan,
} from '../utils/roadmapCalculator'
import { db } from '../db/database'
import type { NavParams, ScreenId } from '../types'
import { PageSpinner, ScreenHeader, StatCard, cardClass } from '../components/ui'
import type { Session } from '../db/schemas'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

interface DashboardProps {
  onNavigate: (screen: ScreenId, params?: NavParams) => void
}

function SparkWidget({ plan, answeredToday, onNavigate }: {
  plan: SparkPlan
  answeredToday: number
  onNavigate: (screen: ScreenId, params?: NavParams) => void
}) {
  const done = answeredToday >= 20
  return (
    <section className="rounded-3xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-amber-50 p-5 shadow-sm md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">⚡</span>
          <h2 className="text-lg font-black text-slate-900">Today's 20-Minute Spark</h2>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-indigo-700 ring-1 ring-indigo-200">
          {answeredToday}/20 done today
        </span>
      </div>
      <p className="text-base font-black text-slate-800">{plan.task.title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600">{plan.task.detail}</p>
      <p className="mt-2 text-xs font-bold text-slate-500">{plan.reason}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3 py-1.5 text-sm font-extrabold text-slate-700 ring-1 ring-slate-200">
          <Timer className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          ~{plan.task.minutes} min
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3 py-1.5 text-sm font-extrabold text-slate-700 ring-1 ring-slate-200">
          <Zap className="h-4 w-4 text-amber-500" aria-hidden="true" />
          {plan.task.questions} questions
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          if (plan.task.id === 'mini_mock') onNavigate('mock')
          else onNavigate('practice')
        }}
        className="mt-4 inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-base font-extrabold text-white transition hover:bg-indigo-700 active:scale-[0.98]"
      >
        <Rocket className="h-5 w-5" aria-hidden="true" />
        {done ? 'Do a bonus round' : 'Start my Spark'}
      </button>
    </section>
  )
}

function PhaseCards({ roadmap }: { roadmap: RoadmapSnapshot }) {
  return (
    <section aria-labelledby="phases-heading">
      <h2 id="phases-heading" className="mb-3 text-lg font-black text-slate-900">
        Your 3-phase roadmap
      </h2>
      <div className="grid gap-3 lg:grid-cols-3">
        {roadmap.phases.map((phase) => {
          const current = phase.id === roadmap.currentPhaseId
          return (
            <div
              key={phase.id}
              className={`${cardClass} flex flex-col gap-3 ${current ? 'border-2 border-indigo-400 bg-indigo-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-base font-black text-slate-900">{phase.title}</p>
                  <p className="text-xs font-bold text-slate-500">{phase.window}</p>
                </div>
                {current ? (
                  <span className="rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                    Now
                  </span>
                ) : null}
              </div>
              <p className="text-sm font-semibold text-slate-600">{phase.headline}</p>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${phase.percent}%` }} />
              </div>
              <p className="text-sm font-black text-indigo-700">{phase.percent}% complete</p>
              <ul className="flex flex-col gap-1.5">
                {phase.goals.map((goal) => (
                  <li key={goal.label} className="flex items-center justify-between gap-2 text-xs font-bold">
                    <span className={goal.met ? 'text-emerald-700' : 'text-slate-600'}>
                      {goal.met ? '✓' : '○'} {goal.label}
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {goal.unit === 'percent'
                        ? `${goal.achieved}% / ${goal.value}%`
                        : `${goal.achieved} / ${goal.value}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { activeProfileId } = useProfile()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [abandonedCount, setAbandonedCount] = useState(0)
  const [roadmap, setRoadmap] = useState<RoadmapSnapshot | null>(null)
  const [spark, setSpark] = useState<SparkPlan | null>(null)
  const [answeredToday, setAnsweredToday] = useState(0)

  const load = useCallback(async () => {
    const [dashboardStats, subjectRows, recentSessions, abandoned, attempts] = await Promise.all([
      getDashboardStats(activeProfileId),
      getSubjectStats(activeProfileId),
      getRecentSessions(activeProfileId, 3),
      getAbandonedSessions(activeProfileId),
      getAllAttempts(activeProfileId),
    ])
    setStats(dashboardStats)
    setSubjectStats(subjectRows)
    setSessions(recentSessions)
    setAbandonedCount(abandoned.length)

    const questionIds = [...new Set(attempts.map((attempt) => attempt.questionId))]
    const questions = questionIds.length > 0 ? await db.questions.bulkGet(questionIds) : []
    const questionTimeTargets = new Map<string, number>()
    for (const question of questions) {
      if (question) questionTimeTargets.set(question.id, question.timeTargetSeconds)
    }
    const completedSessions = await db.sessions
      .where('profileId')
      .equals(activeProfileId)
      .and((session) => session.status === 'completed')
      .toArray()
    const snapshot = computeRoadmap({ attempts, sessions: completedSessions, questionTimeTargets })
    const today = todaysAnsweredToday(attempts)
    setRoadmap(snapshot)
    setAnsweredToday(today)
    setSpark(computeTodaysSpark(snapshot, today))
  }, [activeProfileId])

  useEffect(() => {
    void load()
  }, [load])

  if (!stats || !roadmap || !spark) return <PageSpinner label="Getting your desk ready..." />

  return (
    <div className="flex flex-col gap-5">
      <ScreenHeader
        title={`${greeting()}!`}
        subtitle={
          stats.streakDays > 0
            ? `You are on a ${stats.streakDays}-day streak. Keep the spark alive!`
            : 'Answer a few questions today to start your streak.'
        }
      />

      <SparkWidget plan={spark} answeredToday={answeredToday} onNavigate={onNavigate} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Flame}
          label={stats.streakDays === 1 ? 'Day streak' : 'Day streak'}
          value={String(stats.streakDays)}
          hint={stats.streakDays > 0 ? 'Study today to keep it going' : 'Start today!'}
          accentClass="bg-amber-100 text-amber-700"
        />
        <StatCard
          icon={Zap}
          label="Answered today"
          value={String(stats.answeredToday)}
          hint={`${stats.totalAnswered} questions in total`}
          accentClass="bg-indigo-100 text-indigo-700"
        />
        <StatCard
          icon={Target}
          label="Overall accuracy"
          value={`${stats.accuracy}%`}
          hint={stats.totalAnswered === 0 ? 'No answers yet' : 'Across every subject'}
          accentClass="bg-emerald-100 text-emerald-700"
        />
        <StatCard
          icon={Timer}
          label="Average time"
          value={formatClock(stats.avgTimeSeconds)}
          hint="Per question"
          accentClass="bg-sky-100 text-sky-700"
        />
      </div>

      <section aria-labelledby="subjects-heading">
        <h2 id="subjects-heading" className="mb-3 text-lg font-black text-slate-900">
          Pick a subject
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SUBJECTS.map((subject) => {
            const meta = SUBJECT_META[subject]
            const Icon = meta.icon
            const stat = subjectStats.find((row) => row.subject === subject)
            return (
              <button
                key={subject}
                type="button"
                onClick={() => onNavigate('practice', { subject })}
                className={`${cardClass} flex items-center gap-4 border-2 text-left transition active:scale-[0.99] ${meta.tileClass}`}
              >
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${meta.badgeClass}`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-black text-slate-900">{meta.label}</p>
                  <p className="text-sm font-bold text-slate-500">
                    {stat && stat.total > 0
                      ? `${stat.accuracy}% correct over ${stat.total} questions`
                      : 'Not attempted yet'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <PhaseCards roadmap={roadmap} />

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onNavigate('mock')}
          className={`${cardClass} flex items-center gap-4 border-2 border-indigo-200 bg-indigo-50 text-left transition hover:border-indigo-400 active:scale-[0.99]`}
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white">
            <ClipboardList className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-black text-slate-900">Gloucestershire Mock Exam</p>
            <p className="text-sm font-bold text-slate-600">Real Paper 1 & Paper 2 with section lock</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('progress')}
          className={`${cardClass} flex items-center gap-4 border-2 border-rose-200 bg-rose-50 text-left transition hover:border-rose-400 active:scale-[0.99]`}
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-rose-600 text-white">
            <Trophy className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-black text-slate-900">
              Mistake Bank{stats.openMistakes > 0 ? ` (${stats.openMistakes})` : ''}
            </p>
            <p className="text-sm font-bold text-slate-600">
              {stats.openMistakes > 0
                ? 'Turn tricky questions into strengths'
                : 'See your progress and back up your data'}
            </p>
          </div>
        </button>
      </div>

      {abandonedCount > 0 ? (
        <p className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500">
          <Sparkles className="h-4 w-4 text-slate-400" aria-hidden="true" />
          {abandonedCount} interrupted session{abandonedCount === 1 ? '' : 's'} saved in your audit log — they
          never count as a zero.
        </p>
      ) : null}

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="mb-3 text-lg font-black text-slate-900">
          Recent sessions
        </h2>
        {sessions.length === 0 ? (
          <div className={cardClass}>
            <p className="text-sm font-semibold text-slate-500">
              No finished sessions yet. Try a Quick Practice or a Mini Mock — your results will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-sm font-black text-slate-900">
                    {SESSION_MODE_LABELS[session.mode] ?? session.mode}
                  </p>
                  <p className="text-xs font-bold text-slate-500">{formatDateTime(session.startedAt)}</p>
                </div>
                <p className="text-lg font-black text-indigo-600">{Math.round(session.scorePercentage)}%</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
