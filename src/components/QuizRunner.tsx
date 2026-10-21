import { Lightbulb, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../db/database'
import type { Passage, Question, SectionBreakdownEntry, SessionMode, Subject } from '../db/schemas'
import { formatClock, uid } from '../lib/format'
import { capTimeSpent } from '../lib/timing'
import { SUBJECT_META } from '../lib/theme'
import { MathText } from './exam/MathText'
import { QuestionView } from './exam/QuestionView'
import { FeedbackBanner, btnPrimaryClass, cardClass } from './ui'

const PRAISE = [
  'Brilliant!',
  'Well done!',
  'Spot on!',
  'Fantastic work!',
  'You nailed it!',
  'Super thinking!',
]

export interface QuizResult {
  sessionId: string
  correct: number
  total: number
  selectedCount: number
  questionCount: number
  timeSeconds: number
  breakdown: SectionBreakdownEntry[]
}

interface QuizRunnerProps {
  sessionId: string
  profileId: string
  mode: SessionMode
  questions: Question[]
  passagesById: Map<string, Passage>
  onFinished: (result: QuizResult) => void
  initialAnswers?: Record<string, number>
}

export function QuizRunner({
  sessionId,
  profileId,
  mode,
  questions,
  passagesById,
  onFinished,
  initialAnswers,
}: QuizRunnerProps) {
  const [index, setIndex] = useState(0)
  const [selections, setSelections] = useState<(number | null)[]>(() =>
    questions.map((question) => initialAnswers?.[question.id] ?? null),
  )
  const [locked, setLocked] = useState<boolean[]>(() =>
    questions.map((question) => initialAnswers?.[question.id] !== undefined),
  )
  const [correctCount, setCorrectCount] = useState(0)
  const [praise, setPraise] = useState(PRAISE[0])
  const [elapsed, setElapsed] = useState(0)
  const shownAtRef = useRef(0)
  const timesRef = useRef<Record<string, number>>({})
  const startedAtRef = useRef(0)
  const endedAtRef = useRef<number | null>(null)
  const finishedRef = useRef(false)
  const selectingIndexRef = useRef(-1)

  useEffect(() => {
    const startedAt = Date.now()
    startedAtRef.current = startedAt
    shownAtRef.current = startedAt
    const timer = window.setInterval(() => {
      // The clock is frozen once the very last question has been answered.
      if (endedAtRef.current !== null) return
      setElapsed(Math.round((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const question = questions[index]
  const passage = question.passageId ? passagesById.get(question.passageId) : undefined
  const isAnswered = locked[index] === true

  /** Freezes the exam clock as soon as the very last question is answered. */
  const stopTimers = useCallback(() => {
    if (endedAtRef.current !== null) return
    endedAtRef.current = Date.now()
    setElapsed(Math.max(0, Math.round((endedAtRef.current - startedAtRef.current) / 1000)))
  }, [])

  const finalize = useCallback(async () => {
    if (finishedRef.current) return
    finishedRef.current = true
    stopTimers()
    const answered = questions
      .map((questionItem, questionIndex) => ({ questionItem, selection: selections[questionIndex] }))
      .filter((entry): entry is { questionItem: Question; selection: number } => entry.selection !== null)
    const correct = answered.filter((entry) => entry.selection === entry.questionItem.correctIndex).length
    const total = answered.length
    const bySubject = new Map<Subject, { correct: number; total: number; timeSeconds: number }>()
    for (const entry of answered) {
      const key = entry.questionItem.subject
      const bucket = bySubject.get(key) ?? { correct: 0, total: 0, timeSeconds: 0 }
      bucket.total += 1
      if (entry.selection === entry.questionItem.correctIndex) bucket.correct += 1
      bucket.timeSeconds += timesRef.current[entry.questionItem.id] ?? 0
      bySubject.set(key, bucket)
    }
    const breakdown: SectionBreakdownEntry[] = [...bySubject.entries()].map(([subject, bucket]) => ({
      section: SUBJECT_META[subject].label,
      correct: bucket.correct,
      total: bucket.total,
      timeSeconds: Math.round(bucket.timeSeconds),
    }))
    const endedAt = endedAtRef.current ?? Date.now()
    const timeSeconds = Math.max(0, Math.round((endedAt - startedAtRef.current) / 1000))
    const scorePercentage = total === 0 ? 0 : Math.round((correct / total) * 100)
    await db.sessions.update(sessionId, {
      status: 'completed',
      completedAt: Date.now(),
      totalTimeSeconds: timeSeconds,
      scorePercentage,
      sectionBreakdown: breakdown,
    })
    onFinished({
      sessionId,
      correct,
      total,
      selectedCount: total,
      questionCount: questions.length,
      timeSeconds,
      breakdown,
    })
  }, [questions, selections, sessionId, onFinished])

  const handleSelect = useCallback(
    (optionIndex: number) => {
      if (isAnswered || finishedRef.current || selectingIndexRef.current === index) return
      selectingIndexRef.current = index
      window.setTimeout(() => {
        if (selectingIndexRef.current === index) selectingIndexRef.current = -1
      }, 250)
      const now = Date.now()
      const rawSeconds = Math.max(0, Math.round((now - shownAtRef.current) / 1000))
      const timeSpentSeconds = capTimeSpent(rawSeconds)
      const isCorrect = optionIndex === question.correctIndex
      timesRef.current[question.id] = (timesRef.current[question.id] ?? 0) + timeSpentSeconds
      setSelections((previous) => {
        const next = [...previous]
        next[index] = optionIndex
        return next
      })
      setLocked((previous) => {
        const next = [...previous]
        next[index] = true
        return next
      })
      if (isCorrect) {
        setCorrectCount((count) => count + 1)
        setPraise(PRAISE[Math.floor(Math.random() * PRAISE.length)])
      }
      void db.attempts
        .add({
          id: uid(),
          profileId,
          sessionId,
          questionId: question.id,
          subject: question.subject,
          topic: question.topic,
          difficulty: question.difficulty,
          selectedIndex: optionIndex,
          isCorrect,
          timeSpentSeconds,
          flagged: false,
          timestamp: now,
        })
        .catch(() => undefined)
      if (index >= questions.length - 1) stopTimers()
    },
    [isAnswered, question, sessionId, profileId, index, questions.length, stopTimers],
  )

  const goNext = useCallback(() => {
    if (index >= questions.length - 1) {
      void finalize()
      return
    }
    setIndex((current) => current + 1)
    shownAtRef.current = Date.now()
  }, [index, questions.length, finalize])

  const stopEarly = useCallback(() => {
    void finalize()
  }, [finalize])

  const answer = selections[index]
  const isLast = index === questions.length - 1

  return (
    <div className="focus-layer fixed inset-0 z-50 flex justify-center bg-gradient-to-br from-slate-100 to-indigo-50 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:py-4">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-2">
        <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${((index + 1) / questions.length) * 100}%` }}
              />
            </div>
            <span className="text-xs font-extrabold text-slate-600 tabular-nums">
              {index + 1}/{questions.length}
            </span>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-600 tabular-nums">
            {formatClock(elapsed)}
          </span>
          <button
            type="button"
            onClick={stopEarly}
            aria-label="Stop and save"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-slate-200 bg-white text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
            <QuestionView
              key={question.id}
              question={question}
              passage={passage}
              compact
              twoColumns
              questionNumber={index + 1}
              totalQuestions={questions.length}
              selectedIndex={answer ?? null}
              onSelect={(optionIndex) => void handleSelect(optionIndex)}
              locked={isAnswered}
              showFeedback={isAnswered}
              showStrategy
            />

            {isAnswered ? (
              <div className="flex flex-col gap-3">
                <FeedbackBanner correct={answer === question.correctIndex}>
                  {answer === question.correctIndex
                    ? `${praise} The answer is ${['A', 'B', 'C', 'D', 'E'][question.correctIndex]}.`
                    : `Not quite this time — the answer is ${['A', 'B', 'C', 'D', 'E'][question.correctIndex]}.`}
                </FeedbackBanner>
                <div className={`${cardClass} flex gap-3`}>
                  <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                    <Lightbulb className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-black uppercase tracking-wide text-slate-500">Explanation</p>
                    <p className="text-base font-semibold leading-relaxed text-slate-800">
                      <MathText text={question.explanation} />
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {correctCount > 0 ? (
              <p className="text-center text-sm font-extrabold text-indigo-600">
                {correctCount} correct so far — keep it up!
              </p>
            ) : null}
          </div>
        </div>

        <footer className="shrink-0 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 shadow-sm">
          {isAnswered ? (
            <button type="button" onClick={goNext} className={`${btnPrimaryClass} !min-h-[40px] w-full !py-1.5 text-sm`}>
              {isLast ? 'See my results' : 'Next'}
            </button>
          ) : (
            <p className="py-1 text-center text-xs font-bold text-slate-500">
              {mode === 'mistake_clinic' ? 'Mistake Clinic' : 'Quick Practice'} — read every option.
            </p>
          )}
        </footer>
      </div>
    </div>
  )
}
