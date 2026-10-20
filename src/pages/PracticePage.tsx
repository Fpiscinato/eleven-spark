import {
  AlertTriangle,
  Check,
  Lightbulb,
  Medal,
  RotateCcw,
  Sparkles,
  Square,
  Target,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QuestionView } from '../components/exam/QuestionView'
import { MathText } from '../components/exam/MathText'
import {
  AccuracyBar,
  ScreenHeader,
  btnPrimaryClass,
  btnSecondaryClass,
  cardClass,
} from '../components/ui'
import { db } from '../db/database'
import { useProfile } from '../context/ProfileContext'
import {
  SUBJECTS,
  type Attempt,
  type Difficulty,
  type Passage,
  type Question,
  type SectionBreakdownEntry,
  type SessionMode,
  type Subject,
} from '../db/schemas'
import { formatClock, uid } from '../lib/format'
import { getAllAttempts } from '../lib/stats'
import { SUBJECT_META } from '../lib/theme'
import { startSession } from '../lib/sessionHelpers'
import { generateFreshBatch } from '../generators'
import { celebrateSpecial } from '../components/brand/SpecialDedicationModal'
import { scheduleSync } from '../services/gistSync'
import type { NavParams, ScreenId } from '../types'

type SubjectFilter = 'all' | Subject
type DifficultyFilter = Difficulty | 'mixed'

const COUNT_OPTIONS = [5, 10, 15, 25] as const

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
  mode: SessionMode
  questions: Question[]
  passagesById: Map<string, Passage>
}

interface Outcome {
  selectedIndex: number
  isCorrect: boolean
  timeSeconds: number
}

interface SessionSummary {
  sessionId: string
  mode: SessionMode
  correct: number
  answered: number
  totalQuestions: number
  timeSeconds: number
  breakdown: SectionBreakdownEntry[]
  wrongQuestions: Question[]
}

interface PracticeRunnerProps {
  run: RunState
  profileId: string
  onFinished: (summary: SessionSummary) => void
}

