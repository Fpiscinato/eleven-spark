import { BarChart3, Flame, Rocket, Timer, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../db/database'
import { useProfile } from '../context/ProfileContext'
import { useParentGate } from '../context/ParentGateContext'
import type { Attempt, Session, Subject } from '../db/schemas'
import { SUBJECTS } from '../db/schemas'
import { getCompletedSessions, getAllAttempts } from '../lib/stats'
import { averageSeconds } from '../lib/timing'
import { SUBJECT_META } from '../lib/theme'
import { computeRoadmap, masteryFor, type RoadmapSnapshot } from '../utils/roadmapCalculator'
import { EmptyState, PageSpinner, ScreenHeader, btnSecondaryClass, cardClass } from '../components/ui'
import { PhaseCards } from '../components/PhaseCards'
import type { NavParams, ScreenId } from '../types'

interface AnalyticsPageProps {
  onNavigate: (screen: ScreenId, params?: NavParams) => void
}

type MatrixClass = 'mastered' | 'speed' | 'developing' | 'rushing' | 'study'

interface TopicCell {
  subject: Subject
  topic: string
  total: number
  accuracy: number
  avgTimeSeconds: number
  avgTargetSeconds: number
  matrixClass: MatrixClass
}

const MIN_ATTEMPTS_PER_TOPIC = 3
const ON_PACE_RATIO = 1.2
const TOPIC_PREVIEW = 6

const QUALIFYING_GOAL = 75
const TOP_SCHOOL_GOAL = 85
const MOCK_MODES = new Set(['mock_paper_1', 'mock_paper_2', 'mini_mock'])

const CLASS_META: Record<MatrixClass, { emoji: string; label: string; cellClass: string }> = {
  mastered: { emoji: '🟢', label: 'Mastered', cellClass: 'border-emerald-300 bg-emerald-50' },
  speed: { emoji: '🟡', label: 'Needs Speed', cellClass: 'border-amber-300 bg-amber-50' },
  developing: { emoji: '🟦', label: 'Developing', cellClass: 'border-sky-300 bg-sky-50' },
  rushing: { emoji: '🟠', label: 'Rushing / Guessing', cellClass: 'border-orange-300 bg-orange-50' },
  study: { emoji: '🔴', label: 'Needs Study', cellClass: 'border-rose-300 bg-rose-50' },
}

type StudentBucket = 'mastered' | 'speed_booster' | 'growing'

const STUDENT_META: Record<StudentBucket, { emoji: string; label: string; cellClass: string; blurb: string }> = {
  mastered: {
    emoji: '🌟',
    label: 'Mastered',
    cellClass: 'border-emerald-300 bg-emerald-50',
    blurb: 'Great accuracy and pace — keep these glowing!',
  },
  speed_booster: {
    emoji: '⚡',
    label: 'Speed Booster',
    cellClass: 'border-amber-300 bg-amber-50',
    blurb: 'You know these — a little more speed and they are yours.',
  },
  growing: {
    emoji: '🌱',
    label: 'Growing Skill',
    cellClass: 'border-sky-300 bg-sky-50',
    blurb: 'Every expert started here. Practise a little every day!',
  },
}

function studentBucketFor(cell: TopicCell): StudentBucket {
  const label = masteryFor(cell.accuracy, cell.avgTimeSeconds <= cell.avgTargetSeconds * ON_PACE_RATIO ? 100 : 0, cell.total)
  if (label === 'mastered') return 'mastered'
  if (label === 'speed_booster') return 'speed_booster'
  return 'growing'
}

function classify(accuracy: number, onPace: boolean): MatrixClass {
  if (accuracy >= 80) return onPace ? 'mastered' : 'speed'
  if (accuracy >= 65) return 'developing'
  return onPace ? 'rushing' : 'study'
}

function shortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function MockScoreChart({ sessions, showGoals }: { sessions: Session[]; showGoals: boolean }) {
  const width = 640
  const height = 280
  const padLeft = 44
  const padRight = 16
  const padTop = 18
  const padBottom = 34
  const plotWidth = width - padLeft - padRight
  const plotHeight = height - padTop - padBottom

  const yFor = (score: number) => padTop + ((100 - score) / 100) * plotHeight
  const xFor = (index: number) =>
    sessions.length === 1 ? padLeft + plotWidth / 2 : padLeft + (index / (sessions.length - 1)) * plotWidth

  const points = sessions.map((session, index) => ({
    x: xFor(index),
    y: yFor(session.scorePercentage),
    session,
  }))
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')
  const showPointLabels = sessions.length <= 10

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Chart of mock exam scores over time"
    >
      {[0, 50, 100].map((tick) => (
        <g key={tick}>
          <line
            x1={padLeft}
            y1={yFor(tick)}
            x2={width - padRight}
            y2={yFor(tick)}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <text x={padLeft - 8} y={yFor(tick) + 4} textAnchor="end" fontSize="11" fontWeight="700" fill="#94a3b8">
            {tick}%
          </text>
        </g>
      ))}

      <line
        x1={padLeft}
        y1={yFor(TOP_SCHOOL_GOAL)}
        x2={width - padRight}
        y2={yFor(TOP_SCHOOL_GOAL)}
        stroke="#7c3aed"
        strokeWidth="2"
        strokeDasharray="6 5"
        opacity={showGoals ? 1 : 0}
      />
      <text x={width - padRight} y={yFor(TOP_SCHOOL_GOAL) - 6} textAnchor="end" fontSize="11" fontWeight="800" fill="#7c3aed" opacity={showGoals ? 1 : 0}>
        {TOP_SCHOOL_GOAL}% Pate's / Stroud High target
      </text>

      <line
        x1={padLeft}
        y1={yFor(QUALIFYING_GOAL)}
        x2={width - padRight}
        y2={yFor(QUALIFYING_GOAL)}
        stroke="#0d9488"
        strokeWidth="2"
        strokeDasharray="6 5"
        opacity={showGoals ? 1 : 0}
      />
      <text x={width - padRight} y={yFor(QUALIFYING_GOAL) - 6} textAnchor="end" fontSize="11" fontWeight="800" fill="#0d9488" opacity={showGoals ? 1 : 0}>
        {QUALIFYING_GOAL}% qualifying
      </text>

      {points.length > 1 ? (
        <polyline points={polyline} fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      ) : null}

      {points.map((point) => (
        <g key={point.session.id}>
          <circle cx={point.x} cy={point.y} r="6" fill="#4f46e5" stroke="#ffffff" strokeWidth="2.5" />
          {showPointLabels ? (
            <text x={point.x} y={point.y - 12} textAnchor="middle" fontSize="12" fontWeight="800" fill="#312e81">
              {point.session.scorePercentage}%
            </text>
          ) : null}
          <text x={point.x} y={height - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill="#94a3b8">
            {shortDate(point.session.startedAt)}
          </text>
        </g>
      ))}
    </svg>
  )
}

/** Turns a stored topic id such as `word_classes` into "Word Classes". */
function humanizeTopic(topic: string): string {
  return topic
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function TopicChip({
  cell,
  onNavigate,
}: {
  cell: TopicCell
  onNavigate: (screen: ScreenId, params?: NavParams) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate('practice', { subject: cell.subject, topic: cell.topic })}
      className="flex min-h-[48px] w-full items-start justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-indigo-300 hover:bg-indigo-50 active:scale-[0.99]"
      title={`Practise ${cell.topic}`}
    >
      <span className="min-w-0 flex-1">
        {/* The topic is the part that changes from chip to chip, so it comes
            first and is allowed to wrap instead of being cut off. */}
        <span className="block text-sm font-extrabold leading-snug break-words text-slate-800">
          {humanizeTopic(cell.topic)}
        </span>
        <span className="mt-0.5 block text-xs font-bold text-slate-500">
          {SUBJECT_META[cell.subject].label} · {cell.total} answered · {cell.avgTimeSeconds}s vs{' '}
          {cell.avgTargetSeconds}s target
        </span>
      </span>
      <span className="shrink-0 rounded-xl bg-indigo-100 px-2 py-1 text-sm font-black text-indigo-700">
        {cell.accuracy}%
      </span>
    </button>
  )
}

export function AnalyticsPage({ onNavigate }: AnalyticsPageProps) {
  const { activeProfileId } = useProfile()
  const { parentMode } = useParentGate()
  const [loading, setLoading] = useState(true)
  const [mockSessions, setMockSessions] = useState<Session[]>([])
  const [cells, setCells] = useState<TopicCell[]>([])
  const [roadmap, setRoadmap] = useState<RoadmapSnapshot | null>(null)
  const [showAllTopics, setShowAllTopics] = useState(false)
  const [showMatrix, setShowMatrix] = useState(false)

  const load = useCallback(async () => {
    const [attempts, sessions] = await Promise.all([
      getAllAttempts(activeProfileId),
      getCompletedSessions(activeProfileId),
    ])

    const mocks = sessions
      .filter((session) => MOCK_MODES.has(session.mode))
      .sort((a, b) => a.startedAt - b.startedAt)

    const questionIds = [...new Set(attempts.map((attempt) => attempt.questionId))]
    const questions = questionIds.length > 0 ? await db.questions.bulkGet(questionIds) : []
    const targetById = new Map<string, number>()
    for (const question of questions) {
      if (question) targetById.set(question.id, question.timeTargetSeconds)
    }

    const byTopic = new Map<string, Attempt[]>()
    for (const attempt of attempts) {
      const key = `${attempt.subject}::${attempt.topic}`
      const list = byTopic.get(key)
      if (list) list.push(attempt)
      else byTopic.set(key, [attempt])
    }

    const topicCells: TopicCell[] = []
    for (const [key, list] of byTopic) {
      if (list.length < MIN_ATTEMPTS_PER_TOPIC) continue
      const separatorIndex = key.indexOf('::')
      if (separatorIndex <= 0) continue
      const subject = key.slice(0, separatorIndex) as Subject
      if (!(SUBJECTS as readonly string[]).includes(subject)) continue
      const topic = key.slice(separatorIndex + 2)

      const questionIdSet = new Set(list.map((attempt) => attempt.questionId))
      let targetSum = 0
      let targetCount = 0
      for (const questionId of questionIdSet) {
        const target = targetById.get(questionId)
        if (target !== undefined) {
          targetSum += target
          targetCount += 1
        }
      }
      if (targetCount === 0) continue

      const correct = list.filter((attempt) => attempt.isCorrect).length
      const accuracy = Math.round((correct / list.length) * 100)
      const avgTimeSeconds = averageSeconds(list.map((attempt) => attempt.timeSpentSeconds))
      const avgTargetSeconds = Math.round(targetSum / targetCount)
      const onPace = avgTimeSeconds <= avgTargetSeconds * ON_PACE_RATIO

      topicCells.push({
        subject,
        topic,
        total: list.length,
        accuracy,
        avgTimeSeconds,
        avgTargetSeconds,
        matrixClass: classify(accuracy, onPace),
      })
    }

    const subjectOrder = new Map<string, number>()
    SUBJECTS.forEach((subject, index) => subjectOrder.set(subject, index))
    topicCells.sort((a, b) => {
      const subjectDiff = (subjectOrder.get(a.subject) ?? 99) - (subjectOrder.get(b.subject) ?? 99)
      if (subjectDiff !== 0) return subjectDiff
      return a.accuracy - b.accuracy
    })

    setMockSessions(mocks)
    setCells(topicCells)

    const allSessions = await db.sessions.where('profileId').equals(activeProfileId).toArray()
    setRoadmap(computeRoadmap({ attempts, sessions: allSessions, questionTimeTargets: targetById }))
    setLoading(false)
  }, [activeProfileId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <PageSpinner label="Crunching your numbers..." />
  }

  const cellFor = (matrixClass: MatrixClass): TopicCell[] =>
    cells.filter((cell) => cell.matrixClass === matrixClass)

  const studentCells = (bucket: StudentBucket): TopicCell[] =>
    cells.filter((cell) => studentBucketFor(cell) === bucket)

  if (!parentMode) {
    return (
      <div className="mx-auto max-w-4xl">
        <ScreenHeader
          title="My Progress"
          subtitle="Look how much you have learned! Every topic gets a friendly badge."
        />

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {(Object.keys(STUDENT_META) as StudentBucket[]).map((bucket) => {
            const meta = STUDENT_META[bucket]
            const count = studentCells(bucket).length
            return (
              <div key={bucket} className={`rounded-3xl border-2 p-4 ${meta.cellClass}`}>
                <p className="text-2xl" aria-hidden="true">{meta.emoji}</p>
                <p className="text-lg font-black text-slate-900">{meta.label}</p>
                <p className="text-3xl font-black text-slate-900">{count}</p>
                <p className="text-xs font-bold text-slate-600">{meta.blurb}</p>
              </div>
            )
          })}
        </div>

        {roadmap ? (
          <div className="mb-5">
            <PhaseCards roadmap={roadmap} />
          </div>
        ) : null}

        {cells.length === 0 ? (
          <section className={cardClass}>
            <EmptyState
              icon={Rocket}
              title="Your adventure starts here"
              body={`Answer at least ${MIN_ATTEMPTS_PER_TOPIC} questions on a topic and it will appear here with a friendly badge.`}
            />
          </section>
        ) : (
          <section className={cardClass}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-black text-slate-900">Your topics</h2>
              {cells.length > TOPIC_PREVIEW ? (
                <button
                  type="button"
                  onClick={() => setShowAllTopics((open) => !open)}
                  aria-expanded={showAllTopics}
                  className={btnSecondaryClass}
                >
                  {showAllTopics
                    ? 'Show fewer topics'
                    : `Show all ${cells.length} topics (${cells.length - TOPIC_PREVIEW} more)`}
                </button>
              ) : null}
            </div>
            <div className="flex flex-col gap-4">
              {(Object.keys(STUDENT_META) as StudentBucket[]).map((bucket) => {
                const meta = STUDENT_META[bucket]
                const bucketCells = studentCells(bucket)
                if (bucketCells.length === 0) return null
                // Collapsed mode shows a few topics per group; nothing is cut
                // off halfway, the "Show all" button opens the rest.
                const visible = showAllTopics ? bucketCells : bucketCells.slice(0, TOPIC_PREVIEW)
                if (visible.length === 0) return null
                return (
                  <div key={bucket}>
                    <p className="mb-2 text-sm font-black text-slate-700">
                      {meta.emoji} {meta.label}
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {visible.map((cell) => (
                        <TopicChip key={`${cell.subject}-${cell.topic}`} cell={cell} onNavigate={onNavigate} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-xs font-bold text-slate-500">
              Tap any topic above to practise it right away.
            </p>
          </section>
        )}

      </div>
    )
  }

  const qualifyingMet = mockSessions.filter((session) => session.scorePercentage >= QUALIFYING_GOAL).length
  const topSchoolMet = mockSessions.filter((session) => session.scorePercentage >= TOP_SCHOOL_GOAL).length
  const mockAverage =
    mockSessions.length === 0
      ? 0
      : Math.round(mockSessions.reduce((sum, session) => sum + session.scorePercentage, 0) / mockSessions.length)

  return (
    <div className="mx-auto max-w-4xl">
      <ScreenHeader
        title="Analytics"
        subtitle="Mock scores against the Gloucestershire goals, and every topic sorted by accuracy and pace."
      />

      <section className={`${cardClass} mb-5`}>
        <p className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Parent diagnostic summary</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-2xl font-black text-slate-900">{mockAverage}%</p>
            <p className="text-xs font-bold text-slate-600">Mock average (all papers)</p>
          </div>
          <div className="rounded-2xl border border-teal-200 bg-teal-50 p-3">
            <p className="text-2xl font-black text-teal-800">{qualifyingMet}</p>
            <p className="text-xs font-bold text-teal-700">
              Papers at {QUALIFYING_GOAL}%+ (Gloucestershire qualifying)
            </p>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3">
            <p className="text-2xl font-black text-violet-800">{topSchoolMet}</p>
            <p className="text-xs font-bold text-violet-700">Papers at {TOP_SCHOOL_GOAL}%+ (Pate's target)</p>
          </div>
        </div>
      </section>

      {roadmap ? (
        <section className={`${cardClass} mb-5`}>
          <PhaseCards roadmap={roadmap} />
        </section>
      ) : null}

      <section className={`${cardClass} mb-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
              <TrendingUp className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Mock score over time</h2>
              <p className="text-xs font-bold text-slate-500">
                Every completed Adventure, Beacon, Compass and Mini-Mock paper
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-extrabold text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-6 bg-teal-600" style={{ borderTop: '2px dashed #0d9488' }} />
              75% qualifying
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-6" style={{ borderTop: '2px dashed #7c3aed' }} />
              85% top schools
            </span>
          </div>
        </div>
        {mockSessions.length === 0 ? (
          <EmptyState
            icon={Rocket}
            title="No mock papers yet"
            body="Complete a mock exam and your scores will be plotted here against the 75% and 85% goal lines."
          />
        ) : (
          <MockScoreChart sessions={mockSessions} showGoals />
        )}
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-100 text-amber-800">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Accuracy vs pace, by topic</h2>
              <p className="text-xs font-bold text-slate-500">Tap any topic to practise it right away</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-500">
            <Timer className="h-4 w-4" aria-hidden="true" />
            Pace = your average vs the question target time
          </div>
        </div>

        {cells.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="Not enough answers yet"
            body={`Answer at least ${MIN_ATTEMPTS_PER_TOPIC} questions on a topic and it will appear in the matrix with a shortcut to practise it.`}
          />
        ) : (
          <>
          {cells.length > TOPIC_PREVIEW ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold text-slate-500">
                {cells.length} topics with enough answers for a verdict.
              </p>
              <button
                type="button"
                onClick={() => setShowMatrix((open) => !open)}
                aria-expanded={showMatrix}
                className={btnSecondaryClass}
              >
                {showMatrix ? 'Hide the full matrix' : `Show the full matrix (${cells.length} topics)`}
              </button>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-400">
                Strong (80–100%)
              </p>
            </div>
            <div className={`rounded-2xl border-2 p-3 ${CLASS_META.mastered.cellClass}`}>
              <p className="mb-2 text-sm font-black text-slate-800">
                {CLASS_META.mastered.emoji} {CLASS_META.mastered.label}
              </p>
              <div className="space-y-2">
                {cellFor('mastered').map((cell) => (
                  <TopicChip key={`${cell.subject}-${cell.topic}`} cell={cell} onNavigate={onNavigate} />
                ))}
                {cellFor('mastered').length === 0 ? (
                  <p className="text-xs font-bold text-slate-500">Nothing here yet.</p>
                ) : null}
              </div>
            </div>
            <div className={`rounded-2xl border-2 p-3 ${CLASS_META.speed.cellClass}`}>
              <p className="mb-2 text-sm font-black text-slate-800">
                {CLASS_META.speed.emoji} {CLASS_META.speed.label}
              </p>
              <div className="space-y-2">
                {cellFor('speed').map((cell) => (
                  <TopicChip key={`${cell.subject}-${cell.topic}`} cell={cell} onNavigate={onNavigate} />
                ))}
                {cellFor('speed').length === 0 ? (
                  <p className="text-xs font-bold text-slate-500">Nothing here yet.</p>
                ) : null}
              </div>
            </div>

            {showMatrix ? (
              <>
            <div className="md:col-span-2">
              <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-400">
                Developing (65–79%)
              </p>
            </div>
            <div className={`rounded-2xl border-2 p-3 md:col-span-2 ${CLASS_META.developing.cellClass}`}>
              <p className="mb-2 text-sm font-black text-slate-800">
                {CLASS_META.developing.emoji} {CLASS_META.developing.label} — nearly there, keep practising
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {cellFor('developing').map((cell) => (
                  <TopicChip key={`${cell.subject}-${cell.topic}`} cell={cell} onNavigate={onNavigate} />
                ))}
                {cellFor('developing').length === 0 ? (
                  <p className="text-xs font-bold text-slate-500">Nothing here yet.</p>
                ) : null}
              </div>
            </div>

            <div className="md:col-span-2">
              <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-400">
                Needs work (0–64%)
              </p>
            </div>
            <div className={`rounded-2xl border-2 p-3 ${CLASS_META.rushing.cellClass}`}>
              <p className="mb-2 text-sm font-black text-slate-800">
                {CLASS_META.rushing.emoji} {CLASS_META.rushing.label}
              </p>
              <div className="space-y-2">
                {cellFor('rushing').map((cell) => (
                  <TopicChip key={`${cell.subject}-${cell.topic}`} cell={cell} onNavigate={onNavigate} />
                ))}
                {cellFor('rushing').length === 0 ? (
                  <p className="text-xs font-bold text-slate-500">Nothing here yet.</p>
                ) : null}
              </div>
            </div>
            <div className={`rounded-2xl border-2 p-3 ${CLASS_META.study.cellClass}`}>
              <p className="mb-2 text-sm font-black text-slate-800">
                {CLASS_META.study.emoji} {CLASS_META.study.label}
              </p>
              <div className="space-y-2">
                {cellFor('study').map((cell) => (
                  <TopicChip key={`${cell.subject}-${cell.topic}`} cell={cell} onNavigate={onNavigate} />
                ))}
                {cellFor('study').length === 0 ? (
                  <p className="text-xs font-bold text-slate-500">Nothing here yet.</p>
                ) : null}
              </div>
            </div>
              </>
            ) : null}
          </div>
          </>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-600">
            <Flame className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Weakest topics first — practise a red or orange chip for the biggest gains.
          </p>
        </div>
      </section>
    </div>
  )
}
