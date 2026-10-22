import {
  AlertTriangle,
  Brain,
  Check,
  Lightbulb,
  PencilLine,
  Square,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../../db/database'
import type {
  Passage,
  Question,
  SectionBreakdownEntry,
  SessionMode,
  Subject,
} from '../../db/schemas'
import { formatClock, uid } from '../../lib/format'
import { averageSeconds, capTimeSpent } from '../../lib/timing'
import { SUBJECT_META } from '../../lib/theme'
import { isWrittenAnswerCorrect } from '../../lib/writtenAnswer'
import {
  readSession,
  removeSession,
  SESSION_KEYS,
  writeSession,
} from '../../lib/sessionPersistence'
import { btnPrimaryClass } from '../ui'
import { LearnHowToSolve, QuickExplanation } from './AnswerHelp'
import { ConfirmEndSessionModal } from './ConfirmEndSessionModal'
import { MathText } from './MathText'
import { QuestionView } from './QuestionView'
import { ScratchpadOverlay } from './ScratchpadOverlay'

export interface PracticeRunState {
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

export interface SessionSummary {
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
  run: PracticeRunState
  profileId: string
  onFinished: (summary: SessionSummary) => void
}

function humanizeTopic(topic: string): string {
  return topic
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

/**
 * The single question runner used by every practice-style session:
 * Quick Practice, the Mistake Clinic and the Mistake Bank.
 *
 * Because there is only one runner, the layout is identical everywhere:
 * a fixed-height screen, the question scrolling above a footer that is
 * always visible, and two columns side by side from `lg:` upwards.
 */
export function PracticeRunner({ run, profileId, onFinished }: PracticeRunnerProps) {
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
  const [confirmOpen, setConfirmOpen] = useState(false)
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
  // them behind the action bar. The help panel is long, so it is aligned to
  // the top of the reading area to be read from the beginning.
  useEffect(() => {
    if (!isConfirmed) return
    const target = helpView !== 'none' ? helpRef.current : feedbackRef.current
    if (!target) return
    const id = window.setTimeout(() => {
      target.scrollIntoView({
        behavior: 'smooth',
        block: helpView !== 'none' ? 'start' : 'center',
      })
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
    <div className="focus-layer fixed inset-0 z-50 flex justify-center bg-gradient-to-br from-slate-100 to-indigo-50 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:py-4">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-2">
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
          className={`hidden max-w-[11rem] truncate rounded-full px-2.5 py-0.5 text-xs font-extrabold lg:inline-block ${subjectMeta.badgeClass}`}
          title={subjectMeta.label}
        >
          {subjectMeta.label}
        </span>
        <span
          className="max-w-[8rem] truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 sm:max-w-[10rem] sm:text-xs"
          title={humanizeTopic(question.topic)}
        >
          {humanizeTopic(question.topic)}
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
          onClick={() => setConfirmOpen(true)}
          aria-label="Stop and save"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-slate-200 bg-white text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
        >
          <Square className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
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

      <footer className="shrink-0 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        {isConfirmed ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHelpView((view) => (view === 'quick' ? 'none' : 'quick'))}
              aria-pressed={helpView === 'quick'}
              className={`inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1 rounded-xl border-2 px-2 py-1 text-[11px] font-extrabold transition ${
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
              className={`inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1 rounded-xl border-2 px-2 py-1 text-[11px] font-extrabold transition ${
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
              className={`${btnPrimaryClass} !min-h-[40px] flex-1 !py-1.5 text-sm`}
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

      <ConfirmEndSessionModal
        open={confirmOpen}
        title="End this practice session?"
        message="Your answered questions are already saved — you can stop here without losing anything."
        keepLabel="Continue Practising"
        endLabel="End Session"
        onKeepGoing={() => setConfirmOpen(false)}
        onEnd={() => {
          setConfirmOpen(false)
          finalize()
        }}
      />
    </div>
  )
}
