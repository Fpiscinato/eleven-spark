import {
  Check,
  CircleHelp,
  Medal,
  PencilLine,
  RotateCcw,
  Settings2,
  Sparkles,
  Stethoscope,
  Target,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BeaconWritingPanel } from '../components/exam/BeaconWritingPanel'
import { MathText } from '../components/exam/MathText'
import { PracticeRunner } from '../components/exam/PracticeRunner'
import {
  AccuracyBar,
  CollapsibleCard,
  ScreenHeader,
  btnPrimaryClass,
  btnSecondaryClass,
  cardClass,
} from '../components/ui'
import { db } from '../db/database'
import { useProfile } from '../context/ProfileContext'
import {
  CORE_SUBJECTS,
  OPTIONAL_SUBJECT_REASON,
  OPTIONAL_SUBJECTS,
  type Attempt,
  type Difficulty,
  type Passage,
  type Question,
  type Subject,
} from '../db/schemas'
import { formatClock } from '../lib/format'
import { getAllAttempts } from '../lib/stats'
import { SUBJECT_META } from '../lib/theme'
import { startSession } from '../lib/sessionHelpers'
import {
  readSession,
  removeSession,
  SESSION_KEYS,
  writeSession,
} from '../lib/sessionPersistence'
import { generateFreshBatch } from '../generators'
import { celebrateSpecial } from '../components/brand/SpecialDedicationModal'
import { scheduleSync } from '../services/gistSync'
import type { NavParams, ScreenId } from '../types'

type SubjectFilter = 'all' | Subject
type DifficultyFilter = Difficulty | 'mixed'

const COUNT_OPTIONS = [5, 10, 15, 25] as const
/** The "Quick 10 Mix" button always answers ten mixed questions. */
const QUICK_MIX_COUNT = 10

const DIFFICULTY_OPTIONS: { value: DifficultyFilter; label: string }[] = [
  { value: 1, label: 'Level 1 · Year 5 Foundation' },
  { value: 2, label: 'Level 2 · GL Standard' },
  { value: 3, label: "Level 3 · Pate's Stretch Challenge" },
  { value: 'mixed', label: 'Mixed levels' },
]

