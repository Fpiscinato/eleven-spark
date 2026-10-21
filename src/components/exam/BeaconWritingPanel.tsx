import { BookOpen, Check, Save, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { WRITING_TASKS, countWords } from '../../data/writingTasks'
import { btnPrimaryClass, btnSecondaryClass, cardClass } from '../ui'

const STORAGE_KEY = 'elevenspark.beacon_writing'

interface SavedPiece {
  taskId: string
  title: string
  text: string
  savedAt: number
}

function readSaved(): SavedPiece | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as SavedPiece
    if (typeof parsed?.text !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function BeaconWritingPanel() {
  const [taskIndex, setTaskIndex] = useState(0)
  const [text, setText] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const task = useMemo(() => WRITING_TASKS[taskIndex] ?? WRITING_TASKS[0], [taskIndex])
  const words = countWords(text)
  const saved = readSaved()

  const handleSave = () => {
    const piece: SavedPiece = {
      taskId: task.id,
      title: task.title,
      text,
      savedAt: Date.now(),
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(piece))
      setSavedAt(piece.savedAt)
    } catch {
      setSavedAt(null)
    }
  }

  const handleNewTask = () => {
    setTaskIndex((index) => (index + 1) % WRITING_TASKS.length)
    setText('')
    setSavedAt(null)
  }

  return (
    <section className={`${cardClass} flex flex-col gap-3 border-2 border-amber-300 bg-amber-50`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white">
          <BookOpen className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-900">Beacon Creative Writing</h2>
          <p className="text-xs font-bold text-amber-800">
            The Beacon Paper has a writing task at the end. Practise it here.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-amber-200 bg-white p-4">
        <h3 className="text-sm font-black uppercase tracking-wide text-amber-700">{task.title}</h3>
        <p className="mt-1 text-base font-semibold leading-relaxed text-slate-800">{task.prompt}</p>
      </div>

      <label htmlFor="beacon-writing" className="text-sm font-black uppercase tracking-wide text-slate-500">
        Your writing
      </label>
      <textarea
        id="beacon-writing"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setSavedAt(null)
        }}
        rows={10}
        placeholder="Start writing here…"
        className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 text-lg font-semibold leading-relaxed text-slate-900 focus:border-amber-500 focus:outline-none"
      />

      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${
            words >= task.targetWords ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {words} / {task.targetWords} words
        </span>
        {savedAt !== null ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-extrabold text-emerald-800">
            <Check className="h-4 w-4" aria-hidden="true" />
            Saved
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={handleNewTask} className={btnSecondaryClass}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            New task
          </button>
          <button type="button" onClick={handleSave} disabled={text.trim() === ''} className={btnPrimaryClass}>
            <Save className="h-4 w-4" aria-hidden="true" />
            Save my writing
          </button>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Check your work</p>
        <ul className="mt-2 grid gap-1.5">
          {task.checklist.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm font-bold text-slate-700">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 border-slate-300" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {saved && saved.text.trim() !== '' && savedAt === null ? (
        <p className="text-xs font-bold text-slate-500">
          Last saved piece: &ldquo;{saved.title}&rdquo; ({countWords(saved.text)} words).
        </p>
      ) : null}
    </section>
  )
}
