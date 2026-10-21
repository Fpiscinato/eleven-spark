import { BookOpen, Check, Flag, Lightbulb, PencilLine, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { OPTION_LETTERS, type Passage, type Question } from '../../db/schemas'
import { getTopicStrategy } from '../../data/topicStrategies'
import { acceptedAnswersFor } from '../../lib/writtenAnswer'
import { MathText } from './MathText'
import { NvrFigureSvg, NvrSvgRenderer } from './NvrSvgRenderer'
import { ScratchpadOverlay } from './ScratchpadOverlay'

const PASSAGE_FONT = '400 15px Nunito, "Segoe UI", system-ui, sans-serif'

let measureContext: CanvasRenderingContext2D | null = null

function getMeasureContext(): CanvasRenderingContext2D {
  if (!measureContext) {
    measureContext = document.createElement('canvas').getContext('2d')
  }
  if (!measureContext) {
    throw new Error('Canvas 2D is required to lay out the reading passage.')
  }
  return measureContext
}

function wrapPassageLines(content: string, maxWidth: number): string[] {
  const ctx = getMeasureContext()
  ctx.font = PASSAGE_FONT
  const usable = Math.max(140, maxWidth)
  const lines: string[] = []
  for (const paragraph of content.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('')
      continue
    }
    const words = paragraph.trim().split(/\s+/)
    let current = ''
    for (const word of words) {
      const trial = current === '' ? word : `${current} ${word}`
      if (current === '' || ctx.measureText(trial).width <= usable) {
        current = trial
      } else {
        lines.push(current)
        current = word
      }
    }
    if (current !== '') {
      lines.push(current)
    }
  }
  return lines
}

interface PassageLine {
  text: string
  number: number
  showNumber: boolean
}

function LineNumberedPassage({
  content,
  widthPx,
  fontVersion,
}: {
  content: string
  widthPx: number
  fontVersion: number
}) {
  const lines = useMemo(() => {
    const wrapped = wrapPassageLines(content, widthPx)
    let number = 0
    return wrapped.map<PassageLine>((text) => {
      if (text === '') return { text, number: 0, showNumber: false }
      number += 1
      return { text, number, showNumber: number % 5 === 0 }
    })
  }, [content, widthPx, fontVersion])
  return (
    <div className="overflow-x-hidden text-[15px] leading-7 text-slate-800">
      {lines.map((line, index) => {
        if (line.text === '') {
          return <div key={index} className="h-6" aria-hidden="true" />
        }
        return (
          <div key={index} className="flex items-start">
            <span
              className="w-9 shrink-0 select-none pr-2 pt-0.5 text-right text-xs font-semibold text-slate-400 tabular-nums"
              aria-hidden="true"
            >
              {line.showNumber ? line.number : ''}
            </span>
            <span className="whitespace-pre">{line.text}</span>
          </div>
        )
      })}
    </div>
  )
}

interface OptionsListProps {
  question: Question
  selectedIndex: number | null
  onSelect: (index: number) => void
  disabled: boolean
  showFeedback: boolean
  compact?: boolean
}

