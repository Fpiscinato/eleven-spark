import {
  AlertTriangle,
  Brain,
  Check,
  Lightbulb,
  Medal,
  PencilLine,
  RotateCcw,
  Sparkles,
  Square,
  Target,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BeaconWritingPanel } from '../components/exam/BeaconWritingPanel'
import { LearnHowToSolve, QuickExplanation } from '../components/exam/AnswerHelp'
import { QuestionView } from '../components/exam/QuestionView'
import { ScratchpadOverlay } from '../components/exam/ScratchpadOverlay'
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
  CORE_SUBJECTS,
  OPTIONAL_SUBJECT_REASON,
  OPTIONAL_SUBJECTS,
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
import { averageSeconds, capTimeSpent } from '../lib/timing'
import { SUBJECT_META } from '../lib/theme'
import { startSession } from '../lib/sessionHelpers'
import { isWrittenAnswerCorrect } from '../lib/writtenAnswer'
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
  writtenMode: boolean
}

interface Outcome {
  selectedIndex: number | null
  isCorrect: boolean
  timeSeconds: number
  writtenAnswer?: string
}

interface PracticeProgress {
  index: number
  pending: number | null
  outcomes: (Outcome | null)[]
  startedAt: number
}

interface PracticeRunSnapshot {
  sessionId: string
  mode: SessionMode
  questionIds: string[]
  passageIds: string[]
  writtenMode?: boolean
}

interface SessionSummary {
  sessionId: string
  mode: SessionMode
  correct: number
  answered: number
  totalQuestions: number
  timeSeconds: number
  avgTimeSeconds: number
  breakdown: SectionBreakdownEntry[]
  wrongQuestions: Question[]
}

