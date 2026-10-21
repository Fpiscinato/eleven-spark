import {
  ChevronDown,
  ClipboardList,
  Flag,
  Info,
  Lock,
  LockOpen,
  PencilLine,
  Printer,
  Trophy,
  X,
  Star,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MathText } from '../components/exam/MathText'
import { NvrFigureSvg, NvrSvgRenderer } from '../components/exam/NvrSvgRenderer'
import { QuestionView } from '../components/exam/QuestionView'
import { ScratchpadOverlay } from '../components/exam/ScratchpadOverlay'
import {
  AccuracyBar,
  ScreenHeader,
  btnPrimaryClass,
  btnSecondaryClass,
  cardClass,
} from '../components/ui'
import { db } from '../db/database'
import { CORE_SUBJECTS } from '../db/schemas'
import type { Attempt, Passage, Question, SectionBreakdownEntry } from '../db/schemas'
import {
  EXAM_CONFIGS,
  EXAM_MODES,
  pickBalancedQuestions,
  shuffleQuestions,
  type ExamConfig,
  type ExamMode,
} from '../lib/exam'
import { formatClock, formatMinutes, uid } from '../lib/format'
import { capTimeSpent } from '../lib/timing'
import { isWrittenAnswerCorrect } from '../lib/writtenAnswer'
import { abandonSession, completeSession, startSession } from '../lib/sessionHelpers'
import {
  readSession,
  removeSession,
  SESSION_KEYS,
  writeSession,
} from '../lib/sessionPersistence'
import { useProfile } from '../context/ProfileContext'
import { useParentGate } from '../context/ParentGateContext'
import { celebrateSpecial } from '../components/brand/SpecialDedicationModal'
import { scheduleSync } from '../services/gistSync'
import type { ScreenId } from '../types'
import { WRITING_TASKS } from '../data/writingTasks'

type Phase = 'intro' | 'running' | 'transition' | 'results'

const LETTERS = ['A', 'B', 'C', 'D', 'E']

/** The five criteria the Beacon creative writing task is marked on. */
const CREATIVE_RUBRIC = [
  'Ideas & Creativity',
  'Paragraphs & Structure',
  'Ambitious Vocabulary',
  'Grammar & Sentence Variety',
  'Punctuation & Spelling',
] as const

const OMR_INSTRUCTIONS =
  'Use this tool to quickly input answers from your printed OMR paper sheet to instantly grade mock exams and update analytics.'

