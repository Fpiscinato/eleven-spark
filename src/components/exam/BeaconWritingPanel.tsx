import { BookOpen, Check, ClipboardCheck, Save, Sparkles, Timer, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WRITING_TASKS, countWords, type WritingTask } from '../../data/writingTasks'
import { btnPrimaryClass, btnSecondaryClass, cardClass } from '../ui'

/** Every task keeps its own draft, so switching task never loses work. */
const DRAFT_PREFIX = 'elevenspark.beacon_draft.'
/** The legacy single-draft key, migrated once so old work is not lost. */
const LEGACY_DRAFT_KEY = 'elevenspark.beacon_writing'

const PLANNING_SECONDS = 5 * 60
const WRITING_SECONDS = 20 * 60
const MAX_UNDO_STEPS = 20

/**
 * The five checks every Beacon piece must pass. They are always shown so the
 * child knows exactly what the examiner is looking for.
 */
const BEACON_CORE_CHECKS = [
  'Every sentence starts with a capital letter',
  'Every sentence ends with a full stop',
  'Used varied punctuation (! ? ,)',
  'Organized into clear paragraphs',
  'Ambitious vocabulary checked',
] as const

interface SavedPiece {
  taskId: string
  title: string
  text: string
  savedAt: number
  submittedAt?: number
  words?: number
  planningSeconds?: number
  writingSeconds?: number
  checklist?: string[]
  /** When each checklist box was ticked, so the panel can report the effort. */
  checkedAt?: number[]
}

type Step = 1 | 2 | 3

/**
 * Builds the interactive checklist for a task: the task's own reminders first
 * (they are the ones specific to the prompt), then the five standard Beacon
 * checks. Every entry is a real checkbox the child has to tick.
 */
function buildChecklist(task: WritingTask): string[] {
  const items: string[] = []
  const seen = new Set<string>()
  const coreKeys = new Set(BEACON_CORE_CHECKS.map((item) => item.toLowerCase()))
  for (const item of task.checklist) {
    const key = item.trim().toLowerCase()
    if (key === '' || seen.has(key) || coreKeys.has(key)) continue
    seen.add(key)
    items.push(item)
  }
  for (const item of BEACON_CORE_CHECKS) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }
  return items
}

function formatTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  if (safe < 60) return `${safe}s`
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds}s`
}

function draftKey(taskId: string): string {
  return `${DRAFT_PREFIX}${taskId}`
}

function readPiece(key: string): SavedPiece | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedPiece
    return typeof parsed?.text === 'string' ? parsed : null
  } catch {
    return null
  }
}

function writePiece(key: string, piece: SavedPiece): void {
  try {
    localStorage.setItem(key, JSON.stringify(piece))
  } catch {
    // Storage may be unavailable (private mode): keep the draft in memory only.
  }
}

export interface BeaconWritingPanelProps {
  /** Called once the writing has been submitted so the page can return to the main panel. */
  onSubmitted?: (() => void) | undefined
  /** Change this value to start a brand new piece (ignores any submitted draft). */
  resetKey?: string | number | undefined
}

export function BeaconWritingPanel({ onSubmitted, resetKey }: BeaconWritingPanelProps = {}) {
  const [taskIndex, setTaskIndex] = useState(0)
  const [text, setText] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [submittedAt, setSubmittedAt] = useState<number | null>(null)
  const [step, setStep] = useState<Step>(1)
  const [checked, setChecked] = useState<boolean[]>([])
  const [checkedAt, setCheckedAt] = useState<number[]>([])
  const [planningElapsed, setPlanningElapsed] = useState(0)
  const [writingElapsed, setWritingElapsed] = useState(0)
  const [history, setHistory] = useState<string[]>([])
  const stepStartedAtRef = useRef(Date.now())
  const taskIndexRef = useRef(taskIndex)
  taskIndexRef.current = taskIndex

  const task = useMemo(() => WRITING_TASKS[taskIndex] ?? WRITING_TASKS[0], [taskIndex])
  const checklist = useMemo(() => buildChecklist(task), [task])
  const words = countWords(text)
  const checkedCount = checked.filter(Boolean).length
  const allChecked = checklist.length > 0 && checkedCount === checklist.length
  const hasWriting = text.trim().length > 0
  const canSubmit = allChecked && hasWriting && savedAt !== null

  const submitted = submittedAt !== null
  const isRunning = !submitted && (step === 1 || step === 2)

  useEffect(() => {
    if (!isRunning) return
    const timer = window.setInterval(() => {
      const spent = Math.round((Date.now() - stepStartedAtRef.current) / 1000)
      if (step === 1) setPlanningElapsed(spent)
      else setWritingElapsed(spent)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isRunning, step])

  useEffect(() => {
    stepStartedAtRef.current = Date.now()
    if (step === 1) setPlanningElapsed(0)
    if (step === 2) setWritingElapsed(0)
  }, [step, taskIndex])

  /** Stores the current draft under its own task so nothing is ever lost. */
  const persistDraft = useCallback((taskId: string, draftText: string, stamp: number | null) => {
    if (draftText.trim() === '') return
    writePiece(draftKey(taskId), {
      taskId,
      title: WRITING_TASKS.find((item) => item.id === taskId)?.title ?? taskId,
      text: draftText,
      savedAt: stamp ?? Date.now(),
    })
  }, [])

  // Load the draft of the task that is being shown.
  useEffect(() => {
    const piece = readPiece(draftKey(task.id)) ?? readPiece(LEGACY_DRAFT_KEY)
    if (!piece || piece.taskId !== task.id) return
    setText((current) => (current.trim() === '' ? piece.text : current))
    setSavedAt((current) => current ?? piece.savedAt ?? null)
    setSubmittedAt(piece.submittedAt ?? null)
    setCheckedAt(piece.checkedAt ?? [])
  }, [task.id])

  // A new reset key means "start a fresh piece": the previous draft is closed
  // and a brand new task is opened, so the panel can never loop.
  const resetSeenRef = useRef(false)
  useEffect(() => {
    if (!resetSeenRef.current) {
      resetSeenRef.current = true
      return
    }
    setTaskIndex((index) => (index + 1) % WRITING_TASKS.length)
    setText('')
    setSavedAt(null)
    setSubmittedAt(null)
    setChecked([])
    setCheckedAt([])
    setHistory([])
    setStep(1)
  }, [resetKey])

  const planningLeft = Math.max(0, PLANNING_SECONDS - planningElapsed)
  const writingLeft = Math.max(0, WRITING_SECONDS - writingElapsed)

  const handleSave = () => {
    if (!hasWriting) return
    const piece: SavedPiece = {
      taskId: task.id,
      title: task.title,
      text,
      savedAt: Date.now(),
      words,
      planningSeconds: planningElapsed,
      writingSeconds: writingElapsed,
      checklist: checklist.filter((_, index) => checked[index]),
      checkedAt,
    }
    writePiece(draftKey(task.id), piece)
    setSavedAt(piece.savedAt)
    setStep(3)
  }

  const handleNewTask = () => {
    // The current draft is kept for this task, the next one opens fresh.
    persistDraft(task.id, text, savedAt)
    setTaskIndex((index) => (index + 1) % WRITING_TASKS.length)
    setText('')
    setSavedAt(null)
    setSubmittedAt(null)
    setChecked([])
    setCheckedAt([])
    setHistory([])
    setStep(1)
  }

  const handleTextChange = (value: string) => {
    setHistory((previous) => [...previous.slice(-(MAX_UNDO_STEPS - 1)), text])
    setText(value)
    setSavedAt(null)
  }

  const handleUndo = () => {
    setHistory((previous) => {
      if (previous.length === 0) return previous
      const last = previous[previous.length - 1] ?? ''
      setText(last)
      return previous.slice(0, -1)
    })
    setSavedAt(null)
  }

  const toggleCheck = (index: number) => {
    const stamp = Date.now()
    setChecked((previous) => {
      const next = [...previous]
      while (next.length < checklist.length) next.push(false)
      next[index] = !next[index]
      return next
    })
    setCheckedAt((previous) => {
      const next = [...previous]
      while (next.length < checklist.length) next.push(0)
      next[index] = next[index] === 0 ? stamp : 0
      return next
    })
  }

  const handleSubmit = () => {
    if (!canSubmit) return
    const stamp = Date.now()
    const piece: SavedPiece = {
      taskId: task.id,
      title: task.title,
      text,
      savedAt: savedAt ?? stamp,
      submittedAt: stamp,
      words,
      planningSeconds: planningElapsed,
      writingSeconds: writingElapsed,
      checklist: checklist.filter((_, index) => checked[index]),
      checkedAt,
    }
    writePiece(draftKey(task.id), piece)
    setSubmittedAt(stamp)
  }

  const checkingSeconds = useMemo(() => {
    const stamps = checkedAt.filter((value) => value > 0)
    if (stamps.length < 2) return 0
    return Math.round((Math.max(...stamps) - Math.min(...stamps)) / 1000)
  }, [checkedAt])

  return (
    <section
      className={`${cardClass} flex flex-col gap-4 border-2 border-amber-300 bg-amber-50`}
      aria-label="Beacon creative writing"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-500 text-slate-950">
          <BookOpen className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-900">Beacon Creative Writing</h2>
          <p className="text-xs font-bold text-amber-800">
            Guided step by step — read, plan, write, check, submit.
          </p>
        </div>
        <ol className="ml-auto flex items-center gap-1 text-xs font-extrabold text-amber-800">
          {(['Read', 'Write', 'Check'] as const).map((label, position) => {
            const stepNumber = (position + 1) as Step
            const done = step > stepNumber
            const current = step === stepNumber
            return (
              <li key={label} className="flex items-center gap-1">
                <span
                  className={`rounded-full px-2.5 py-1 ${
                    current
                      ? 'bg-amber-500 text-slate-950'
                      : done
                        ? 'bg-emerald-500 text-white'
                        : 'bg-white/70 text-amber-700'
                  }`}
                  aria-current={current ? 'step' : undefined}
                >
                  {stepNumber}. {label}
                </span>
                {position < 2 ? <span aria-hidden="true">→</span> : null}
              </li>
            )
          })}
        </ol>
      </div>

      {submitted ? (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center">
          <p className="text-lg font-black text-emerald-900">Writing submitted — well done!</p>
          <p className="mt-1 text-sm font-bold text-emerald-800">
            {words} words for &quot;{task.title}&quot;. You checked {checklist.length} boxes before
            handing it in.
          </p>
          <p className="mt-1 text-xs font-bold text-emerald-700">
            {formatDuration(planningElapsed + writingElapsed)} of writing
            {checkingSeconds > 0 ? ` · ${formatDuration(checkingSeconds)} checking your work` : ''}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => onSubmitted?.()} className={btnPrimaryClass}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Back to Practice
            </button>
            <button type="button" onClick={handleNewTask} className={btnSecondaryClass}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Start a new task
            </button>
          </div>
        </div>
      ) : step === 1 ? (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-amber-200 bg-white px-4 py-2.5">
            <Timer className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <span className="text-xs font-black uppercase tracking-wide text-amber-700">
              Planning time
            </span>
            <span
              className={`ml-auto text-lg font-black tabular-nums ${
                planningLeft === 0 ? 'text-rose-600' : 'text-amber-700'
              }`}
              role="timer"
              aria-label={`Planning time remaining ${formatTimer(planningLeft)}`}
            >
              {formatTimer(planningLeft)}
            </span>
          </div>
          <div className="rounded-2xl border-2 border-amber-200 bg-white p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-amber-700">{task.title}</h3>
            <p className="mt-1 text-base font-semibold leading-relaxed text-slate-800">{task.prompt}</p>
            <p className="mt-3 text-sm font-bold text-slate-600">
              Target length: about {task.targetWords} words. Use the planning time to decide the
              beginning, the middle and the end before you write.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={handleNewTask} className={btnSecondaryClass}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              New task
            </button>
            <button type="button" onClick={() => setStep(2)} className={btnPrimaryClass}>
              Next: start writing
            </button>
          </div>
        </>
      ) : step === 2 ? (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-amber-200 bg-white px-4 py-2.5">
            <Timer className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <span className="text-xs font-black uppercase tracking-wide text-amber-700">
              Writing time
            </span>
            <span
              className={`ml-auto text-lg font-black tabular-nums ${
                writingLeft === 0 ? 'text-rose-600' : 'text-amber-700'
              }`}
              role="timer"
              aria-label={`Writing time remaining ${formatTimer(writingLeft)}`}
            >
              {formatTimer(writingLeft)}
            </span>
          </div>
          <div className="rounded-2xl border-2 border-amber-200 bg-white p-3">
            <p className="text-sm font-black text-amber-800">{task.title}</p>
            <p className="text-xs font-semibold text-slate-700">{task.prompt}</p>
          </div>
          <label
            htmlFor="beacon-writing"
            className="text-sm font-black uppercase tracking-wide text-slate-500"
          >
            Your writing
          </label>
          <textarea
            id="beacon-writing"
            value={text}
            onChange={(event) => handleTextChange(event.target.value)}
            rows={10}
            placeholder="Start writing here…"
            className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 text-lg font-semibold leading-relaxed text-slate-900 focus:border-amber-500 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${
                words >= task.targetWords
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {words} / {task.targetWords} words
            </span>
            {savedAt !== null ? (
              <span className="text-sm font-bold text-emerald-700">Draft saved</span>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              {history.length > 0 ? (
                <button type="button" onClick={handleUndo} className={btnSecondaryClass}>
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  Undo
                </button>
              ) : null}
              <button type="button" onClick={() => setStep(1)} className={btnSecondaryClass}>
                Back
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasWriting}
                className={btnPrimaryClass}
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                Save and go to checklist
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-black text-emerald-800">
              Writing saved — {words} words for {task.title}
            </p>
            <p className="text-xs font-semibold text-slate-700">
              Tick every box to prove you have checked your work. The submit button unlocks only
              when all {checklist.length} checks are done.
            </p>
          </div>
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                Check your work
              </p>
              <span
                className={`ml-auto rounded-full px-3 py-1 text-xs font-extrabold ${
                  allChecked ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}
                aria-live="polite"
              >
                {checkedCount} / {checklist.length} checked
              </span>
            </div>
            <ul className="mt-3 grid gap-2">
              {checklist.map((item, index) => {
                const isChecked = checked[index] === true
                return (
                  <li key={item}>
                    <label
                      className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2 transition ${
                        isChecked
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(index)}
                        className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer accent-emerald-600"
                      />
                      <span
                        className={`text-sm font-bold ${
                          isChecked ? 'text-emerald-800 line-through' : 'text-slate-700'
                        }`}
                      >
                        {item}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setStep(2)} className={btnSecondaryClass}>
              Edit writing
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={btnPrimaryClass}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Submit writing
            </button>
          </div>
          {!allChecked ? (
            <p className="text-xs font-bold text-amber-700">
              Tick all {checklist.length} boxes to unlock the submit button.
            </p>
          ) : !hasWriting ? (
            <p className="text-xs font-bold text-amber-700">
              Your writing is empty — go back and add some sentences.
            </p>
          ) : savedAt === null ? (
            <p className="text-xs font-bold text-amber-700">
              Save your writing first so nothing gets lost.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