type HelpView = 'none' | 'quick' | 'tutorial'

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
  const [helpView, setHelpView] = useState<HelpView>('none')
  const [elapsed, setElapsed] = useState(0)
  const [timerRunning, setTimerRunning] = useState(true)
  const [scratchOpen, setScratchOpen] = useState(false)
  const shownAtRef = useRef(0)
  const startedAtRef = useRef(0)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)
  const endedAtRef = useRef<number | null>(null)
  const finishedRef = useRef(false)
  const progressKey = `${SESSION_KEYS.practiceProgress}${run.sessionId}`

  useEffect(() => {
    const saved = readSession<PracticeProgress>(progressKey)
    const startedAt = saved?.startedAt ?? Date.now()
    startedAtRef.current = startedAt
    shownAtRef.current = Date.now()
    if (saved) {
      setIndex(Math.min(saved.index, run.questions.length - 1))
      setPending(saved.pending)
      setOutcomes(saved.outcomes)
    }
    setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)))
    // The saved progress is only read once, when the runner opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!timerRunning) return
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [timerRunning])

  useEffect(() => {
    writeSession(progressKey, {
      index,
      pending,
      outcomes,
      startedAt: startedAtRef.current,
    } satisfies PracticeProgress)
  }, [progressKey, index, pending, outcomes])

  const question = run.questions[index]
  const passage = question.passageId ? run.passagesById.get(question.passageId) : undefined
  const outcome = outcomes[index]
  const isConfirmed = outcome !== null
  const isLast = index >= run.questions.length - 1

  /**
   * Stops the session clock. This is called the moment the very last question
   * is answered, so the timers are finalised without waiting for the
   * "finish" button to be pressed.
   */
  const stopTimers = useCallback(() => {
    if (endedAtRef.current !== null) return
    endedAtRef.current = Date.now()
    setTimerRunning(false)
    setElapsed(Math.max(0, Math.round((endedAtRef.current - startedAtRef.current) / 1000)))
  }, [])

  const finalize = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    stopTimers()
    removeSession(`${SESSION_KEYS.practiceProgress}${run.sessionId}`)
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
    const endedAt = endedAtRef.current ?? Date.now()
    const timeSeconds = Math.max(0, Math.round((endedAt - startedAtRef.current) / 1000))
    const avgTimeSeconds = averageSeconds(answered.map((entry) => entry.timeSeconds))
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
          avgTimeSeconds,
          breakdown,
          wrongQuestions,
        })
      })
  }, [outcomes, run, onFinished, stopTimers])

  const isWrittenQuestion = run.writtenMode && question.answerType === 'short_text'

  const handleWriteConfirm = useCallback(
    (value: string) => {
      if (isConfirmed || finishedRef.current) return
      const trimmed = value.trim()
      if (trimmed === '') return
      const rawSeconds = Math.max(0, Math.round((Date.now() - shownAtRef.current) / 1000))
      const timeSeconds = capTimeSpent(rawSeconds)
      const isCorrect = isWrittenAnswerCorrect(question, trimmed)
      const target = question.timeTargetSeconds
      void db.attempts.add({
        id: uid(),
        profileId,
        sessionId: run.sessionId,
        questionId: question.id,
        subject: question.subject,
        topic: question.topic,
        difficulty: question.difficulty,
        selectedIndex: null,
        writtenAnswer: trimmed,
        isCorrect,
        timeSpentSeconds: timeSeconds,
        flagged: false,
        timestamp: Date.now(),
      })
      setOutcomes((previous) => {
        const next = [...previous]
        next[index] = { selectedIndex: null, isCorrect, timeSeconds, writtenAnswer: trimmed }
        return next
      })
      setHelpView(isCorrect ? 'none' : 'quick')
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
          text: 'Not quite — check the correct answer below, then have another go next time.',
        })
      }
      if (index >= run.questions.length - 1) stopTimers()
    },
    [isConfirmed, question, index, run.sessionId, run.questions.length, profileId, stopTimers],
  )

  const handleConfirm = useCallback(() => {
    if (pending === null || isConfirmed || finishedRef.current) return
    const rawSeconds = Math.max(0, Math.round((Date.now() - shownAtRef.current) / 1000))
    const timeSeconds = capTimeSpent(rawSeconds)
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
    setHelpView(isCorrect ? 'none' : 'quick')
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
    if (index >= run.questions.length - 1) stopTimers()
  }, [pending, isConfirmed, question, index, run.sessionId, run.questions.length, profileId, stopTimers])

  // After answering, the feedback and the two help buttons appear below the
  // question: they are scrolled into view so the child never has to hunt for
  // them behind the action bar.
  useEffect(() => {
    if (!isConfirmed) return
    const target = helpView !== 'none' ? helpRef.current : feedbackRef.current
    if (!target) return
    const id = window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 60)
    return () => window.clearTimeout(id)
  }, [isConfirmed, index, helpView])

  const goNext = useCallback(() => {
    if (isLast) {
      finalize()
      return
    }
    setIndex((current) => current + 1)
    setPending(null)
    setPaceMessage(null)
    setHelpView('none')
    setScratchOpen(false)
    shownAtRef.current = Date.now()
  }, [isLast, finalize])

  const subjectMeta = SUBJECT_META[question.subject]
  const progressPercent = ((index + 1) / run.questions.length) * 100

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-gradient-to-br from-slate-100 to-indigo-50 px-3 py-3 md:overflow-hidden md:px-6 md:py-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 md:h-full md:min-h-0 md:overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs font-extrabold text-slate-600 tabular-nums">
            {index + 1}/{run.questions.length}
          </span>
        </div>
        <span
          className={`hidden max-w-[11rem] truncate rounded-full px-2.5 py-0.5 text-xs font-extrabold sm:inline-block ${subjectMeta.badgeClass}`}
          title={subjectMeta.label}
        >
          {subjectMeta.label}
        </span>
        <span
          className="hidden max-w-[10rem] truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-600 sm:inline-block"
          title={question.topic}
        >
          {question.topic}
        </span>
        <button
          type="button"
          onClick={() => setScratchOpen(true)}
          aria-label="Open the scratchpad"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 border-slate-200 bg-white text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
        >
          <PencilLine className="h-4 w-4" aria-hidden="true" />
        </button>
        <span
          className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-600 tabular-nums"
          role="timer"
          aria-label={`Time used ${formatClock(elapsed)}`}
        >
          {formatClock(elapsed)}
        </span>
        <button
          type="button"
          onClick={finalize}
          aria-label="Stop and save"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-slate-200 bg-white text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
        >
          <Square className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-3 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:pr-1">
          <QuestionView
            key={question.id}
            question={question}
            passage={passage}
            compact
            twoColumns
            hideTopic
            hideScratchpad
            questionNumber={index + 1}
            totalQuestions={run.questions.length}
            selectedIndex={isConfirmed ? outcome.selectedIndex : pending}
            onSelect={(optionIndex) => {
              if (!isConfirmed) setPending(optionIndex)
            }}
            locked={isConfirmed}
            showFeedback={isConfirmed}
            writtenMode={run.writtenMode}
            onWriteAnswer={(value) => handleWriteConfirm(value)}
          />

          {isConfirmed && paceMessage ? (
            <div
              ref={feedbackRef}
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

          {isConfirmed && helpView !== 'none' ? (
            <div ref={helpRef} className="flex flex-col gap-3">
              {helpView === 'quick' ? (
                <QuickExplanation question={question} writtenMode={isWrittenQuestion} />
              ) : null}
              {helpView === 'tutorial' ? <LearnHowToSolve question={question} /> : null}
            </div>
          ) : null}
        </div>
      </div>

      <footer className="sticky bottom-[env(safe-area-inset-bottom)] z-20 -mx-3 shrink-0 border-t-2 border-slate-200 bg-white px-3 py-2.5 md:static md:mx-0 md:rounded-2xl md:border-2 md:border-slate-200 md:shadow-sm">
        {isConfirmed ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHelpView((view) => (view === 'quick' ? 'none' : 'quick'))}
              aria-pressed={helpView === 'quick'}
              className={`inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1 rounded-xl border-2 px-2 py-1 text-[11px] font-extrabold transition ${
                helpView === 'quick'
                  ? 'border-amber-500 bg-amber-500 text-slate-950'
                  : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
              }`}
            >
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
              Quick
            </button>
            <button
              type="button"
              onClick={() => setHelpView((view) => (view === 'tutorial' ? 'none' : 'tutorial'))}
              aria-pressed={helpView === 'tutorial'}
              className={`inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1 rounded-xl border-2 px-2 py-1 text-[11px] font-extrabold transition ${
                helpView === 'tutorial'
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
              }`}
            >
              <Brain className="h-3.5 w-3.5" aria-hidden="true" />
              Learn
            </button>
            <button
              type="button"
              onClick={goNext}
              className={`${btnPrimaryClass} min-h-[36px] flex-1 py-1.5 text-sm`}
            >
              {isLast ? 'Results' : 'Next'}
            </button>
          </div>
        ) : isWrittenQuestion ? (
          <p className="py-2 text-center text-sm font-bold text-slate-500">
            Type your answer in the box above, then press &quot;Check my answer&quot;.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending === null}
            className={`${btnPrimaryClass} min-h-[48px] w-full py-2.5 text-base`}
          >
            <Check className="h-5 w-5" aria-hidden="true" />
            Confirm Answer
          </button>
        )}
      </footer>
      <ScratchpadOverlay open={scratchOpen} onClose={() => setScratchOpen(false)} resetKey={question.id} />
      </div>
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
  const [writtenMode, setWrittenMode] = useState(false)
  const [clinicIds, setClinicIds] = useState<Set<string>>(new Set())
  const [run, setRun] = useState<RunState | null>(null)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [beaconDone, setBeaconDone] = useState(false)
  const [beaconResetKey, setBeaconResetKey] = useState(0)
  const practiceSetupRef = useRef<HTMLDivElement>(null)
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

  const backToSetup = useCallback(() => {
    setRun(null)
    setSummary(null)
    void refreshBank()
  }, [refreshBank])

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

      <BeaconWritingPanel
        resetKey={beaconResetKey}
        onSubmitted={() => {
          setBeaconDone(true)
          // The child is taken straight back to the practice setup so she can
          // start a new set without hunting for the button.
          window.setTimeout(() => {
            practiceSetupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 60)
        }}
      />
      {beaconDone ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3"
          role="status"
        >
          <p className="text-sm font-extrabold text-emerald-800">
            Your Beacon writing is submitted and saved. Choose a subject below to start a practice
            set.
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

      <div ref={practiceSetupRef} className="scroll-mt-24">
        <section className={cardClass}>
          <h2 className="mb-1 text-base font-black text-slate-900">Subject</h2>
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
            Optional Brain Gym — Bonus only
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

      <section className={cardClass}>
        <h2 className="mb-3 text-base font-black text-slate-900">Answer style</h2>
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
    </div>
  )
}