function OptionsList({
  question,
  selectedIndex,
  onSelect,
  disabled,
  showFeedback,
  compact = false,
}: OptionsListProps) {
  const optionFigures = question.svgConfig?.optionFigures
  return (
    <div className={compact ? 'grid gap-1.5' : 'grid gap-3'}>
      {question.options.map((option, index) => {
        const letter = OPTION_LETTERS[index]
        const isSelected = selectedIndex === index
        const isCorrect = index === question.correctIndex
        const state: 'idle' | 'selected' | 'correct' | 'wrong' | 'muted' = !showFeedback
          ? isSelected
            ? 'selected'
            : 'idle'
          : isCorrect
            ? 'correct'
            : isSelected
              ? 'wrong'
              : 'muted'
        const rowClass =
          state === 'selected'
            ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-200'
            : state === 'correct'
              ? 'border-emerald-500 bg-emerald-50'
              : state === 'wrong'
                ? 'border-rose-500 bg-rose-50'
                : state === 'muted'
                  ? 'border-slate-200 bg-white opacity-60'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50'
        const chipClass =
          state === 'selected'
            ? 'bg-indigo-600 text-white'
            : state === 'correct'
              ? 'bg-emerald-600 text-white'
              : state === 'wrong'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-100 text-slate-700'
        return (
          <button
            key={letter}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(index)}
            className={`flex w-full items-center rounded-2xl border-2 text-left transition active:scale-[0.99] disabled:cursor-default ${
              compact ? 'min-h-[44px] gap-2 px-2.5 py-1.5' : 'min-h-[64px] gap-4 px-4 py-3'
            } ${rowClass}`}
          >
            <span
              className={`grid shrink-0 place-items-center font-extrabold ${
                compact ? 'h-7 w-7 rounded-lg text-sm' : 'h-10 w-10 rounded-xl text-lg'
              } ${chipClass}`}
              aria-hidden="true"
            >
              {letter}
            </span>
            {optionFigures?.[index] ? (
              <NvrFigureSvg
                figure={optionFigures[index]}
                className={compact ? 'h-9 w-9 shrink-0' : 'h-12 w-12 shrink-0'}
                title={`Option ${letter}`}
              />
            ) : null}
            <span
              className={`flex-1 whitespace-pre-line font-semibold text-slate-900 ${
                compact ? 'text-[15px] leading-snug' : 'text-base md:text-lg'
              }`}
            >
              <MathText text={option} />
            </span>
            {state === 'correct' ? (
              <Check className={compact ? 'h-5 w-5 shrink-0 text-emerald-600' : 'h-6 w-6 shrink-0 text-emerald-600'} aria-hidden="true" />
            ) : null}
            {state === 'wrong' ? (
              <X className={compact ? 'h-5 w-5 shrink-0 text-rose-600' : 'h-6 w-6 shrink-0 text-rose-600'} aria-hidden="true" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

interface WrittenAnswerBoxProps {
  question: Question
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  locked: boolean
  showFeedback: boolean
  compact?: boolean
}

function WrittenAnswerBox({
  question,
  value,
  onChange,
  onSubmit,
  locked,
  showFeedback,
  compact = false,
}: WrittenAnswerBoxProps) {
  const accepted = acceptedAnswersFor(question)
  const trimmed = value.trim()

  return (
    <div
      className={`rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-indigo-700">
        <PencilLine className="h-5 w-5" aria-hidden="true" />
        Beacon Written Answer
      </p>
      {!compact ? (
        <p className="mt-1 text-sm font-semibold text-slate-600">
          Type your answer in the box. The correct answer is only revealed once you have checked it.
        </p>
      ) : null}
      <label htmlFor="beacon-written-answer" className="sr-only">
        Your written answer
      </label>
      <input
        id="beacon-written-answer"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && trimmed !== '' && !locked) {
            event.preventDefault()
            onSubmit(value)
          }
        }}
        disabled={locked}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="Type your answer here"
        className={`mt-3 w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-lg font-bold text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-70 ${
          compact ? 'min-h-[48px]' : 'min-h-[56px]'
        }`}
      />
      {!locked ? (
        <button
          type="button"
          onClick={() => onSubmit(value)}
          disabled={trimmed === ''}
          className="mt-3 inline-flex min-h-[48px] items-center gap-2 rounded-2xl border-2 border-indigo-600 bg-indigo-600 px-5 py-2 text-sm font-extrabold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-5 w-5" aria-hidden="true" />
          Check my answer
        </button>
      ) : null}
      {showFeedback ? (
        <div className="mt-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-800">
          Correct answer: {accepted.join(' · ')}
        </div>
      ) : null}
    </div>
  )
}

export interface QuestionViewProps {
  question: Question
  passage?: Passage | undefined
  questionNumber?: number | undefined
  totalQuestions?: number | undefined
  selectedIndex: number | null
  onSelect: (index: number) => void
  locked?: boolean
  showFeedback?: boolean
  showStrategy?: boolean
  flagged?: boolean
  onToggleFlag?: (() => void) | undefined
  writtenMode?: boolean
  writtenAnswer?: string | null
  onWriteAnswer?: ((value: string) => void) | undefined
  onWrittenChange?: ((value: string) => void) | undefined
  /** Compact mode: tighter layout used by the no-scroll practice screen. */
  compact?: boolean
}

function StrategyPanel({ question }: { question: Question }) {
  const strategy = getTopicStrategy(question.subject, question.topic)
  return (
    <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-4 md:p-5" aria-label="Strategy tip">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl" aria-hidden="true">💡</span>
        <h3 className="text-base font-black text-amber-900">Strategy Tip &amp; Common Traps</h3>
      </div>
      <p className="text-sm font-bold leading-relaxed text-amber-950 md:text-base">
        {strategy.concept}
      </p>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-amber-900">
        {strategy.attention}
      </p>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-amber-900">
        <span className="font-black">Watch out:</span> {strategy.trap}
      </p>
      <ol className="mt-3 grid gap-2">
        {strategy.steps.map((step, index) => (
          <li key={index} className="flex items-start gap-2 text-sm font-bold text-amber-950">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-500 text-xs font-black text-white">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2">
        <Lightbulb className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <p className="text-xs font-bold text-amber-900">
          In the real test, skip a tricky question, come back to it, then use these steps.
        </p>
      </div>
    </section>
  )
}

export function QuestionView({
  question,
  passage,
  questionNumber,
  totalQuestions,
  selectedIndex,
  onSelect,
  locked = false,
  showFeedback = false,
  showStrategy = false,
  flagged = false,
  onToggleFlag,
  writtenMode = false,
  writtenAnswer = null,
  onWriteAnswer,
  onWrittenChange,
  compact = false,
}: QuestionViewProps) {
  const [scratchOpen, setScratchOpen] = useState(false)
  const [passageWidth, setPassageWidth] = useState(480)
  const [fontVersion, setFontVersion] = useState(0)
  const [mobileView, setMobileView] = useState<'question' | 'text'>('question')
  const [strategyOpen, setStrategyOpen] = useState(false)
  const [writtenDraft, setWrittenDraft] = useState('')
  const passageBoxRef = useRef<HTMLDivElement>(null)
  const onWrittenChangeRef = useRef(onWrittenChange)
  onWrittenChangeRef.current = onWrittenChange
  const isWritten = writtenMode && question.answerType === 'short_text'

  useEffect(() => {
    setWrittenDraft(writtenAnswer ?? '')
  }, [question.id, writtenAnswer])

  useEffect(() => {
    let cancelled = false
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(() => {
        if (!cancelled) setFontVersion((version) => version + 1)
      })
    }
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const box = passageBoxRef.current
    if (!passage || !box) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setPassageWidth(Math.max(160, entry.contentRect.width - 24))
      }
    })
    observer.observe(box)
    setPassageWidth(Math.max(160, box.clientWidth - 24))
    return () => observer.disconnect()
  }, [passage])

  return (
    <div className={compact ? 'flex flex-col gap-2' : 'flex flex-col gap-4'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {questionNumber !== undefined && totalQuestions !== undefined && !compact ? (
            <span className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-extrabold text-white">
              Question {questionNumber} of {totalQuestions}
            </span>
          ) : null}
          <span
            className={`rounded-full border border-slate-200 bg-white font-bold text-slate-600 ${
              compact ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1.5 text-sm'
            }`}
          >
            {question.topic}
          </span>
          {/* In the compact practice screen the stars take precious vertical
              space without teaching anything, so they are dropped. */}
          {compact ? (
            <span className="sr-only">Difficulty {question.difficulty} of 3</span>
          ) : (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-500">
              {'★'.repeat(question.difficulty)}
              <span className="sr-only">Difficulty {question.difficulty} of 3</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScratchOpen(true)}
            aria-label="Open the scratchpad"
            className={`inline-flex items-center justify-center rounded-xl border-2 border-slate-200 bg-white font-extrabold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 ${
              compact ? 'h-9 w-9' : 'min-h-[44px] gap-2 px-4 py-2 text-sm'
            }`}
          >
            <PencilLine className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
            {compact ? null : 'Scratchpad'}
          </button>
          {onToggleFlag ? (
            <button
              type="button"
              onClick={onToggleFlag}
              aria-pressed={flagged}
              className={`inline-flex items-center gap-2 rounded-xl border-2 font-extrabold transition ${
                compact ? 'min-h-[40px] px-3 py-1.5 text-xs' : 'min-h-[44px] px-4 py-2 text-sm'
              } ${
                flagged
                  ? 'border-amber-400 bg-amber-100 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300'
              }`}
            >
              <Flag className="h-5 w-5" aria-hidden="true" />
              {flagged ? 'Flagged' : 'Flag'}
            </button>
          ) : null}
        </div>
      </div>

      {passage ? (
        <>
          <div className="flex gap-2 md:hidden" role="tablist" aria-label="Reading view">
            <button
              type="button"
              role="tab"
              aria-selected={mobileView === 'question'}
              onClick={() => setMobileView('question')}
              className={`min-h-[48px] flex-1 rounded-2xl border-2 px-4 text-sm font-extrabold transition ${
                mobileView === 'question'
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              ❓ Question
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileView === 'text'}
              onClick={() => setMobileView('text')}
              className={`min-h-[48px] flex-1 rounded-2xl border-2 px-4 text-sm font-extrabold transition ${
                mobileView === 'text'
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              📖 Read Text
            </button>
          </div>
          <div className={`grid gap-4 md:grid-cols-2 md:items-start ${compact ? 'md:gap-3' : ''}`}>
            <section
              ref={passageBoxRef}
              className={`${mobileView === 'text' ? 'block' : 'hidden'} rounded-3xl border border-slate-200 bg-white shadow-sm md:block ${
                compact ? 'p-3' : 'p-4 md:p-5'
              }`}
              aria-label="Reading passage"
            >
              <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
                <BookOpen className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                <h3 className="text-base font-extrabold text-slate-900">{passage.title}</h3>
              </div>
              <div className={`overflow-y-auto pr-1 ${compact ? 'max-h-[42vh] md:max-h-[38vh]' : 'max-h-[70vh] md:max-h-[64vh]'}`}>
                <LineNumberedPassage
                  content={passage.content}
                  widthPx={passageWidth}
                  fontVersion={fontVersion}
                />
              </div>
            </section>
            <section
              className={`${mobileView === 'question' ? 'flex' : 'hidden'} flex-col rounded-3xl border border-slate-200 bg-white shadow-sm md:flex ${
                compact ? 'gap-2.5 p-3' : 'gap-4 p-4 md:p-5'
              }`}
            >
              {question.svgConfig && question.svgConfig.cells.length > 0 ? (
                <NvrSvgRenderer config={question.svgConfig} className="py-1" />
              ) : null}
              <div
                className={`whitespace-pre-line font-bold leading-relaxed text-slate-900 ${
                  compact ? 'text-base' : 'text-lg md:text-xl'
                }`}
              >
                <MathText text={question.stem} />
              </div>
              {isWritten && onWriteAnswer ? (
                <WrittenAnswerBox
                  question={question}
                  value={writtenDraft}
                  onChange={(value) => {
                    setWrittenDraft(value)
                    onWrittenChangeRef.current?.(value)
                  }}
                  onSubmit={onWriteAnswer}
                  locked={locked}
                  showFeedback={showFeedback}
                  compact={compact}
                />
              ) : (
                <OptionsList
                  question={question}
                  selectedIndex={selectedIndex}
                  onSelect={onSelect}
                  disabled={locked}
                  showFeedback={showFeedback}
                  compact={compact}
                />
              )}
              {showStrategy && locked ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setStrategyOpen((open) => !open)}
                    aria-expanded={strategyOpen}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-2 text-sm font-extrabold text-amber-900 transition hover:bg-amber-100"
                  >
                    <Lightbulb className="h-5 w-5" aria-hidden="true" />
                    {strategyOpen ? 'Hide strategy tip' : '💡 Show strategy tip'}
                  </button>
                  {strategyOpen ? <div className="mt-3">
                    <StrategyPanel question={question} />
                  </div> : null}
                </div>
              ) : null}
            </section>
          </div>
        </>
      ) : (
        <section
          className={`flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm ${
            compact ? 'gap-2.5 p-3' : 'gap-4 p-4 md:p-6'
          }`}
        >
          {question.svgConfig && question.svgConfig.cells.length > 0 ? (
            <NvrSvgRenderer config={question.svgConfig} className="py-1" />
          ) : null}
          <div
            className={`whitespace-pre-line font-bold leading-relaxed text-slate-900 ${
              compact ? 'text-base' : 'text-lg md:text-xl'
            }`}
          >
            <MathText text={question.stem} />
          </div>
          {isWritten && onWriteAnswer ? (
            <WrittenAnswerBox
              question={question}
              value={writtenDraft}
              onChange={(value) => {
                setWrittenDraft(value)
                onWrittenChangeRef.current?.(value)
              }}
              onSubmit={onWriteAnswer}
              locked={locked}
              showFeedback={showFeedback}
              compact={compact}
            />
          ) : (
            <OptionsList
              question={question}
              selectedIndex={selectedIndex}
              onSelect={onSelect}
              disabled={locked}
              showFeedback={showFeedback}
              compact={compact}
            />
          )}
          {showStrategy && locked ? (
            <div>
              <button
                type="button"
                onClick={() => setStrategyOpen((open) => !open)}
                aria-expanded={strategyOpen}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-2 text-sm font-extrabold text-amber-900 transition hover:bg-amber-100"
              >
                <Lightbulb className="h-5 w-5" aria-hidden="true" />
                {strategyOpen ? 'Hide strategy tip' : '💡 Show strategy tip'}
              </button>
              {strategyOpen ? <div className="mt-3">
                <StrategyPanel question={question} />
              </div> : null}
            </div>
          ) : null}
        </section>
      )}

      <ScratchpadOverlay open={scratchOpen} onClose={() => setScratchOpen(false)} resetKey={question.id} />
    </div>
  )
}
