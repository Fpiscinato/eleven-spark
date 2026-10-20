import { Lightbulb, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../db/database'
import type { Passage, Question, SectionBreakdownEntry, SessionMode, Subject } from '../db/schemas'
import { formatClock, uid } from '../lib/format'
import { SUBJECT_META } from '../lib/theme'
import { MathText } from './exam/MathText'
import { QuestionView } from './exam/QuestionView'
import { FeedbackBanner, btnPrimaryClass, btnSecondaryClass, cardClass } from './ui'

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
}

export function QuizRunner({
  sessionId,
  profileId,
  mode,
  questions,
  passagesById,
  onFinished,
}: QuizRunnerProps) {
  const [index, setIndex] = useState(0)
  const [selections, setSelections] = useState<(number | null)[]>(() => questions.map(() => null))
  const [locked, setLocked] = useState<boolean[]>(() => questions.map(() => false))
  const [correctCount, setCorrectCount] = useState(0)
  const [praise, setPraise] = useState(PRAISE[0])
  const [elapsed, setElapsed] = useState(0)
  const shownAtRef = useRef(0)
  const timesRef = useRef<Record<string, number>>({})
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

  const question = questions[index]
  const passage = question.passageId ? passagesById.get(question.passageId) : undefined
  const isAnswered = locked[index] === true

  const finalize = useCallback(async () => {
    if (finishedRef.current) return
    finishedRef.current = true
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
    const timeSeconds = Math.round((Date.now() - startedAtRef.current) / 1000)
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
    async (optionIndex: number) => {
      if (isAnswered || finishedRef.current) return
      const now = Date.now()
      const timeSpentSeconds = Math.max(0, Math.round((now - shownAtRef.current) / 1000))
      const isCorrect = optionIndex === question.correctIndex
      timesRef.current[question.id] = (timesRef.current[question.id] ?? 0) + timeSpentSeconds
      await db.attempts.add({
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
    },
    [isAnswered, question, sessionId, profileId, index],
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
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <div className="h-3 w-40 overflow-hidden rounded-full bg-slate-100 md:w-56">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${((index + 1) / questions.length) * 100}%` }}
            />
          </div>
          <span className="text-sm font-extrabold text-slate-600">
            {index + 1} / {questions.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-500 tabular-nums">{formatClock(elapsed)}</span>
          <button type="button" onClick={stopEarly} className={`${btnSecondaryClass} min-h-[44px] px-4 py-2 text-sm`}>
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
          <button type="button" onClick={goNext} className={btnPrimaryClass}>
            {isLast ? 'See my results' : 'Next question'}
          </button>
        </div>
      ) : (
        <p className="text-center text-sm font-bold text-slate-400">
          Mode: {mode === 'mistake_clinic' ? 'Mistake Clinic' : 'Quick Practice'} — take your time and read
          every option.
        </p>
      )}

      {correctCount > 0 ? (
        <p className="text-center text-sm font-extrabold text-indigo-600">
          {correctCount} correct so far — keep it up!
        </p>
      ) : null}
    </div>
  )
}
