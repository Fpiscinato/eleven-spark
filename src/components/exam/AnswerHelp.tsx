import { Brain, Lightbulb, TriangleAlert } from 'lucide-react'
import { getTopicStrategy } from '../../data/topicStrategies'
import { OPTION_LETTERS, type Question } from '../../db/schemas'
import { MathText } from './MathText'

export interface AnswerHelpProps {
  question: Question
  writtenMode?: boolean
}

/**
 * 💡 Quick Explanation — the short "why is this the right answer?" note.
 */
export function QuickExplanation({ question, writtenMode = false }: AnswerHelpProps) {
  const correctLetter = OPTION_LETTERS[question.correctIndex]
  const correctOption = question.options[question.correctIndex]
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
          <Lightbulb className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="text-sm font-black uppercase tracking-wide text-amber-800">
          Quick explanation
        </p>
      </div>
      <p className="text-base font-semibold leading-relaxed text-slate-800">
        <MathText text={question.explanation} />
      </p>
      <p className="mt-2 text-sm font-extrabold text-emerald-700">
        {writtenMode
          ? `Correct answer: ${correctOption}`
          : `Correct answer: ${correctLetter} — ${correctOption}`}
      </p>
    </div>
  )
}

/**
 * 🧠 Learn How to Solve — the tutorial that teaches the underlying method so the
 * student can attack the next question of the same type on her own.
 */
export function LearnHowToSolve({ question }: AnswerHelpProps) {
  const strategy = getTopicStrategy(question.subject, question.topic)
  const correctLetter = OPTION_LETTERS[question.correctIndex]
  const correctOption = question.options[question.correctIndex]
  return (
    <div className="rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white">
          <Brain className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="text-sm font-black uppercase tracking-wide text-indigo-800">
          Learn how to solve — {strategy.concept.split(':')[0]}
        </p>
      </div>

      <section className="rounded-xl bg-white/80 p-3">
        <p className="text-xs font-black uppercase tracking-wide text-indigo-700">The big idea</p>
        <p className="mt-1 text-base font-semibold leading-relaxed text-slate-800">
          {strategy.concept}
        </p>
      </section>

      <section className="mt-3">
        <p className="text-xs font-black uppercase tracking-wide text-indigo-700">
          Your method, step by step
        </p>
        <ol className="mt-2 grid gap-2">
          {strategy.steps.map((step, index) => (
            <li
              key={index}
              className="flex items-start gap-3 rounded-xl bg-white/80 px-3 py-2 text-sm font-bold text-slate-800"
            >
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-black text-white">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-3 flex items-start gap-2 rounded-xl border-2 border-rose-200 bg-rose-50 p-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
        <p className="text-sm font-bold text-rose-900">
          <span className="font-black">Watch out:</span> {strategy.trap}
        </p>
      </section>

      <section className="mt-3 rounded-xl bg-white/80 p-3">
        <p className="text-xs font-black uppercase tracking-wide text-indigo-700">
          Now do this one yourself
        </p>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-800">
          Use the three steps above on the question you just answered, then check your working
          against the explanation.
        </p>
        <p className="mt-2 text-base font-semibold leading-relaxed text-slate-800">
          <MathText text={question.explanation} />
        </p>
        <p className="mt-2 text-sm font-extrabold text-emerald-700">
          Correct answer: {correctLetter} — {correctOption}
        </p>
      </section>
    </div>
  )
}