function PracticeRunner({ run, profileId, onFinished }: PracticeRunnerProps) {
  const [index, setIndex] = useState(0)
  const [pending, setPending] = useState<number | null>(null)
  const [outcomes, setOutcomes] = useState<(Outcome | null)[]>(() =>
    run.questions.map(() => null),
  )
  const [paceMessage, setPaceMessage] = useState<{ correct: boolean; text: string } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const shownAtRef = useRef(0)
  const startedAtRef = useRef(0)
  const finishedRef = useRef(false)

  useEffect(() => {
    const startedAt = Date.now()
    startedAtRef.current = startedAt
    shownAtRef.current = startedAt
    const timer = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const question = run.questions[index]
  const passage = question.passageId ? run.passagesById.get(question.passageId) : undefined
  const outcome = outcomes[index]
  const isConfirmed = outcome !== null
  const isLast = index >= run.questions.length - 1

  const finalize = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    const answered = outcomes.filter((entry): entry is Outcome => entry !== null)
    const correct = answered.filter((entry) => entry.isCorrect).length
    const total = answered.length
    const bySubject = new Map<Subject, { correct: number; total: number; timeSeconds: number }>()
    run.questions.forEach((questionItem, questionIndex) => {
      const entry = outcomes[questionIndex]
      if (!entry) return
      const bucket = bySubject.get(questionItem.subject) ?? { correct: 0, total: 0, timeSeconds: 0 }
      bucket.total += 1
      if (entry.isCorrect) bucket.correct += 1
      bucket.timeSeconds += entry.timeSeconds
      bySubject.set(questionItem.subject, bucket)
    })
    const breakdown: SectionBreakdownEntry[] = [...bySubject.entries()].map(([subject, bucket]) => ({
      section: SUBJECT_META[subject].label,
      correct: bucket.correct,
      total: bucket.total,
      timeSeconds: bucket.timeSeconds,
    }))
    const wrongQuestions = run.questions.filter((_, questionIndex) => {
      const entry = outcomes[questionIndex]
      return entry !== null && !entry.isCorrect
    })
    const timeSeconds = Math.round((Date.now() - startedAtRef.current) / 1000)
    const scorePercentage = total === 0 ? 0 : Math.round((correct / total) * 100)
    void db.sessions
      .update(run.sessionId, {
        status: 'completed',
        completedAt: Date.now(),
        totalTimeSeconds: timeSeconds,
        scorePercentage,
        sectionBreakdown: breakdown,
      })
      .then(() => {
        onFinished({
          sessionId: run.sessionId,
          mode: run.mode,
          correct,
          answered: total,
          totalQuestions: run.questions.length,
          timeSeconds,
          breakdown,
          wrongQuestions,
        })
      })
  }, [outcomes, run, onFinished])

  const handleConfirm = useCallback(() => {
    if (pending === null || isConfirmed || finishedRef.current) return
    const timeSeconds = Math.max(0, Math.round((Date.now() - shownAtRef.current) / 1000))
    const isCorrect = pending === question.correctIndex
    const target = question.timeTargetSeconds
    const letter = ['A', 'B', 'C', 'D', 'E'][pending]
    void db.attempts.add({
      id: uid(),
      profileId,
      sessionId: run.sessionId,
      questionId: question.id,
      subject: question.subject,
      topic: question.topic,
      difficulty: question.difficulty,
      selectedIndex: pending,
      isCorrect,
      timeSpentSeconds: timeSeconds,
      flagged: false,
      timestamp: Date.now(),
    })
    setOutcomes((previous) => {
      const next = [...previous]
      next[index] = { selectedIndex: pending, isCorrect, timeSeconds }
      return next
    })
    if (isCorrect && timeSeconds <= target) {
      setPaceMessage({ correct: true, text: `Great pace! ${timeSeconds}s / target ${target}s` })
    } else if (isCorrect) {
      setPaceMessage({
        correct: true,
        text: `Right answer! ${timeSeconds}s / target ${target}s — try to speed up a little next time.`,
      })
    } else {
      setPaceMessage({
        correct: false,
        text: `Not quite — the correct answer is ${letter}. Have a look at the explanation below.`,
      })
    }
  }, [pending, isConfirmed, question, index, run.sessionId, profileId])

  const goNext = useCallback(() => {
    if (isLast) {
      finalize()
      return
    }
    setIndex((current) => current + 1)
    setPending(null)
    setPaceMessage(null)
    shownAtRef.current = Date.now()
  }, [isLast, finalize])

  const answeredCount = outcomes.filter((entry) => entry !== null).length
  const correctLetter = ['A', 'B', 'C', 'D', 'E'][question.correctIndex]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <div className="h-3 w-40 overflow-hidden rounded-full bg-slate-100 md:w-56">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${((index + 1) / run.questions.length) * 100}%` }}
            />
          </div>
          <span className="text-sm font-extrabold text-slate-600">
            {index + 1} / {run.questions.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-500 tabular-nums">{formatClock(elapsed)}</span>
          <button
            type="button"
            onClick={finalize}
            className={`${btnSecondaryClass} min-h-[44px] px-4 py-2 text-sm`}
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            Stop & save
          </button>
        </div>
      </div>

      <QuestionView
        key={question.id}
        question={question}
        passage={passage}
        questionNumber={index + 1}
        totalQuestions={run.questions.length}
        selectedIndex={isConfirmed ? outcome.selectedIndex : pending}
        onSelect={(optionIndex) => {
          if (!isConfirmed) setPending(optionIndex)
        }}
        locked={isConfirmed}
        showFeedback={isConfirmed}
      />

      {isConfirmed && paceMessage ? (
        <div
          className={`rounded-2xl border-2 px-4 py-3 text-base font-extrabold ${
            paceMessage.correct
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-rose-300 bg-rose-50 text-rose-800'
          }`}
          role="status"
        >
          <span className="flex items-center gap-2">
            {paceMessage.correct ? (
              <Check className="h-5 w-5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <MathText text={paceMessage.text} />
          </span>
        </div>
      ) : null}

      {isConfirmed ? (
        <div className={`${cardClass} flex gap-3`}>
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <Lightbulb className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="mb-1 text-sm font-black uppercase tracking-wide text-slate-500">Explanation</p>
            <p className="text-base font-semibold leading-relaxed text-slate-800">
              <MathText text={question.explanation} />
            </p>
            {!outcome.isCorrect ? (
              <p className="mt-2 text-sm font-extrabold text-emerald-700">
                Correct answer: {correctLetter} — {question.options[question.correctIndex]}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {isConfirmed ? (
        <button type="button" onClick={goNext} className={btnPrimaryClass}>
          {isLast ? 'See my results' : 'Next question'}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending === null}
          className={btnPrimaryClass}
        >
          <Check className="h-5 w-5" aria-hidden="true" />
          Confirm Answer
        </button>
      )}

      <p className="text-center text-sm font-bold text-slate-400">
        {answeredCount} of {run.questions.length} answered · take your time and read every option.
      </p>
    </div>
  )
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
  const [clinicIds, setClinicIds] = useState<Set<string>>(new Set())
  const [run, setRun] = useState<RunState | null>(null)
  const [summary, setSummary] = useState<SessionSummary | null>(null)

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
    const flagged = new Set<string>()
    for (const attempt of latestByQuestion.values()) {
      const question = questionById.get(attempt.questionId)
      if (!question) continue
      const slowerThanTarget = attempt.timeSpentSeconds > question.timeTargetSeconds
      if (!attempt.isCorrect || slowerThanTarget) {
        flagged.add(question.id)
      }
    }
    setClinicIds(flagged)
  }, [activeProfileId])

  useEffect(() => {
    void refreshBank()
  }, [refreshBank])

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

  const clinicQuestions = useMemo(
    () => allQuestions.filter((question) => clinicIds.has(question.id)),
    [allQuestions, clinicIds],
  )

  const beginRun = useCallback(
    async (questions: Question[], mode: SessionMode, extraPassages?: Passage[]) => {
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
      const sessionId = await startSession(mode, activeProfileId)
      setSummary(null)
      setRun({ sessionId, mode, questions: shuffle(questions), passagesById })
    },
    [activeProfileId],
  )

  const startConfiguredPractice = useCallback(() => {
    const chosen = filtered.slice(0, Math.min(count, filtered.length))
    void beginRun(chosen, 'quick_practice')
  }, [filtered, count, beginRun])

  const startFreshPractice = useCallback(() => {
    const batch = generateFreshBatch(count)
    void beginRun(batch.questions, 'quick_practice', batch.passages)
  }, [count, beginRun])

  const backToSetup = useCallback(() => {
    setRun(null)
    setSummary(null)
    void refreshBank()
  }, [refreshBank])

  if (run) {
    if (summary) {
      const percent = summary.answered === 0 ? 0 : Math.round((summary.correct / summary.answered) * 100)
      const medal = medalTier(percent, summary.answered)
      const avgTime = summary.answered === 0 ? 0 : Math.round(summary.timeSeconds / summary.answered)
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
    <div className="flex flex-col gap-5">
      <ScreenHeader
        title="Quick Practice"
        subtitle="Build your own training set, get instant feedback, and chase your medals."
      />

      <button
        type="button"
        onClick={() => void beginRun(clinicQuestions, 'mistake_clinic')}
        disabled={clinicQuestions.length === 0}
        className={`${cardClass} flex items-start gap-4 border-2 border-rose-300 bg-rose-50 text-left transition hover:border-rose-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-rose-600 text-white">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <p className="text-base font-black text-slate-900">
            Mistake Clinic (Review My Mistakes &amp; Slow Questions)
          </p>
          <p className="text-sm font-bold text-slate-600">
            {clinicQuestions.length === 0
              ? 'Nothing to review yet — finish a practice and anything you got wrong (or answered slowly) will appear here.'
              : `${clinicQuestions.length} question${clinicQuestions.length === 1 ? '' : 's'} ready: answered wrongly, or slower than the question target time.`}
          </p>
        </div>
      </button>

      <section className={cardClass}>
        <h2 className="mb-3 text-base font-black text-slate-900">Subject</h2>
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
          {SUBJECTS.map((subject) => (
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
      </section>

      <section className={cardClass}>
        <h2 className="mb-3 text-base font-black text-slate-900">Sub-topic</h2>
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

      <section className={cardClass}>
        <h2 className="mb-3 text-base font-black text-slate-900">Difficulty</h2>
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

      <section className={cardClass}>
        <h2 className="mb-3 text-base font-black text-slate-900">How many questions?</h2>
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

      <button
        type="button"
        onClick={startConfiguredPractice}
        disabled={filtered.length === 0}
        className={btnPrimaryClass}
      >
        <Zap className="h-5 w-5" aria-hidden="true" />
        Start practice
      </button>

      <button
        type="button"
        onClick={startFreshPractice}
        className={`${btnSecondaryClass} border-indigo-300 text-indigo-700 hover:border-indigo-500`}
      >
        <Sparkles className="h-5 w-5" aria-hidden="true" />
        ⚡ Generate Fresh Practice Questions
      </button>
    </div>
  )
}
