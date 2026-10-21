import {
  AlertTriangle,
  Flame,
  RotateCcw,
  Target,
  Timer,
  Trophy,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { QuizRunner, type QuizResult } from '../components/QuizRunner'
import {
  AccuracyBar,
  DifficultyStars,
  EmptyState,
  PageSpinner,
  ScreenHeader,
  SubjectBadge,
  btnPrimaryClass,
  btnSecondaryClass,
  cardClass,
} from '../components/ui'
import { db } from '../db/database'
import { useProfile } from '../context/ProfileContext'
import type { Attempt, Passage, Question, Session } from '../db/schemas'
import { formatClock, formatDateTime } from '../lib/format'
import {
  computeStreak,
  difficultyStats,
  getAllAttempts,
  getOpenMistakes,
  getRecentSessions,
  subjectStats,
  summariseAttempts,
  type MistakeEntry,
} from '../lib/stats'
import { SESSION_MODE_LABELS, SUBJECT_META } from '../lib/theme'
import { startSession } from '../lib/sessionHelpers'
import { scheduleSync } from '../services/gistSync'
import type { ScreenId } from '../types'
import { MathText } from '../components/exam/MathText'

interface ProgressProps {
  onNavigate: (screen: ScreenId) => void
}

interface ClinicRun {
  sessionId: string
  questions: Question[]
  passagesById: Map<string, Passage>
}

function praiseForResult(result: QuizResult): string {
  if (result.total === 0) return 'No answers this time — that is okay, try again whenever you like.'
  const percent = Math.round((result.correct / result.total) * 100)
  if (percent >= 80) return 'Amazing! Those tricky questions are not tricky for you any more.'
  if (percent >= 60) return 'Nice work! Every retry makes these even easier.'
  return 'Good practise — these questions get easier each time you see them.'
}

const MISTAKE_PREVIEW = 5
const SESSION_PREVIEW = 10

export function Progress({ onNavigate }: ProgressProps) {
  const [showAllMistakes, setShowAllMistakes] = useState(false)
  const [showAllSessions, setShowAllSessions] = useState(false)
  const { activeProfileId } = useProfile()
  const [loading, setLoading] = useState(true)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [mistakes, setMistakes] = useState<MistakeEntry[]>([])
  const [clinic, setClinic] = useState<ClinicRun | null>(null)
  const [clinicResult, setClinicResult] = useState<QuizResult | null>(null)

  const load = useCallback(async () => {
    const [attemptRows, sessionRows, mistakeRows] = await Promise.all([
      getAllAttempts(activeProfileId),
      getRecentSessions(activeProfileId, 8),
      getOpenMistakes(activeProfileId),
    ])
    setAttempts(attemptRows)
    setSessions(sessionRows)
    setMistakes(mistakeRows)
    setLoading(false)
  }, [activeProfileId])

  useEffect(() => {
    void load()
  }, [load])

  const startClinicWith = useCallback(
    async (questionIds: string[]) => {
      const fetched = await db.questions.bulkGet(questionIds)
      const questions = fetched.filter((question): question is Question => question !== undefined)
      if (questions.length === 0) return
      const passageIds = questions
        .map((question) => question.passageId)
        .filter((id): id is string => id !== undefined)
      const passages = passageIds.length > 0 ? await db.passages.bulkGet(passageIds) : []
      const passagesById = new Map<string, Passage>()
      for (const passage of passages) {
        if (passage) passagesById.set(passage.id, passage)
      }
      const sessionId = await startSession('mistake_clinic', activeProfileId)
      setClinicResult(null)
      setClinic({ sessionId, questions, passagesById })
    },
    [activeProfileId],
  )

  if (clinic) {
    if (clinicResult) {
      return (
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          <ScreenHeader title="Clinic complete!" subtitle={praiseForResult(clinicResult)} />
          <div className={`${cardClass} flex flex-col items-center gap-2`}>
            <Trophy className="h-12 w-12 text-amber-500" aria-hidden="true" />
            <p className="text-5xl font-black text-slate-900">
              {clinicResult.total === 0
                ? '—'
                : `${Math.round((clinicResult.correct / clinicResult.total) * 100)}%`}
            </p>
            <p className="text-base font-bold text-slate-600">
              {clinicResult.correct} correct out of {clinicResult.total}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setClinic(null)
                setClinicResult(null)
                void load()
              }}
              className={btnPrimaryClass}
            >
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              Back to Mistake Bank
            </button>
            <button type="button" onClick={() => onNavigate('dashboard')} className={btnSecondaryClass}>
              Back to home
            </button>
          </div>
        </div>
      )
    }
    return (
      <QuizRunner
        sessionId={clinic.sessionId}
        profileId={activeProfileId}
        mode="mistake_clinic"
        questions={clinic.questions}
        passagesById={clinic.passagesById}
        onFinished={(result) => {
          setClinicResult(result)
          scheduleSync()
        }}
      />
    )
  }

  if (loading) return <PageSpinner label="Crunching your numbers..." />

  const summary = summariseAttempts(attempts)
  const subjects = subjectStats(attempts)
  const difficulties = difficultyStats(attempts)
  const streak = computeStreak(attempts.map((attempt) => attempt.timestamp))

  return (
    <div className="flex flex-col gap-5">
      <ScreenHeader
        title="Evolution & Mistake Bank"
        subtitle="See how you are growing and practise tricky questions to master them."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cardClass}>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
            <Target className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="text-2xl font-black text-slate-900">{summary.total}</p>
          <p className="text-sm font-bold text-slate-600">Questions answered</p>
        </div>
        <div className={cardClass}>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Trophy className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="text-2xl font-black text-slate-900">{summary.accuracy}%</p>
          <p className="text-sm font-bold text-slate-600">Overall accuracy</p>
        </div>
        <div className={cardClass}>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-amber-100 text-amber-700">
            <Flame className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="text-2xl font-black text-slate-900">{streak}</p>
          <p className="text-sm font-bold text-slate-600">Day streak</p>
        </div>
        <div className={cardClass}>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-sky-100 text-sky-700">
            <Timer className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="text-2xl font-black text-slate-900">{formatClock(summary.avgTimeSeconds)}</p>
          <p className="text-sm font-bold text-slate-600">
            Average per question
            {summary.medianTimeSeconds > 0
              ? ` · typical ${formatClock(summary.medianTimeSeconds)}`
              : ''}
          </p>
        </div>
      </div>

      <section className={cardClass}>
        <h2 className="mb-4 text-base font-black text-slate-900">Accuracy by subject</h2>
        <ul className="flex flex-col gap-4">
          {subjects.map((row) => (
            <li key={row.subject} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm font-extrabold text-slate-800">
                <SubjectBadge subject={row.subject} />
                <span className="tabular-nums text-slate-600">
                  {row.total === 0 ? 'No data yet' : `${row.correct}/${row.total} · ${row.accuracy}%`}
                </span>
              </div>
              <AccuracyBar correct={row.correct} total={row.total} barClass={SUBJECT_META[row.subject].barClass} />
            </li>
          ))}
        </ul>
      </section>

      <section className={cardClass}>
        <h2 className="mb-4 text-base font-black text-slate-900">Accuracy by difficulty</h2>
        <ul className="flex flex-col gap-4">
          {difficulties.map((row) => (
            <li key={row.key} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm font-extrabold text-slate-800">
                <span>
                  {row.label} <DifficultyStars level={row.key} />
                </span>
                <span className="tabular-nums text-slate-600">
                  {row.total === 0 ? 'No data yet' : `${row.correct}/${row.total} · ${row.accuracy}%`}
                </span>
              </div>
              <AccuracyBar correct={row.correct} total={row.total} barClass="bg-slate-700" />
            </li>
          ))}
        </ul>
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-900">
            Mistake Bank{mistakes.length > 0 ? ` (${mistakes.length})` : ''}
          </h2>
          {mistakes.length > 0 ? (
            <button
              type="button"
              onClick={() => void startClinicWith(mistakes.map((entry) => entry.question.id))}
              className={`${btnPrimaryClass} min-h-[44px] px-4 py-2 text-sm`}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Practise all mistakes
            </button>
          ) : null}
        </div>
        {mistakes.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No open mistakes — wonderful!"
            body="Every question you have attempted recently was correct. Keep practising to keep it that way."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {(showAllMistakes ? mistakes : mistakes.slice(0, MISTAKE_PREVIEW)).map((entry) => (
              <li key={entry.question.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <SubjectBadge subject={entry.question.subject} />
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-slate-600 border border-slate-200">
                    {entry.question.topic}
                  </span>
                  <DifficultyStars level={entry.question.difficulty} />
                </div>
                <p className="mb-2 whitespace-pre-line text-sm font-bold text-slate-800">
                  <MathText text={entry.question.stem.length > 160 ? `${entry.question.stem.slice(0, 160)}…` : entry.question.stem} />
                </p>
                <p className="mb-3 text-sm font-semibold text-slate-600">
                  Your last answer:{' '}
                  <span className="font-extrabold text-rose-600">
                    {entry.lastAttempt.selectedIndex !== null
                      ? `${['A', 'B', 'C', 'D', 'E'][entry.lastAttempt.selectedIndex]} — `
                      : 'no answer'}
                    {entry.lastAttempt.selectedIndex !== null ? (
                      <MathText text={entry.question.options[entry.lastAttempt.selectedIndex]} />
                    ) : null}
                  </span>{' '}
                  · Correct:{' '}
                  <span className="font-extrabold text-emerald-700">
                    {['A', 'B', 'C', 'D', 'E'][entry.question.correctIndex]} —{' '}
                    <MathText text={entry.question.options[entry.question.correctIndex]} />
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => void startClinicWith([entry.question.id])}
                  className={`${btnSecondaryClass} min-h-[44px] px-4 py-2 text-sm`}
                >
                  Practise this one
                </button>
              </li>
            ))}
          </ul>
        )}
        {mistakes.length > MISTAKE_PREVIEW ? (
          <button
            type="button"
            onClick={() => setShowAllMistakes((open) => !open)}
            aria-expanded={showAllMistakes}
            className={`${btnSecondaryClass} mt-3 w-full`}
          >
            {showAllMistakes
              ? 'Show fewer mistakes'
              : `Show all ${mistakes.length} mistakes (${mistakes.length - MISTAKE_PREVIEW} more)`}
          </button>
        ) : null}
      </section>

      <section className={cardClass}>
        <h2 className="mb-4 text-base font-black text-slate-900">Session history</h2>
        {sessions.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No finished sessions yet"
            body="Complete a Quick Practice or a Mock Exam and it will show up here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(showAllSessions ? sessions : sessions.slice(0, SESSION_PREVIEW)).map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-black text-slate-900">
                    {SESSION_MODE_LABELS[session.mode] ?? session.mode}
                  </p>
                  <p className="text-xs font-bold text-slate-500">
                    {formatDateTime(session.startedAt)} · {formatClock(session.totalTimeSeconds)}
                  </p>
                </div>
                <p className="text-lg font-black text-indigo-600">{Math.round(session.scorePercentage)}%</p>
              </li>
            ))}
          </ul>
        )}
        {sessions.length > SESSION_PREVIEW ? (
          <button
            type="button"
            onClick={() => setShowAllSessions((open) => !open)}
            aria-expanded={showAllSessions}
            className={`${btnSecondaryClass} mt-3 w-full`}
          >
            {showAllSessions
              ? 'Show fewer sessions'
              : `Show all ${sessions.length} sessions (${sessions.length - SESSION_PREVIEW} more)`}
          </button>
        ) : null}
      </section>
    </div>
  )
}