function OmrInstructionsCard({ className = '' }: { className?: string }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-2xl border border-sky-200 bg-white/80 p-3 text-sm font-semibold leading-relaxed text-sky-950 ${className}`}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
      <span>{OMR_INSTRUCTIONS}</span>
    </p>
  )
}

interface ReportDetail {
  question: Question
  sectionIndex: number
  selectedIndex: number | null
  writtenAnswer?: string
  isCorrect: boolean
  timeSeconds: number
  flagged: boolean
}

interface MockReport {
  config: ExamConfig
  timed: boolean
  scorePercentage: number
  correct: number
  total: number
  timeSeconds: number
  breakdown: SectionBreakdownEntry[]
  details: ReportDetail[]
  previousBest: number | null
}

interface Engine {
  sessionId: string
  profileId: string
  config: ExamConfig
  sectionQuestions: Question[][]
  passagesById: Map<string, Passage>
  sectionIndex: number
  cursor: number
  answers: Record<string, number | string | null>
  flags: Record<string, boolean>
  timeUsedBySection: number[]
  startedAt: number
  creativeTaskId?: string
  creativeText?: string
  /** Self-marked rubric scores for the creative writing task (1 to 4). */
  creativeScores?: Record<string, number>
}

interface EngineSnapshot {
  engine: Omit<Engine, 'passagesById'>
  passages: Passage[]
  remaining: number
  phase: 'running' | 'transition'
  savedAt: number
}

interface SectionAlert {
  key: number
  text: string
  tone: 'warn' | 'urgent'
}

function praiseFor(percent: number): string {
  if (percent >= 80) return 'Outstanding! You would make Gloucestershire proud.'
  if (percent >= 60) return 'Well done! Solid work under real exam conditions.'
  return 'You finished the paper — that takes courage. Every practice makes you stronger.'
}

function letterOf(index: number | null): string {
  if (index === null) return 'Blank'
  return LETTERS[index] ?? 'Blank'
}

function parseAnswerLetters(raw: string): string {
  return raw.toUpperCase().replace(/[^A-E]/g, '')
}

async function loadQuestionsForSubjects(
  subjects: readonly string[],
): Promise<{ questions: Question[]; passagesById: Map<string, Passage> }> {
  const questions = (await db.questions.where('subject').anyOf(subjects).toArray()).sort((a, b) =>
    a.id.localeCompare(b.id),
  )
  const passageIds = questions
    .map((question) => question.passageId)
    .filter((id): id is string => id !== undefined)
  const passages = passageIds.length > 0 ? await db.passages.bulkGet(passageIds) : []
  const passagesById = new Map<string, Passage>()
  for (const passage of passages) {
    if (passage) passagesById.set(passage.id, passage)
  }
  return { questions, passagesById }
}

async function loadSectionsForConfig(config: ExamConfig): Promise<{
  sectionQuestions: Question[][]
  passagesById: Map<string, Passage>
}> {
  if (config.mode === 'mini_mock') {
    const { questions, passagesById } = await loadQuestionsForSubjects(CORE_SUBJECTS)
    const mixed = shuffleQuestions(questions)
    const firstCount = config.sections[0]?.questionCount ?? 12
    const secondCount = config.sections[1]?.questionCount ?? 12
    const first = pickBalancedQuestions(mixed, firstCount, (question) => question.subject)
    const remaining = mixed.filter((question) => !first.includes(question))
    const second = pickBalancedQuestions(remaining, secondCount, (question) => question.subject)
    return { sectionQuestions: [first, second], passagesById }
  }
  const sectionQuestions: Question[][] = []
  const passagesById = new Map<string, Passage>()
  for (const section of config.sections) {
    // A creative writing section is a task, not a multiple choice question:
    // it must never add a phantom "unanswered" question to the score.
    if (section.creativeWriting === true) {
      sectionQuestions.push([])
      continue
    }
    const loaded = await loadQuestionsForSubjects(section.subjects)
    // A written-answers section must actually ask for written answers. The
    // short_text questions are placed first inside every topic group, so each
    // topic still contributes to the paper but the child types her answers
    // instead of ticking A-E wherever the bank allows it.
    const pool =
      section.writtenMode === true
        ? [...loaded.questions].sort((a, b) => {
            const aWritten = a.answerType === 'short_text' ? 0 : 1
            const bWritten = b.answerType === 'short_text' ? 0 : 1
            return aWritten - bWritten
          })
        : loaded.questions
    const chosen = pickBalancedQuestions(pool, section.questionCount, (question) =>
      question.topic ?? question.subject,
    )
    sectionQuestions.push(chosen)
    for (const [id, passage] of loaded.passagesById) {
      passagesById.set(id, passage)
    }
  }
  return { sectionQuestions, passagesById }
}

function paperPrintable(counts: Record<ExamMode, number[]> | null): boolean {
  if (!counts) return false
  return EXAM_MODES.some((mode) => EXAM_CONFIGS[mode].omrEligible && counts[mode].some((n) => n > 0))
}

interface OmrSheetOverlayProps {
  mode: ExamMode
  onSelectMode: (mode: ExamMode) => void
  onClose: () => void
}

function OmrSheetOverlay({ mode, onSelectMode, onClose }: OmrSheetOverlayProps) {
  const [sections, setSections] = useState<Question[][] | null>(null)
  const config = EXAM_CONFIGS[mode]

  useEffect(() => {
    let cancelled = false
    setSections(null)
    void (async () => {
      const loaded = await loadSectionsForConfig(config)
      if (!cancelled) setSections(loaded.sectionQuestions)
    })()
    return () => {
      cancelled = true
    }
  }, [config])

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-200">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-center gap-2 border-b border-slate-300 bg-white px-4 py-3">
        {EXAM_MODES.filter((candidate) => EXAM_CONFIGS[candidate].omrEligible).map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => onSelectMode(candidate)}
            className={`min-h-[44px] rounded-xl border-2 px-4 py-2 text-sm font-extrabold transition ${
              candidate === mode
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            {EXAM_CONFIGS[candidate].title}
          </button>
        ))}
        <button
          type="button"
          onClick={() => window.print()}
          className={`${btnPrimaryClass} min-h-[44px] px-4 py-2 text-sm`}
        >
          <Printer className="mr-2 inline h-4 w-4" aria-hidden="true" />
          Print now
        </button>
        <button type="button" onClick={onClose} className={`${btnSecondaryClass} min-h-[44px] px-4 py-2 text-sm`}>
          Close
        </button>
      </div>

      <div className="omr-print-area mx-auto my-6 w-full max-w-[860px] border border-[#cbd5e1] bg-[#ffffff] p-6 shadow-xl md:p-10">
        <header className="mb-5 border-b-2 border-[#0f172a] pb-4">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#475569]">
            ElevenSpark practice sheet · G7 FSCE format
          </p>
          <h1 className="mt-1 text-xl font-black text-[#0f172a]">{config.title} — Answer Sheet</h1>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm font-bold text-[#0f172a]">
            <span>
              Name:{' '}
              <span className="inline-block w-48 border-b border-[#0f172a] align-bottom">&nbsp;</span>
            </span>
            <span>
              Date:{' '}
              <span className="inline-block w-32 border-b border-[#0f172a] align-bottom">&nbsp;</span>
            </span>
          </div>
          <ul className="mt-3 list-inside list-disc text-xs font-semibold text-[#334155]">
            <li>
              While reading the questions on screen, mark one box per row with a pencil:{' '}
              {LETTERS.map((letter) => `[${letter}]`).join(' ')}
            </li>
            <li>Use the on-screen countdown for each section. You may erase and change an answer.</li>
            <li>After the run (or with a parent), use Quick Grade Paper OMR to score this sheet.</li>
          </ul>
        </header>

        {sections === null ? (
          <p className="py-8 text-center text-sm font-bold text-[#475569]">Loading the sheet rows...</p>
        ) : (
          config.sections.map((section, sectionIndex) => {
            const rows = sections[sectionIndex] ?? []
            return (
              <section key={section.id} className="mb-6">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-[#94a3b8] pb-1">
                  <h2 className="text-sm font-black uppercase tracking-wide text-[#0f172a]">
                    {section.title} — {section.subjectLabel}
                  </h2>
                  <span className="text-xs font-bold text-[#334155]">
                    {rows.length} questions · {formatMinutes(section.timeSeconds)}
                  </span>
                </div>
                {rows.length === 0 ? (
                  <p className="py-3 text-xs font-bold text-[#475569]">
                    No questions in the bank for this section yet.
                  </p>
                ) : (
                  <ol className="flex flex-col">
                    {rows.map((row, index) => (
                      <li
                        key={row.id}
                        className="flex items-center gap-3 border-b border-dotted border-[#cbd5e1] py-1"
                      >
                        <span className="w-8 text-right text-sm font-black tabular-nums text-[#0f172a]">
                          {index + 1}
                        </span>
                        <span className="flex gap-2">
                          {LETTERS.map((letter) => (
                            <span
                              key={letter}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-[3px] border border-[#0f172a] text-[11px] font-black text-[#0f172a]"
                            >
                              {letter}
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )
          })
        )}

        <footer className="mt-4 border-t border-[#cbd5e1] pt-3 text-[10px] font-semibold uppercase tracking-wider text-[#475569]">
          ElevenSpark practice sheet — training only, not the real Gloucestershire test paper.
        </footer>
      </div>
    </div>
  )
}

interface OmrGradeOverlayProps {
  mode: ExamMode
  counts: Record<ExamMode, number[]>
  onSelectMode: (mode: ExamMode) => void
  onClose: () => void
  onGrade: (mode: ExamMode, lettersBySection: string[][]) => Promise<void>
}

function OmrGradeOverlay({ mode, counts, onSelectMode, onClose, onGrade }: OmrGradeOverlayProps) {
  const [values, setValues] = useState<Record<string, string[]>>(() => ({
    mock_paper_1: ['', ''],
    mock_paper_2: ['', ''],
    mini_mock: ['', ''],
  }))
  const [grading, setGrading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const config = EXAM_CONFIGS[mode]
  const sectionCounts = counts[mode] ?? [0, 0]
  const currentValues = values[mode] ?? ['', '']

  const parsed = currentValues.map((value, index) => {
    const letters = parseAnswerLetters(value)
    return { letters, allowed: sectionCounts[index] ?? 0 }
  })
  const anyOverflow = parsed.some((entry) => entry.letters.length > entry.allowed)
  const totalLetters = parsed.reduce((sum, entry) => sum + entry.letters.length, 0)
  const canGrade = !anyOverflow && totalLetters > 0 && !grading

  const setValue = (sectionIndex: number, nextValue: string) => {
    setValues((previous) => {
      const forMode = [...(previous[mode] ?? ['', ''])]
      forMode[sectionIndex] = nextValue
      return { ...previous, [mode]: forMode }
    })
    setError(null)
  }

  const handleGrade = () => {
    if (!canGrade) {
      if (anyOverflow) setError('More letters than questions — check the counts above.')
      else setError('Type at least one letter (A–E) to grade.')
      return
    }
    setGrading(true)
    setError(null)
    void onGrade(
      mode,
      parsed.map((entry) => entry.letters.split('')),
    ).catch(() => {
      setError('Something went wrong while saving. Please try again.')
      setGrading(false)
    })
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-200">
      <div className="no-print mx-auto my-6 w-full max-w-2xl rounded-3xl border border-slate-300 bg-white p-6 shadow-xl md:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-sky-700">Paper OMR Sheet Mode</p>
            <h2 className="text-xl font-black text-slate-900">Quick Grade Paper OMR</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`${btnSecondaryClass} min-h-[44px] px-4 py-2 text-sm`}
          >
            Close
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {EXAM_MODES.filter((candidate) => EXAM_CONFIGS[candidate].omrEligible).map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => {
                onSelectMode(candidate)
                setError(null)
              }}
              className={`min-h-[44px] rounded-xl border-2 px-4 py-2 text-sm font-extrabold transition ${
                candidate === mode
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {EXAM_CONFIGS[candidate].title}
            </button>
          ))}
        </div>

        <p className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold leading-relaxed text-sky-900">
          Type the letters you marked on the printed sheet, in order — one letter per question. Spaces,
          commas and dashes are ignored. Unanswered rows stay blank.
        </p>

        <OmrInstructionsCard className="mb-4" />

        <div className="flex flex-col gap-4">
          {config.sections.map((section, sectionIndex) => {
            const letters = parsed[sectionIndex]?.letters ?? ''
            const allowed = parsed[sectionIndex]?.allowed ?? 0
            const over = letters.length > allowed
            return (
              <label key={section.id} className="flex flex-col gap-1.5">
                <span className="text-sm font-black text-slate-800">
                  {section.title} — {section.subjectLabel}
                  <span className={`ml-2 text-xs font-bold ${over ? 'text-rose-600' : 'text-slate-500'}`}>
                    {letters.length}/{allowed} letters
                  </span>
                </span>
                <input
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={currentValues[sectionIndex] ?? ''}
                  onChange={(event) => setValue(sectionIndex, event.target.value)}
                  placeholder="e.g. ADBEC ADCEA ..."
                  className="min-h-[52px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 font-mono text-base font-bold tracking-[0.3em] text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                />
              </label>
            )
          })}
        </div>

        {error ? (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleGrade}
            disabled={!canGrade}
            className={`${btnPrimaryClass} flex-1 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <PencilLine className="mr-2 inline h-5 w-5" aria-hidden="true" />
            {grading ? 'Grading...' : 'Grade this sheet'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`${btnSecondaryClass} flex-1`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

interface MockExamPageProps {
  onNavigate: (screen: ScreenId) => void
}

export function MockExamPage({ onNavigate }: MockExamPageProps) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [engine, setEngine] = useState<Engine | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [transitionExpired, setTransitionExpired] = useState(false)
  const [finishStep, setFinishStep] = useState<0 | 1 | 2>(0)
  const [report, setReport] = useState<MockReport | null>(null)
  const [introCounts, setIntroCounts] = useState<Record<ExamMode, number[]> | null>(null)
  const [alert, setAlert] = useState<SectionAlert | null>(null)
  const [omrSheetMode, setOmrSheetMode] = useState<ExamMode | null>(null)
  const [gradeMode, setGradeMode] = useState<ExamMode | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [cancelStep, setCancelStep] = useState<0 | 1 | 2>(0)
  const [scratchOpen, setScratchOpen] = useState(false)
  const { activeProfileId } = useProfile()
  const { parentMode, requestUnlock } = useParentGate()
  const questionShownAtRef = useRef(0)
  const timeSpentRef = useRef<Record<string, number>>({})
  const sectionEndingRef = useRef(false)
  /** True once the paper has been handed in: no more snapshots, no resume. */
  const paperFinishedRef = useRef(false)
  const engineRef = useRef<Engine | null>(null)
  const phaseRef = useRef<Phase>('intro')

  useEffect(() => {
    engineRef.current = engine
  }, [engine])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    return () => {
      const current = engineRef.current
      if (current && (phaseRef.current === 'running' || phaseRef.current === 'transition')) {
        // The paper is kept in session storage so the child can carry on
        // after switching screen or tab. It is only abandoned when there is
        // nothing left to resume.
        if (!readSession<EngineSnapshot>(SESSION_KEYS.mockEngine)) {
          const totalTimeSeconds = Math.round((Date.now() - current.startedAt) / 1000)
          void abandonSession(current.sessionId, totalTimeSeconds)
        }
      }
    }
  }, [])

  useEffect(() => {
    if (!engine || (phase !== 'running' && phase !== 'transition')) return
    if (paperFinishedRef.current) return
    const { passagesById, ...rest } = engine
    writeSession(SESSION_KEYS.mockEngine, {
      engine: rest,
      passages: [...passagesById.values()],
      remaining,
      phase,
      savedAt: Date.now(),
    } satisfies EngineSnapshot)
  }, [engine, phase, remaining])

  useEffect(() => {
    const snapshot = readSession<EngineSnapshot>(SESSION_KEYS.mockEngine)
    if (!snapshot) return
    if (snapshot.engine.profileId !== activeProfileId) {
      removeSession(SESSION_KEYS.mockEngine)
      return
    }
    const restored: Engine = {
      ...snapshot.engine,
      passagesById: new Map(snapshot.passages.map((passage) => [passage.id, passage])),
    }
    setEngine(restored)
    setRemaining(Math.max(1, snapshot.remaining))
    setPhase(snapshot.phase)
    setAlert({
      key: Date.now(),
      text: 'We saved your exam — pick up exactly where you left off.',
      tone: 'warn',
    })
  }, [activeProfileId])

  const fetchPersonalBest = useCallback(async (mode: ExamMode): Promise<number | null> => {
    const best = await db.sessions
      .where('profileId')
      .equals(activeProfileId)
      .and((session) => session.mode === mode && session.status === 'completed')
      .sortBy('scorePercentage')
    if (best.length === 0) return null
    return best[best.length - 1]?.scorePercentage ?? null
  }, [activeProfileId])

  useEffect(() => {
    void (async () => {
      const [englishCount, , , mathsCount, compassCount] = await Promise.all([
        db.questions.where('subject').equals('english').count(),
        db.questions.where('subject').equals('vr').count(),
        db.questions.where('subject').equals('nvr').count(),
        db.questions.where('subject').equals('maths').count(),
        db.questions.where('subject').equals('compass').count(),
      ])
      const available: Record<ExamMode, number[]> = {
        mock_paper_1: [englishCount, mathsCount],
        mock_paper_2: [Math.min(englishCount, mathsCount), 1], // written answers + creative writing
        mock_paper_3: [compassCount],
        mini_mock: [Math.min(englishCount, mathsCount), compassCount],
      }
      const counts: Record<ExamMode, number[]> = {
        mock_paper_1: [],
        mock_paper_2: [],
        mock_paper_3: [],
        mini_mock: [],
      }
      for (const mode of EXAM_MODES) {
        counts[mode] = EXAM_CONFIGS[mode].sections.map((section, index) =>
          Math.min(section.questionCount, available[mode][index] ?? 0),
        )
      }
      setIntroCounts(counts)
    })()
  }, [phase])

  const startPaper = useCallback(
    async (mode: ExamMode) => {
      const config = EXAM_CONFIGS[mode]
      const { sectionQuestions, passagesById } = await loadSectionsForConfig(config)
      if (sectionQuestions.every((questions) => questions.length === 0)) return
      const sessionId = await startSession(mode, activeProfileId)
      timeSpentRef.current = {}
      questionShownAtRef.current = Date.now()
      sectionEndingRef.current = false
      paperFinishedRef.current = false
      setReport(null)
      setFinishStep(0)
      setAlert(null)
      const creativeTaskId =
        mode === 'mock_paper_2' && WRITING_TASKS.length > 0 ? WRITING_TASKS[Math.floor(Math.random() * WRITING_TASKS.length)].id : undefined
      setEngine({
        sessionId,
        profileId: activeProfileId,
        config,
        sectionQuestions,
        passagesById,
        sectionIndex: 0,
        cursor: 0,
        answers: {},
        flags: {},
        timeUsedBySection: config.sections.map(() => 0),
        startedAt: Date.now(),
        creativeTaskId,
        creativeText: '',
      })
      setRemaining(config.sections[0].timeSeconds)
      setPhase('running')
    },
    [activeProfileId],
  )

  const accrueCurrentQuestion = useCallback(() => {
    if (!engine) return
    const question = engine.sectionQuestions[engine.sectionIndex]?.[engine.cursor]
    if (!question) return
    const now = Date.now()
    const delta = Math.max(0, (now - questionShownAtRef.current) / 1000)
    timeSpentRef.current[question.id] = (timeSpentRef.current[question.id] ?? 0) + delta
    questionShownAtRef.current = now
  }, [engine])

  const submitPaper = useCallback(
    async (finalEngine: Engine, extraTimeUsedSeconds: number) => {
      const { config, sectionQuestions } = finalEngine
      const timeUsedBySection = [...finalEngine.timeUsedBySection]
      const lastIndex = sectionQuestions.length - 1
      timeUsedBySection[lastIndex] = (timeUsedBySection[lastIndex] ?? 0) + extraTimeUsedSeconds
      let correct = 0
      let total = 0
      const details: ReportDetail[] = []
      const attempts: Attempt[] = []
      const breakdown: SectionBreakdownEntry[] = []
      sectionQuestions.forEach((questions, sectionIndex) => {
        let sectionCorrect = 0
        questions.forEach((question) => {
          const rawAnswer = finalEngine.answers[question.id] ?? null
          const writtenAnswer = typeof rawAnswer === 'string' ? rawAnswer : undefined
          const selectedIndex = typeof rawAnswer === 'number' ? rawAnswer : null
          const isCorrect =
            writtenAnswer !== undefined
              ? isWrittenAnswerCorrect(question, writtenAnswer)
              : selectedIndex === question.correctIndex
          const timeSeconds = capTimeSpent(Math.round(timeSpentRef.current[question.id] ?? 0))
          const flagged = finalEngine.flags[question.id] === true
          if (isCorrect) {
            correct += 1
            sectionCorrect += 1
          }
          total += 1
          details.push({ question, sectionIndex, selectedIndex, writtenAnswer, isCorrect, timeSeconds, flagged })
          attempts.push({
            id: uid(),
            profileId: finalEngine.profileId,
            sessionId: finalEngine.sessionId,
            questionId: question.id,
            subject: question.subject,
            topic: question.topic,
            difficulty: question.difficulty,
            selectedIndex,
            writtenAnswer,
            isCorrect,
            timeSpentSeconds: timeSeconds,
            flagged,
            timestamp: Date.now(),
          })
        })
        const section = config.sections[sectionIndex]
        if (section.creativeWriting === true) {
          // The creative task is not auto-marked: it is reported with the
          // number of words written instead of a fake "wrong answer".
          const wordCount = (finalEngine.creativeText ?? '')
            .trim()
            .split(/\s+/)
            .filter(Boolean).length
          breakdown.push({
            section: `${section.title} — ${section.subjectLabel} (${wordCount} words written)`,
            correct: 0,
            total: 0,
            timeSeconds: Math.round(timeUsedBySection[sectionIndex] ?? 0),
          })
          return
        }
        breakdown.push({
          section: `${section.title} — ${section.subjectLabel}`,
          correct: sectionCorrect,
          total: questions.length,
          timeSeconds: Math.round(timeUsedBySection[sectionIndex] ?? 0),
        })
      })
      if (attempts.length > 0) {
        await db.attempts.bulkAdd(attempts)
      }
      const scorePercentage = total === 0 ? 0 : Math.round((correct / total) * 100)
      const timeSeconds = Math.round((Date.now() - finalEngine.startedAt) / 1000)
      const previousBest = await fetchPersonalBest(finalEngine.config.mode)
      await completeSession(finalEngine.sessionId, {
        totalTimeSeconds: timeSeconds,
        scorePercentage,
        sectionBreakdown: breakdown,
      })
      scheduleSync()
      const isNewBest = previousBest !== null && scorePercentage > previousBest
      if (isNewBest) {
        celebrateSpecial({
          title: '🎉 New Personal Best!',
          message: `You scored ${scorePercentage}% on ${finalEngine.config.title} — your best yet! Previous best: ${previousBest}%.`,
        })
      }
      setReport({
        config: finalEngine.config,
        timed: true,
        scorePercentage,
        correct,
        total,
        timeSeconds,
        breakdown,
        details,
        previousBest,
      })
      // The paper is done: the saved engine is deleted so the child is never
      // sent back to the last question of a finished exam.
      paperFinishedRef.current = true
      setEngine(null)
      removeSession(SESSION_KEYS.mockEngine)
      setPhase('results')
    },
    [fetchPersonalBest],
  )

  const gradeOmrPaper = useCallback(
    async (mode: ExamMode, lettersBySection: string[][]) => {
      const config = EXAM_CONFIGS[mode]
      const { sectionQuestions } = await loadSectionsForConfig(config)
      if (sectionQuestions.every((questions) => questions.length === 0)) return
      const sessionId = await startSession(mode, activeProfileId)
      let correct = 0
      let total = 0
      const details: ReportDetail[] = []
      const attempts: Attempt[] = []
      const breakdown: SectionBreakdownEntry[] = []
      sectionQuestions.forEach((questions, sectionIndex) => {
        let sectionCorrect = 0
        questions.forEach((question, index) => {
          const letter = lettersBySection[sectionIndex]?.[index]
          const letterIndex = letter === undefined ? -1 : LETTERS.indexOf(letter)
          const selectedIndex = letterIndex >= 0 ? letterIndex : null
          const isCorrect = selectedIndex === question.correctIndex
          if (isCorrect) {
            correct += 1
            sectionCorrect += 1
          }
          total += 1
          details.push({ question, sectionIndex, selectedIndex, isCorrect, timeSeconds: 0, flagged: false })
          attempts.push({
            id: uid(),
            profileId: activeProfileId,
            sessionId,
            questionId: question.id,
            subject: question.subject,
            topic: question.topic,
            difficulty: question.difficulty,
            selectedIndex,
            isCorrect,
            timeSpentSeconds: 0,
            flagged: false,
            timestamp: Date.now(),
          })
        })
        const section = config.sections[sectionIndex]
        breakdown.push({
          section: `${section.title} — ${section.subjectLabel}`,
          correct: sectionCorrect,
          total: questions.length,
          timeSeconds: 0,
        })
      })
      if (attempts.length > 0) {
        await db.attempts.bulkAdd(attempts)
      }
      const scorePercentage = total === 0 ? 0 : Math.round((correct / total) * 100)
      const previousBest = await fetchPersonalBest(mode)
      await completeSession(sessionId, {
        totalTimeSeconds: 0,
        scorePercentage,
        sectionBreakdown: breakdown,
      })
      scheduleSync()
      setGradeMode(null)
      setEngine(null)
      removeSession(SESSION_KEYS.mockEngine)
      setReport({ config, timed: false, scorePercentage, correct, total, timeSeconds: 0, breakdown, details, previousBest })
      setPhase('results')
    },
    [activeProfileId, fetchPersonalBest],
  )

  const finishSection = useCallback(
    (expired: boolean) => {
      if (!engine || sectionEndingRef.current) return
      sectionEndingRef.current = true
      accrueCurrentQuestion()
      const sectionConfig = engine.config.sections[engine.sectionIndex]
      const timeUsed = expired ? sectionConfig.timeSeconds : sectionConfig.timeSeconds - remaining
      const timeUsedBySection = [...engine.timeUsedBySection]
      timeUsedBySection[engine.sectionIndex] =
        (timeUsedBySection[engine.sectionIndex] ?? 0) + Math.max(0, timeUsed)
      const updated: Engine = { ...engine, timeUsedBySection }
      const isLastSection = engine.sectionIndex >= engine.config.sections.length - 1
      if (isLastSection) {
        void submitPaper(updated, 0).finally(() => {
          sectionEndingRef.current = false
        })
        return
      }
      setEngine(updated)
      setTransitionExpired(expired)
      setFinishStep(0)
      setAlert(null)
      setPhase('transition')
      sectionEndingRef.current = false
    },
    [engine, remaining, accrueCurrentQuestion, submitPaper],
  )

  useEffect(() => {
    if (phase !== 'running') return
    const timer = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase === 'running' && remaining === 0 && engine) {
      finishSection(true)
    }
  }, [phase, remaining, engine, finishSection])

  useEffect(() => {
    if (phase !== 'running') return
    const sectionLabel = engine?.config.sections[engine.sectionIndex]?.title ?? 'this section'
    let next: SectionAlert | null = null
    if (remaining === 300) {
      next = {
        key: Date.now(),
        text: `5 minutes left in ${sectionLabel} — keep a steady pace.`,
        tone: 'warn',
      }
    } else if (remaining === 60) {
      next = {
        key: Date.now(),
        text: `1 minute left in ${sectionLabel} — stay calm and finish strong.`,
        tone: 'urgent',
      }
    }
    if (!next) return
    setAlert(next)
  }, [remaining, phase, engine])

  useEffect(() => {
    if (!alert) return
    const hideTimer = window.setTimeout(() => setAlert(null), 7000)
    return () => window.clearTimeout(hideTimer)
  }, [alert])

  const advanceToNextSection = useCallback(() => {
    if (!engine) return
    const nextIndex = engine.sectionIndex + 1
    const nextSection = engine.config.sections[nextIndex]
    if (!nextSection) return
    setEngine((current) => (current ? { ...current, sectionIndex: nextIndex, cursor: 0 } : current))
    setRemaining(nextSection.timeSeconds)
    setAlert(null)
    questionShownAtRef.current = Date.now()
    setPhase('running')
  }, [engine])

  const goToQuestion = useCallback(
    (index: number) => {
      accrueCurrentQuestion()
      setScratchOpen(false)
      setEngine((current) => (current ? { ...current, cursor: index } : current))
    },
    [accrueCurrentQuestion],
  )

  const selectAnswer = useCallback((optionIndex: number) => {
    setEngine((current) => {
      if (!current) return current
      const question = current.sectionQuestions[current.sectionIndex]?.[current.cursor]
      if (!question) return current
      return {
        ...current,
        answers: { ...current.answers, [question.id]: optionIndex },
      }
    })
  }, [])

  const submitWrittenAnswer = useCallback((value: string) => {
    const trimmed = value.trim()
    if (trimmed === '') return
    setEngine((current) => {
      if (!current) return current
      const question = current.sectionQuestions[current.sectionIndex]?.[current.cursor]
      if (!question) return current
      return {
        ...current,
        answers: { ...current.answers, [question.id]: trimmed },
      }
    })
  }, [])

  const toggleFlag = useCallback(() => {
    setEngine((current) => {
      if (!current) return current
      const question = current.sectionQuestions[current.sectionIndex]?.[current.cursor]
      if (!question) return current
      return {
        ...current,
        flags: { ...current.flags, [question.id]: !(current.flags[question.id] === true) },
      }
    })
  }, [])

  const goIntro = () => {
    const current = engineRef.current
    if (current) {
      const totalTimeSeconds = Math.round((Date.now() - current.startedAt) / 1000)
      void abandonSession(current.sessionId, totalTimeSeconds)
    }
    removeSession(SESSION_KEYS.mockEngine)
    setEngine(null)
    setReport(null)
    setFinishStep(0)
    setAlert(null)
    setPhase('intro')
  }

  if (omrSheetMode) {
    return (
      <OmrSheetOverlay
        mode={omrSheetMode}
        onSelectMode={setOmrSheetMode}
        onClose={() => setOmrSheetMode(null)}
      />
    )
  }

  if (gradeMode) {
    if (!introCounts) return null
    return (
      <OmrGradeOverlay
        mode={gradeMode}
        counts={introCounts}
        onSelectMode={setGradeMode}
        onClose={() => setGradeMode(null)}
        onGrade={gradeOmrPaper}
      />
    )
  }

  if (phase === 'intro') {
    return (
      <div className="flex flex-col gap-5">
        <ScreenHeader
          title="FSCE Mock Simulator (Gloucestershire G7)"
          subtitle="Adventure, Beacon & Compass with strict section lock, just like the big day."
        />
        <div className={`${cardClass} border-2 border-amber-200 bg-amber-50`}>
          <p className="mb-2 text-sm font-black uppercase tracking-wide text-amber-900">FSCE Exam rules</p>
          <ul className="flex flex-col gap-1.5 text-sm font-bold text-amber-950">
            <li>Every question has 5 options: A, B, C, D and E.</li>
            <li>Each section has its own countdown. When it ends, you move on automatically.</li>
            <li>
              <Lock className="mr-1 inline h-4 w-4" aria-hidden="true" />
              Once you finish Section A (or time runs out), it is locked forever — you cannot go back.
            </li>
            <li>Beacon Paper: Section A written answers (type exact values/completions). Section B Creative Writing with rubric.</li>
            <li>Compass Paper: Across the Curriculum — interpret data, graphs and texts.</li>
            <li>Answers are never shown during the mock. A discreet alert appears at 5 minutes and 1 minute left.</li>
            <li>Flag any question you want to double-check with "Flag for Review".</li>
          </ul>
        </div>

        <div className={`${cardClass} border-2 border-sky-200 bg-sky-50`}>
          <p className="mb-1 text-sm font-black uppercase tracking-wide text-sky-900">Paper OMR Sheet Mode</p>
          <p className="mb-3 text-sm font-semibold leading-relaxed text-sky-950">
            Print the GL answer sheet and mark it with a pencil while reading the paper on screen — then let
            a parent type the letters back in for instant grading and telemetry.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setOmrSheetMode('mock_paper_1')}
              disabled={!paperPrintable(introCounts)}
              className={`${btnSecondaryClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Printer className="mr-2 inline h-5 w-5" aria-hidden="true" />
              Print GL OMR Answer Sheet
            </button>
            <button
              type="button"
              onClick={() => {
                if (parentMode) {
                  setGradeMode('mock_paper_1')
                  return
                }
                void requestUnlock().then((unlocked) => {
                  if (unlocked) setGradeMode('mock_paper_1')
                })
              }}
              disabled={!paperPrintable(introCounts)}
              className={`${btnSecondaryClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <PencilLine className="mr-2 inline h-5 w-5" aria-hidden="true" />
              Quick Grade Paper OMR
            </button>
          </div>
          <OmrInstructionsCard className="mt-4" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {EXAM_MODES.map((mode) => {
            const config = EXAM_CONFIGS[mode]
            const counts = introCounts ? introCounts[mode] : null
            const total = counts ? counts.reduce((sum, n) => sum + n, 0) : null
            return (
              <div key={mode} className={`${cardClass} flex flex-col gap-4`}>
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
                    <ClipboardList className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-lg font-black text-slate-900">{config.title}</p>
                    <p className="text-sm font-bold text-slate-500">{config.subtitle}</p>
                  </div>
                </div>
                <p className="flex-1 text-sm font-semibold leading-relaxed text-slate-600">{config.blurb}</p>
                <ul className="flex flex-wrap gap-2">
                  {config.sections.map((section, sectionIndex) => (
                    <li
                      key={section.id}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-extrabold text-slate-600"
                    >
                      {section.title}: {section.subjectLabel} · {formatMinutes(section.timeSeconds)}
                      {counts ? ` · ${counts[sectionIndex] ?? 0} item${(counts[sectionIndex] ?? 0) === 1 ? '' : 's'}` : ''}
                    </li>
                  ))}
                </ul>
                <p className="text-sm font-bold text-slate-500">
                  {total === null ? 'Counting questions...' : `${total} items in this paper`}
                </p>
                <button
                  type="button"
                  onClick={() => void startPaper(mode)}
                  disabled={total === 0 || total === null}
                  className={btnPrimaryClass}
                >
                  Start {config.title.split(':')[0]}
                </button>
              </div>
            )
          })}
        </div>

        <div className={`${cardClass} border-2 border-slate-200 bg-slate-50`}>
          <details>
            <summary className="cursor-pointer text-sm font-black text-slate-700">Optional Classic Logic Mock (NVR & VR - Not required for Glos)</summary>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              Extra practice for logic skills only. Not part of Gloucestershire FSCE requirements.
            </p>
          </details>
        </div>
      </div>
    )
  }

  if (phase === 'transition' && engine) {
    const currentSection = engine.config.sections[engine.sectionIndex]
    const nextSection = engine.config.sections[engine.sectionIndex + 1]
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-5 py-10 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-indigo-100 text-indigo-700">
          <Lock className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-black text-slate-900">{currentSection.title} is now locked</h1>
        <p className="text-base font-semibold text-slate-600">
          {transitionExpired
            ? `Time was up for ${currentSection.title}.`
            : `You finished ${currentSection.title} early and it cannot be opened again.`}{' '}
          Next up: <strong>{nextSection?.title}</strong> — {nextSection?.subjectLabel}.{' '}
          {nextSection ? formatMinutes(nextSection.timeSeconds) : ''} on the clock.
        </p>
        <button type="button" onClick={advanceToNextSection} className={btnPrimaryClass}>
          <LockOpen className="h-5 w-5" aria-hidden="true" />
          Start {nextSection?.title}
        </button>
      </div>
    )
  }

  if (phase === 'results' && report) {
    const errorDetails = report.details.filter((detail) => !detail.isCorrect)
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <ScreenHeader
          title={`${report.config.title} complete!`}
          subtitle={praiseFor(report.scorePercentage)}
        />
        <div className={`${cardClass} flex flex-col items-center gap-2`}>
          <Trophy className="h-12 w-12 text-amber-500" aria-hidden="true" />
          <p className="text-5xl font-black text-slate-900">{report.scorePercentage}%</p>
          <p className="text-base font-bold text-slate-600">
            {report.correct} correct out of {report.total} questions ·{' '}
            {report.timed ? `${formatClock(report.timeSeconds)} spent` : 'timing not recorded (graded from the paper sheet)'}
          </p>
          {report.previousBest === null ? (
            <p className="text-sm font-extrabold text-indigo-600">🏁 First result for this paper — a baseline to beat!</p>
          ) : report.scorePercentage > report.previousBest ? (
            <p className="text-base font-black text-emerald-700">
              🎉 New personal best! Previous best: {report.previousBest}%
            </p>
          ) : (
            <p className="text-sm font-extrabold text-slate-600">
              🏁 Personal best: {report.previousBest}% — you can beat it next time!
            </p>
          )}
        </div>

        <div className={cardClass}>
          <p className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Score by section</p>
          <ul className="flex flex-col gap-4">
            {report.breakdown.map((entry) => (
              <li key={entry.section} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm font-extrabold text-slate-800">
                  <span>{entry.section}</span>
                  <span className="tabular-nums text-indigo-600">
                    {entry.correct}/{entry.total}
                    {report.timed ? ` · ${formatMinutes(entry.timeSeconds)}` : ''}
                  </span>
                </div>
                <AccuracyBar correct={entry.correct} total={entry.total} barClass="bg-indigo-600" />
              </li>
            ))}
          </ul>
        </div>

        <div className={cardClass}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black uppercase tracking-wide text-slate-500">Time per question</p>
            <p className="text-xs font-bold text-slate-400">
              <Flag className="mr-1 inline h-3 w-3" aria-hidden="true" />
              flagged during the run
            </p>
          </div>
          {!report.timed ? (
            <p className="text-sm font-semibold text-slate-500">
              This paper was graded from the printed OMR sheet, so per-question times were not recorded.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {report.config.sections.map((section, sectionIndex) => {
                const rows = report.details.filter((detail) => detail.sectionIndex === sectionIndex)
                return (
                  <div key={section.id}>
                    <p className="mb-2 text-sm font-extrabold text-slate-700">
                      {section.title} — {section.subjectLabel}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {rows.map((detail, rowIndex) => (
                        <span
                          key={detail.question.id}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-extrabold tabular-nums ${
                            detail.isCorrect
                              ? 'border-indigo-100 bg-indigo-50 text-indigo-700'
                              : 'border-rose-100 bg-rose-50 text-rose-700'
                          }`}
                        >
                          Q{rowIndex + 1} · {formatClock(detail.timeSeconds)}
                          {detail.flagged ? <Flag className="h-3 w-3" aria-hidden="true" /> : null}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className={cardClass}>
          <p className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">
            Detailed error review ({errorDetails.length})
          </p>
          {errorDetails.length === 0 ? (
            <p className="text-sm font-bold text-emerald-700">
              No mistakes — every question on this paper is correct. Outstanding focus!
            </p>
          ) : (
            <>
            <button
              type="button"
              onClick={() => setReviewOpen((open) => !open)}
              aria-expanded={reviewOpen}
              className={`${btnSecondaryClass} mb-3 w-full justify-between`}
            >
              <span>
                {reviewOpen
                  ? 'Hide the mistake review'
                  : `Show all ${errorDetails.length} mistake${errorDetails.length === 1 ? '' : 's'}`}
              </span>
              <ChevronDown
                className={`h-5 w-5 transition-transform ${reviewOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {reviewOpen ? (
            <ul className="flex flex-col gap-4">
              {(() => {
                const numberByQuestion = new Map<string, number>()
                report.config.sections.forEach((_section, sectionIndex) => {
                  report.details
                    .filter((detail) => detail.sectionIndex === sectionIndex)
                    .forEach((detail, rowIndex) => numberByQuestion.set(detail.question.id, rowIndex + 1))
                })
                return errorDetails.map((detail) => {
                  const section = report.config.sections[detail.sectionIndex]
                  const questionNumber = numberByQuestion.get(detail.question.id) ?? 1
                  return (
                  <li
                    key={detail.question.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white">
                        {section?.title} · Q{questionNumber}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                        {detail.question.topic}
                      </span>
                      {detail.flagged ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                          <Flag className="h-3 w-3" aria-hidden="true" /> flagged
                        </span>
                      ) : null}
                      <span className="text-xs font-bold text-rose-600">
                        {detail.writtenAnswer !== undefined
                          ? `Your answer: ${detail.writtenAnswer}`
                          : `Your answer: ${letterOf(detail.selectedIndex)}`}
                      </span>
                      <span className="text-xs font-bold text-emerald-700">
                        Correct: {letterOf(detail.question.correctIndex)}
                      </span>
                      {report.timed ? (
                        <span className="text-xs font-bold text-slate-500">
                          took {formatClock(detail.timeSeconds)}
                        </span>
                      ) : null}
                    </div>
                    {detail.question.svgConfig ? (
                      <div className="mb-2 overflow-x-auto">
                        <NvrSvgRenderer config={detail.question.svgConfig} className="py-1" />
                      </div>
                    ) : null}
                    <p className="mb-2 text-sm font-semibold text-slate-700">
                      <MathText text={detail.question.stem} />
                    </p>
                    <ol className="mb-2 flex flex-wrap gap-2">
                      {detail.question.options.map((option, optionIndex) => {
                        const isChosen = optionIndex === detail.selectedIndex
                        const isCorrect = optionIndex === detail.question.correctIndex
                        const figure = detail.question.svgConfig?.optionFigures?.[optionIndex]
                        return (
                          <li
                            key={optionIndex}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-extrabold ${
                              isCorrect
                                ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                                : isChosen
                                  ? 'border-rose-300 bg-rose-100 text-rose-900'
                                  : 'border-slate-200 bg-white text-slate-600'
                            }`}
                          >
                            {figure ? (
                              <NvrFigureSvg
                                figure={figure}
                                className="h-7 w-7 shrink-0"
                                title={`Option ${LETTERS[optionIndex]}`}
                              />
                            ) : null}
                            <span>{LETTERS[optionIndex]})</span>
                            {option.trim().length > 0 ? <span>{option}</span> : null}
                          </li>
                        )
                      })}
                    </ol>
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm font-semibold leading-relaxed text-indigo-950">
                      <span className="mr-1 text-xs font-black uppercase tracking-wide text-indigo-500">
                        Why:
                      </span>
                      <MathText text={detail.question.explanation} />
                    </div>
                  </li>
                  )
                })
              })()}
            </ul>
            ) : null}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void startPaper(report.config.mode)}
            className={btnPrimaryClass}
          >
            Try {report.config.title} again
          </button>
          {report.timed && EXAM_CONFIGS[report.config.mode].omrEligible ? (
            <button
              type="button"
              onClick={() => setOmrSheetMode(report.config.mode)}
              className={btnSecondaryClass}
            >
              <Printer className="mr-2 inline h-5 w-5" aria-hidden="true" />
              Print answer sheet
            </button>
          ) : null}
          <button type="button" onClick={goIntro} className={btnSecondaryClass}>
            Choose another paper
          </button>
          <button type="button" onClick={() => onNavigate('dashboard')} className={btnSecondaryClass}>
            Back to home
          </button>
        </div>
      </div>
    )
  }

  if (!engine) return null

  const sectionConfig = engine.config.sections[engine.sectionIndex]
  const sectionQuestionsList = engine.sectionQuestions[engine.sectionIndex] ?? []
  const question = sectionQuestionsList[engine.cursor]
  const passage = question?.passageId ? engine.passagesById.get(question.passageId) : undefined
  const answeredCount = sectionQuestionsList.filter((item) => engine.answers[item.id] !== null && engine.answers[item.id] !== undefined && engine.answers[item.id] !== '').length
  const timerClass =
    remaining > 300 ? 'text-slate-800' : remaining > 60 ? 'text-amber-600' : 'animate-pulse text-rose-600'
  const isCreativeWriting = sectionConfig.creativeWriting === true || (engine.config.mode === 'mock_paper_2' && engine.sectionIndex === 1)
  const creativeTask = isCreativeWriting && engine.creativeTaskId ? WRITING_TASKS.find((t) => t.id === engine.creativeTaskId) ?? WRITING_TASKS[0] : WRITING_TASKS[0]
  const rubricComplete = CREATIVE_RUBRIC.every((criterion) => (engine.creativeScores?.[criterion] ?? 0) > 0)

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-gradient-to-br from-slate-100 to-indigo-50 px-3 py-3 md:overflow-hidden md:px-6 md:py-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 md:h-full md:min-h-0 md:overflow-hidden">
      {alert ? (
        <div
          role="status"
          aria-live="polite"
          className={`shrink-0 rounded-2xl border-2 px-4 py-2.5 text-sm font-extrabold ${
            alert.tone === 'urgent'
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {alert.text}
        </div>
      ) : null}

      <div className={`${cardClass} !p-2.5 flex shrink-0 flex-wrap items-center justify-between gap-2 md:!p-3`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-black text-slate-900">{engine.config.title}</span>
          {engine.config.sections.map((section, index) => {
            const state =
              index < engine.sectionIndex ? 'locked' : index === engine.sectionIndex ? 'active' : 'upcoming'
            return (
              <span
                key={section.id}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${
                  state === 'active'
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : state === 'locked'
                      ? 'border-slate-200 bg-slate-100 text-slate-400'
                      : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                {state === 'locked' ? <Lock className="h-2.5 w-2.5" aria-hidden="true" /> : null}
                {section.title}
                {state === 'active' ? ` · ${formatMinutes(section.timeSeconds)}` : ''}
              </span>
            )
          })}
          {question ? (
            <span className="hidden max-w-[10rem] truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 sm:inline-block">
              {question.topic}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {question ? (
            <button
              type="button"
              onClick={() => setScratchOpen(true)}
              aria-label="Open the scratchpad"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 border-slate-200 bg-white text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              <PencilLine className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <p className={`text-xl font-black tabular-nums ${timerClass}`} aria-live="polite">
            {formatClock(remaining)}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-3 pb-24 md:pb-2 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:pr-1">
          {!isCreativeWriting && sectionQuestionsList.length > 0 && question ? (
          <div className={`${cardClass} !p-2.5 flex flex-wrap items-center justify-between gap-2 md:!p-3`}>
            <span className="text-xs font-bold text-slate-600">
              Question {engine.cursor + 1} of {sectionQuestionsList.length} · {answeredCount} answered
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleFlag}
                className={`${btnSecondaryClass} !min-h-[32px] !px-2.5 !py-1 !text-xs ${engine.flags[question.id] === true ? 'border-amber-400 bg-amber-100 text-amber-900' : ''}`}
              >
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                {engine.flags[question.id] === true ? 'Flagged' : 'Flag'}
              </button>
              <button
                type="button"
                onClick={() => setFinishStep(1)}
                className={`${btnSecondaryClass} !min-h-[32px] !px-2.5 !py-1 !text-xs`}
              >
                Finish early
              </button>
              <button
                type="button"
                onClick={() => setCancelStep(1)}
                className={`${btnSecondaryClass} !min-h-[32px] !px-2.5 !py-1 !text-xs text-rose-700`}
              >
                Cancel
              </button>
            </div>
          </div>
      ) : null}

      {isCreativeWriting ? (
        <div className={`${cardClass} flex flex-col gap-4`}>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700">
              <Star className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-lg font-black text-slate-900">Beacon Paper — Creative Writing Task</p>
              <p className="text-sm font-bold text-slate-500">Write your story/piece for this task</p>
            </div>
          </div>
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-black uppercase tracking-wide text-amber-800">{creativeTask.title}</p>
            <p className="mt-1 text-base font-semibold leading-relaxed text-slate-800">{creativeTask.prompt}</p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className={`${btnSecondaryClass} w-fit`}
          >
            <Printer className="mr-2 h-5 w-5" aria-hidden="true" />
            🖨️ Print FSCE Lined Writing Sheet
          </button>
          <textarea
            value={engine.creativeText ?? ''}
            onChange={(e) => setEngine((current) => (current ? { ...current, creativeText: e.target.value } : current))}
            rows={14}
            placeholder="Start writing your creative piece here..."
            className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 text-lg font-semibold leading-relaxed text-slate-900 focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-extrabold text-slate-600">
              {(engine.creativeText ?? '').trim().split(/\s+/).filter(Boolean).length} words
            </span>
            <button type="button" onClick={() => setFinishStep(1)} className={btnPrimaryClass}>
              Finish Section B & Finish Paper
            </button>
          </div>
          <div className={`${cardClass} border-2 border-indigo-200 bg-indigo-50`}>
            <p className="mb-2 text-sm font-black uppercase tracking-wide text-indigo-900">
              Interactive rubric — 5 criteria (1 to 4 marks each)
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {CREATIVE_RUBRIC.map((criterion) => {
                const selected = engine.creativeScores?.[criterion] ?? null
                return (
                  <div
                    key={criterion}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2"
                  >
                    <span className="text-sm font-bold text-slate-700">{criterion}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() =>
                            setEngine((current) =>
                              current
                                ? {
                                    ...current,
                                    creativeScores: {
                                      ...(current.creativeScores ?? {}),
                                      [criterion]: n,
                                    },
                                  }
                                : current,
                            )
                          }
                          aria-pressed={selected === n}
                          aria-label={`${criterion}: ${n} mark${n === 1 ? '' : 's'}`}
                          className={`grid h-7 w-7 place-items-center rounded-lg border text-xs font-extrabold transition ${
                            selected === n
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-xs font-bold text-indigo-700">
              {rubricComplete
                ? 'Rubric complete — well done. Now read your writing one last time before you hand it in.'
                : 'Score together after writing — aim for strong ideas and clear structure.'}
            </p>
          </div>
        </div>
      ) : question ? (
      <QuestionView
        key={question.id}
        question={question}
        passage={passage}
        compact
        twoColumns
        hideTopic
        hideScratchpad
        questionNumber={engine.cursor + 1}
        totalQuestions={sectionQuestionsList.length}
        selectedIndex={
          typeof engine.answers[question.id] === 'number' ? (engine.answers[question.id] as number) : null
        }
        onSelect={selectAnswer}
        flagged={engine.flags[question.id] === true}
        writtenMode={sectionConfig.writtenMode === true}
        onWriteAnswer={(value) => submitWrittenAnswer(value)}
        onWrittenChange={(value) => submitWrittenAnswer(value)}
      />
      ) : null}

      </div>
      </div>

      {!isCreativeWriting && sectionQuestionsList.length > 0 && question ? (
      <div className="sticky bottom-[env(safe-area-inset-bottom)] z-20 -mx-3 shrink-0 flex justify-between gap-3 bg-white px-3 py-2 md:static md:mx-0 md:bg-transparent md:px-0">
        <button
          type="button"
          onClick={() => goToQuestion(Math.max(0, engine.cursor - 1))}
          disabled={engine.cursor === 0}
          className={`${btnSecondaryClass} !min-h-[36px] !px-3 !py-1.5 !text-sm`}
        >
          Previous
        </button>
        {engine.cursor >= sectionQuestionsList.length - 1 ? (
          <button
            type="button"
            onClick={() => setFinishStep(1)}
            className={`${btnPrimaryClass} !min-h-[36px] !px-3 !py-1.5 !text-sm`}
          >
            Finish {sectionConfig.title}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => goToQuestion(engine.cursor + 1)}
            className={`${btnPrimaryClass} !min-h-[36px] !px-3 !py-1.5 !text-sm`}
          >
            Next
          </button>
        )}
      </div>
      ) : null}

      {cancelStep > 0 ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" role="alertdialog" aria-modal="true">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-100 text-rose-700">
                <X className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-black text-slate-900">
                {cancelStep === 1 ? 'Cancel this exam?' : 'Are you sure? Everything is lost'}
              </h2>
            </div>
            {cancelStep === 1 ? (
              <p className="mb-5 text-sm font-semibold leading-relaxed text-slate-600">
                The paper will be marked as abandoned and you will go back to the mock list. You can start
                a new paper whenever you are ready.
              </p>
            ) : (
              <p className="mb-5 text-sm font-semibold leading-relaxed text-slate-600">
                Your answers of this paper will not be saved. This cannot be undone.
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              {cancelStep === 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCancelStep(2)}
                    className={`${btnPrimaryClass} flex-1`}
                  >
                    Yes, cancel the exam
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelStep(0)}
                    className={`${btnSecondaryClass} flex-1`}
                  >
                    Keep working
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setCancelStep(0)
                      goIntro()
                    }}
                    className={`${btnPrimaryClass} flex-1`}
                  >
                    Cancel the exam now
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelStep(1)}
                    className={`${btnSecondaryClass} flex-1`}
                  >
                    Go back
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {finishStep > 0 ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" role="alertdialog" aria-modal="true">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-100 text-amber-800">
                <Lock className="h-6 w-6" aria-hidden="true" />
              </div>
              {finishStep === 1 ? (
                <h2 className="text-lg font-black text-slate-900">Finish {sectionConfig.title} Early?</h2>
              ) : (
                <h2 className="text-lg font-black text-slate-900">
                  Lock {sectionConfig.title} for good?
                </h2>
              )}
            </div>
            {finishStep === 1 ? (
              <p className="mb-5 text-sm font-semibold leading-relaxed text-slate-600">
                You will move straight to{' '}
                <strong>
                  {engine.config.sections[engine.sectionIndex + 1]?.title ?? 'the end of the paper'}
                </strong>
                . You cannot come back to {sectionConfig.title} or change any of these answers. You have
                answered {answeredCount}/{sectionQuestionsList.length} so far.
              </p>
            ) : (
              <p className="mb-5 text-sm font-semibold leading-relaxed text-slate-600">
                Second confirmation: {sectionConfig.title} will be{' '}
                <strong>permanently locked</strong> and your unanswered rows stay blank. This cannot be
                undone. Ready?
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              {finishStep === 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setFinishStep(2)}
                    className={`${btnPrimaryClass} flex-1`}
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => setFinishStep(0)}
                    className={`${btnSecondaryClass} flex-1`}
                  >
                    Keep working
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setFinishStep(0)
                      finishSection(false)
                    }}
                    className={`${btnPrimaryClass} flex-1`}
                  >
                    <Lock className="mr-2 inline h-5 w-5" aria-hidden="true" />
                    Yes, lock it now
                  </button>
                  <button
                    type="button"
                    onClick={() => setFinishStep(1)}
                    className={`${btnSecondaryClass} flex-1`}
                  >
                    Go back
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <ScratchpadOverlay open={scratchOpen} onClose={() => setScratchOpen(false)} resetKey={question?.id ?? 'mock'} />
      </div>
    </div>
  )
}