function humanizeTopic(topic: string): string {
  return topic
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function chipClass(active: boolean): string {
  return `min-h-[48px] rounded-2xl border-2 px-5 py-2.5 text-sm font-extrabold transition ${
    active
      ? 'border-indigo-600 bg-indigo-600 text-white'
      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
  }`
}

interface RunState {
  sessionId: string
  mode: 'quick_practice' | 'mistake_clinic'
  questions: Question[]
  passagesById: Map<string, Passage>
  writtenMode: boolean
}

/** One pending mistake, with the answer the child gave last time. */
interface BankEntry {
  question: Question
  attempt: Attempt
}

interface PracticeRunSnapshot {
  sessionId: string
  mode: RunState['mode']
  questionIds: string[]
  passageIds: string[]
  writtenMode?: boolean
}

function medalTier(percent: number, answered: number): { colour: string; bg: string; title: string } {
  if (answered === 0) {
    return {
      colour: 'text-slate-500',
      bg: 'bg-slate-100',
      title: 'No answers this time — that is okay, try again whenever you like!',
    }
  }
  if (percent === 100) {
    return { colour: 'text-amber-500', bg: 'bg-amber-100', title: 'Gold Medal — perfect score! Flawless!' }
  }
  if (percent >= 80) {
    return { colour: 'text-amber-500', bg: 'bg-amber-100', title: 'Gold Medal — outstanding work!' }
  }
  if (percent >= 60) {
    return { colour: 'text-slate-500', bg: 'bg-slate-100', title: 'Silver Medal — really solid effort!' }
  }
  return {
    colour: 'text-orange-700',
    bg: 'bg-orange-100',
    title: 'Bronze Medal — every try makes you stronger!',
  }
}

interface PracticePageProps {
  params: NavParams
  onNavigate: (screen: ScreenId, params?: NavParams) => void
}

export function PracticePage({ params, onNavigate }: PracticePageProps) {
  const { activeProfileId } = useProfile()
  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>(params.subject ?? 'all')
  const [topicFilter, setTopicFilter] = useState<string>(params.topic ?? 'all')
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('mixed')
  const [count, setCount] = useState<number>(5)
  const [writtenMode, setWrittenMode] = useState(false)
  const [bank, setBank] = useState<BankEntry[]>([])
  const [run, setRun] = useState<RunState | null>(null)
  const [summary, setSummary] = useState<{
    correct: number
    answered: number
    totalQuestions: number
    avgTimeSeconds: number
    timeSeconds: number
    breakdown: { section: string; correct: number; total: number; timeSeconds: number }[]
    wrongQuestions: Question[]
  } | null>(null)
  const [beaconDone, setBeaconDone] = useState(false)
  const [beaconResetKey, setBeaconResetKey] = useState(0)
  const [clinicOpen, setClinicOpen] = useState(false)
  const actionCardRef = useRef<HTMLDivElement>(null)
  const lastSeenRef = useRef<Map<string, Attempt>>(new Map())

  const refreshBank = useCallback(async () => {
    const [questionRows, attemptRows] = await Promise.all([
      db.questions.toArray(),
      getAllAttempts(activeProfileId),
    ])
    setAllQuestions(questionRows)
    const questionById = new Map(questionRows.map((question) => [question.id, question]))
    const latestByQuestion = new Map<string, Attempt>()
    for (const attempt of attemptRows) {
      const previous = latestByQuestion.get(attempt.questionId)
      if (!previous || attempt.timestamp > previous.timestamp) {
        latestByQuestion.set(attempt.questionId, attempt)
      }
    }
    const entries: BankEntry[] = []
    for (const attempt of latestByQuestion.values()) {
      const question = questionById.get(attempt.questionId)
      if (!question) continue
      const slowerThanTarget = attempt.timeSpentSeconds > question.timeTargetSeconds
      if (!attempt.isCorrect || slowerThanTarget) {
        entries.push({ question, attempt })
      }
    }
    entries.sort((a, b) => b.attempt.timestamp - a.attempt.timestamp)
    setBank(entries)
    lastSeenRef.current = latestByQuestion
  }, [activeProfileId])

  useEffect(() => {
    void refreshBank()
  }, [refreshBank])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const saved = readSession<PracticeRunSnapshot>(SESSION_KEYS.practiceRun)
      if (!saved) return
      const questionRows = await db.questions.bulkGet(saved.questionIds)
      const questions = questionRows.filter((question): question is Question => question !== undefined)
      if (questions.length === 0) {
        removeSession(SESSION_KEYS.practiceRun)
        return
      }
      const passageRows = saved.passageIds.length > 0 ? await db.passages.bulkGet(saved.passageIds) : []
      const passagesById = new Map<string, Passage>()
      for (const passage of passageRows) {
        if (passage) passagesById.set(passage.id, passage)
      }
      if (cancelled) return
      setRun({
        sessionId: saved.sessionId,
        mode: saved.mode,
        questions,
        passagesById,
        writtenMode: saved.writtenMode === true,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const topics = useMemo(() => {
    const values = new Set<string>()
    for (const question of allQuestions) {
      if (subjectFilter === 'all' || question.subject === subjectFilter) {
        values.add(question.topic)
      }
    }
    return [...values].sort()
  }, [allQuestions, subjectFilter])

  const filtered = useMemo(
    () =>
      allQuestions.filter(
        (question) =>
          (subjectFilter === 'all' || question.subject === subjectFilter) &&
          (topicFilter === 'all' || question.topic === topicFilter) &&
          (difficultyFilter === 'mixed' || question.difficulty === difficultyFilter),
      ),
    [allQuestions, subjectFilter, topicFilter, difficultyFilter],
  )

  const clinicQuestions = useMemo(() => bank.map((entry) => entry.question), [bank])

  const beginRun = useCallback(
    async (questions: Question[], mode: RunState['mode'], extraPassages?: Passage[]) => {
      if (questions.length === 0) return
      const passageIds = questions
        .map((question) => question.passageId)
        .filter((id): id is string => id !== undefined)
      const passages = passageIds.length > 0 ? await db.passages.bulkGet(passageIds) : []
      const passagesById = new Map<string, Passage>()
      for (const passage of passages) {
        if (passage) passagesById.set(passage.id, passage)
      }
      for (const passage of extraPassages ?? []) {
        passagesById.set(passage.id, passage)
      }
      const sessionId = await startSession(mode, activeProfileId, { writtenMode })
      const ordered = shuffle(questions)
      writeSession(SESSION_KEYS.practiceRun, {
        sessionId,
        mode,
        questionIds: ordered.map((question) => question.id),
        passageIds: [...passagesById.keys()],
        writtenMode,
      } satisfies PracticeRunSnapshot)
      setSummary(null)
      setRun({ sessionId, mode, questions: ordered, passagesById, writtenMode })
    },
    [activeProfileId, writtenMode],
  )

  const startConfiguredPractice = useCallback(() => {
    const size = Math.min(count, filtered.length)
    const shuffled = shuffle(filtered)
    const fresh = shuffled.filter((question) => !lastSeenRef.current.has(question.id))
    const repeated = shuffled.filter((question) => lastSeenRef.current.has(question.id))
    void beginRun([...fresh, ...repeated].slice(0, size), 'quick_practice')
  }, [filtered, count, beginRun])

  const startFreshPractice = useCallback(() => {
    const batch = generateFreshBatch(count)
    void beginRun(batch.questions, 'quick_practice', batch.passages)
  }, [count, beginRun])

  /** The "Quick 10 Mix": ten fresh questions, one tap, no setup. */
  const startQuickMix = useCallback(() => {
    const batch = generateFreshBatch(QUICK_MIX_COUNT)
    void beginRun(batch.questions, 'quick_practice', batch.passages)
  }, [beginRun])

  const backToSetup = useCallback(() => {
    setRun(null)
    setSummary(null)
    void refreshBank()
  }, [refreshBank])

  const subjectLabel =
    subjectFilter === 'all' ? 'All Subjects' : SUBJECT_META[subjectFilter].label
  const topicLabel = topicFilter === 'all' ? 'Mixed Topics' : humanizeTopic(topicFilter)
  const difficultyLabel =
    difficultyFilter === 'mixed'
      ? 'Mixed Levels'
      : DIFFICULTY_OPTIONS.find((option) => option.value === difficultyFilter)?.label ?? 'Mixed Levels'

  if (run) {
    if (summary) {
      const percent = summary.answered === 0 ? 0 : Math.round((summary.correct / summary.answered) * 100)
      const medal = medalTier(percent, summary.answered)
      const avgTime = summary.avgTimeSeconds
      return (
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          <ScreenHeader
            title="Training complete!"
            subtitle={
              summary.answered === 0
                ? 'No answers this time — that is okay, try again whenever you like!'
                : 'Here is how your session went.'
            }
          />
          <div className={`${cardClass} flex flex-col items-center gap-3`}>
            <div className={`grid h-16 w-16 place-items-center rounded-3xl ${medal.bg}`}>
              <Medal className={`h-9 w-9 ${medal.colour}`} aria-hidden="true" />
            </div>
            <p className="text-5xl font-black text-slate-900">
              {summary.answered === 0 ? '—' : `${percent}%`}
            </p>
            <p className="text-base font-bold text-slate-600">
              {summary.correct} correct out of {summary.answered} answered
              {summary.answered < summary.totalQuestions
                ? ` (${summary.totalQuestions - summary.answered} skipped)`
                : ''}
            </p>
            <p className="text-center text-base font-extrabold text-slate-800">{medal.title}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={cardClass}>
              <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-sky-100 text-sky-700">
                <Target className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-2xl font-black text-slate-900">{formatClock(avgTime)}</p>
              <p className="text-sm font-bold text-slate-600">Average per question</p>
            </div>
            <div className={cardClass}>
              <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
                <Zap className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-2xl font-black text-slate-900">{formatClock(summary.timeSeconds)}</p>
              <p className="text-sm font-bold text-slate-600">Total training time</p>
            </div>
          </div>
          {summary.breakdown.length > 0 ? (
            <div className={cardClass}>
              <p className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">By subject</p>
              <ul className="flex flex-col gap-3">
                {summary.breakdown.map((entry) => (
                  <li key={entry.section} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-sm font-extrabold text-slate-800">
                      <span>{entry.section}</span>
                      <span className="tabular-nums text-indigo-600">
                        {entry.correct}/{entry.total}
                      </span>
                    </div>
                    <AccuracyBar correct={entry.correct} total={entry.total} barClass="bg-indigo-600" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-col gap-3">
            {summary.wrongQuestions.length > 0 ? (
              <button
                type="button"
                onClick={() => void beginRun(summary.wrongQuestions, 'mistake_clinic')}
                className={btnPrimaryClass}
              >
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
                Practise the questions I got wrong ({summary.wrongQuestions.length})
              </button>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void beginRun(run.questions, run.mode)}
                className={`${btnSecondaryClass} flex-1`}
              >
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
                Practise again
              </button>
              <button type="button" onClick={backToSetup} className={`${btnSecondaryClass} flex-1`}>
                Change settings
              </button>
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className={`${btnSecondaryClass} flex-1`}
              >
                Home
              </button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <PracticeRunner
        key={run.sessionId}
        run={run}
        profileId={activeProfileId}
        onFinished={(nextSummary) => {
          removeSession(SESSION_KEYS.practiceRun)
          setSummary(nextSummary)
          void refreshBank()
          scheduleSync()
          if (nextSummary.answered > 0) {
            const percent = Math.round((nextSummary.correct / nextSummary.answered) * 100)
            if (percent === 100) {
              celebrateSpecial({
                title: '✨ Perfect Score!',
                message: `You got all ${nextSummary.correct} questions right. Flawless thinking!`,
              })
            } else if (nextSummary.answered >= 5 && percent >= 80) {
              celebrateSpecial({
                title: '🌟 Super Session!',
                message: `${percent}% correct — you are getting stronger every day!`,
              })
            }
          }
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <ScreenHeader
        title="Quick Practice"
        subtitle="Press start and go — everything else is tucked away until you need it."
      />

      {/* The action card is always on screen: the child never has to scroll
          down to find the button that starts the work. */}
      <div ref={actionCardRef} data-testid="practice-action-card">
        <section className={`${cardClass} border-2 border-indigo-200`}>
          <p className="text-xs font-black uppercase tracking-wide text-indigo-600">
            Your practice set
          </p>
          <p
            className="mt-1 text-xl font-black text-slate-900 md:text-2xl"
            data-testid="practice-selection-summary"
          >
            {subjectLabel} • {topicLabel} • {count} Questions
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-extrabold text-slate-600">
              {difficultyLabel}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-extrabold text-slate-600">
              {writtenMode ? 'Beacon Written Mode' : 'A–E Multiple Choice'}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-extrabold text-slate-600">
              {filtered.length} question{filtered.length === 1 ? '' : 's'} available
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={startConfiguredPractice}
              disabled={filtered.length === 0}
              className={`${btnPrimaryClass} flex-1 text-base`}
            >
              <span aria-hidden="true">▶️</span>
              Start Practice
            </button>
            <button
              type="button"
              onClick={startQuickMix}
              className={`${btnSecondaryClass} flex-1 border-indigo-300 text-indigo-700 hover:border-indigo-500`}
            >
              <Zap className="h-5 w-5" aria-hidden="true" />
              Quick 10 Mix
            </button>
          </div>
          <p className="mt-3 text-sm font-bold text-slate-500">
            <button
              type="button"
              onClick={startFreshPractice}
              className="inline-flex items-center gap-1 rounded-lg text-indigo-700 underline decoration-indigo-300 underline-offset-4 hover:text-indigo-900"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Generate {count} brand-new questions instead
            </button>
          </p>
        </section>
      </div>

      <CollapsibleCard
        id="customise"
        title="⚙️ Customise Practice (Subject, Topics, Question Count & Mode)"
        summary={`${subjectLabel} • ${topicLabel} • ${count} Questions`}
        icon={<Settings2 className="h-5 w-5" aria-hidden="true" />}
        tone="indigo"
      >
        <div className="flex flex-col gap-5">
          <section>
            <h3 className="mb-1 text-base font-black text-slate-900">Subject</h3>
            <p className="mb-3 text-sm font-bold text-slate-500">
              Core Gloucestershire FSCE subjects — these are the ones on the exam papers.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSubjectFilter('all')
                  setTopicFilter('all')
                }}
                className={chipClass(subjectFilter === 'all')}
              >
                All subjects
              </button>
              {CORE_SUBJECTS.map((subject) => (
                <button
                  key={subject}
                  type="button"
                  onClick={() => {
                    setSubjectFilter(subject)
                    setTopicFilter('all')
                  }}
                  className={chipClass(subjectFilter === subject)}
                >
                  {SUBJECT_META[subject].label}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                Optional Bonus (Not in Glos FSCE Exam)
              </p>
              <p className="mb-2 text-sm font-bold text-slate-600">{OPTIONAL_SUBJECT_REASON}</p>
              <div className="flex flex-wrap gap-2">
                {OPTIONAL_SUBJECTS.map((subject) => (
                  <button
                    key={subject}
                    type="button"
                    onClick={() => {
                      setSubjectFilter(subject)
                      setTopicFilter('all')
                    }}
                    className={chipClass(subjectFilter === subject)}
                  >
                    {SUBJECT_META[subject].label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-base font-black text-slate-900">Answer style</h3>
            <button
              type="button"
              onClick={() => setWrittenMode((value) => !value)}
              aria-pressed={writtenMode}
              className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-extrabold transition ${
                writtenMode
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
              }`}
            >
              <PencilLine className="h-5 w-5 shrink-0" aria-hidden="true" />
              ✍️ Beacon Written Mode (Type Answer without Options)
            </button>
            <p className="mt-2 text-sm font-bold text-slate-500">
              {writtenMode
                ? 'Beacon is on: Maths and Cloze/Spelling questions need a typed number or word before the answer is revealed.'
                : 'Beacon is off: every question uses the A–E answer boxes.'}
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-base font-black text-slate-900">Sub-topic</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTopicFilter('all')}
                className={chipClass(topicFilter === 'all')}
              >
                All topics
              </button>
              {topics.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setTopicFilter(topic)}
                  className={chipClass(topicFilter === topic)}
                >
                  {humanizeTopic(topic)}
                </button>
              ))}
            </div>
            {topics.length === 0 ? (
              <p className="mt-3 text-sm font-bold text-slate-500">
                No topics available for this subject yet.
              </p>
            ) : null}
          </section>

          <section>
            <h3 className="mb-3 text-base font-black text-slate-900">Difficulty</h3>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTY_OPTIONS.map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => setDifficultyFilter(option.value)}
                  className={chipClass(difficultyFilter === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-base font-black text-slate-900">How many questions?</h3>
            <div className="flex flex-wrap gap-2">
              {COUNT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCount(option)}
                  className={`${chipClass(count === option)} min-w-[72px] text-base`}
                >
                  {option}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm font-bold text-slate-500">
              {filtered.length === 0
                ? 'No questions match these settings yet — try a different subject, topic or difficulty.'
                : `${filtered.length} question${filtered.length === 1 ? '' : 's'} match your settings. We will use up to ${Math.min(count, filtered.length)}.`}
            </p>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={startConfiguredPractice}
              disabled={filtered.length === 0}
              className={`${btnPrimaryClass} flex-1`}
            >
              <span aria-hidden="true">▶️</span>
              Start Practice
            </button>
            <button
              type="button"
              onClick={startFreshPractice}
              className={`${btnSecondaryClass} flex-1 border-indigo-300 text-indigo-700 hover:border-indigo-500`}
            >
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              ⚡ Generate Fresh Practice Questions
            </button>
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        id="clinic"
        title="🩺 Mistake Clinic & Mistake Bank"
        summary={
          bank.length === 0
            ? 'No pending mistakes — your bank is empty.'
            : `${bank.length} pending mistake${bank.length === 1 ? '' : 's'} waiting to be fixed.`
        }
        icon={<Stethoscope className="h-5 w-5" aria-hidden="true" />}
        tone="rose"
        open={clinicOpen}
        onOpenChange={setClinicOpen}
        headerAction={
          <button
            type="button"
            onClick={() => {
              setClinicOpen(true)
              void beginRun(clinicQuestions, 'mistake_clinic')
            }}
            disabled={clinicQuestions.length === 0}
            className={`${btnPrimaryClass} !min-h-[44px] !px-3 !py-2 text-sm`}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Fix Mistakes Now
          </button>
        }
      >
        {bank.length === 0 ? (
          <p className="text-sm font-bold text-slate-600">
            Nothing to review yet — finish a practice and anything you got wrong (or answered slowly)
            will appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {bank.slice(0, 6).map((entry) => (
              <li
                key={entry.question.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${SUBJECT_META[entry.question.subject].badgeClass}`}
                  >
                    {SUBJECT_META[entry.question.subject].label}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-bold text-slate-600">
                    {humanizeTopic(entry.question.topic)}
                  </span>
                  {entry.attempt.isCorrect ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-900">
                      Too slow ({entry.attempt.timeSpentSeconds}s)
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-extrabold text-rose-800">
                      Answered wrongly
                    </span>
                  )}
                </div>
                <p className="mb-2 line-clamp-3 text-sm font-bold text-slate-800">
                  <MathText
                    text={
                      entry.question.stem.length > 180
                        ? `${entry.question.stem.slice(0, 180)}…`
                        : entry.question.stem
                    }
                  />
                </p>
                <button
                  type="button"
                  onClick={() => void beginRun([entry.question], 'mistake_clinic')}
                  className={`${btnSecondaryClass} !min-h-[44px] !px-3 !py-1.5 text-xs`}
                >
                  Practise this one
                </button>
              </li>
            ))}
            {bank.length > 6 ? (
              <p className="text-sm font-bold text-slate-500">
                Showing the 6 most recent of {bank.length} pending mistakes — “Fix Mistakes Now”
                practises all of them.
              </p>
            ) : null}
          </ul>
        )}
      </CollapsibleCard>

      <CollapsibleCard
        id="beacon"
        title="✍️ Beacon Creative Writing Studio"
        summary="Guided task: plan, write, then tick the checklist."
        icon={<CircleHelp className="h-5 w-5" aria-hidden="true" />}
        tone="amber"
      >
        {beaconDone ? (
          <div
            className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3"
            role="status"
          >
            <p className="text-sm font-extrabold text-emerald-800">
              Your Beacon writing is submitted and saved. Close this card to start a practice set.
            </p>
            <button
              type="button"
              onClick={() => {
                setBeaconDone(false)
                setBeaconResetKey((value) => value + 1)
              }}
              className={`${btnSecondaryClass} ml-auto min-h-[44px] px-3 py-1.5 text-xs`}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Write another piece
            </button>
          </div>
        ) : null}
        <BeaconWritingPanel
          resetKey={beaconResetKey}
          onSubmitted={() => {
            setBeaconDone(true)
            // The child is taken straight back to the action card so she can
            // start a new set without hunting for the button.
            window.setTimeout(() => {
              actionCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 60)
          }}
        />
      </CollapsibleCard>

      <p className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500">
        <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        Every question has five options (A–E), just like the real Gloucestershire FSCE papers.
      </p>
    </div>
  )
}
