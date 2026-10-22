import type { Attempt, Session, Subject } from '../db/schemas'
import { isOptionalSubject } from '../db/schemas'
import { startOfToday } from '../lib/format'

export type RoadmapPhaseId = 'foundation' | 'speed' | 'stamina'

export interface PhaseGoal {
  label: string
  value: number
  unit: 'questions' | 'sessions' | 'percent' | 'subjects'
  achieved: number
  met: boolean
}

export interface PhaseProgress {
  id: RoadmapPhaseId
  title: string
  window: string
  headline: string
  percent: number
  goals: PhaseGoal[]
  barSegments: Array<{ label: string; percent: number }>
}

export interface RoadmapSnapshot {
  currentPhaseId: RoadmapPhaseId
  phases: PhaseProgress[]
  totalAnswered: number
  accuracy: number
  openMistakes: number
  mockAverage: number
  miniMocksDone: number
  papersDone: number
  clinicQuestionsDone: number
  onTargetPacePercent: number
  /** Questions answered in the optional NVR/VR subjects (never counted in the phases). */
  optionalAnswered: number
}

export interface RoadmapInput {
  attempts: Attempt[]
  sessions: Session[]
  questionTimeTargets: Map<string, number>
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function ratioPercent(achieved: number, target: number): number {
  if (target <= 0) return 100
  return clampPercent((achieved / target) * 100)
}

function phasePercent(goals: PhaseGoal[]): number {
  if (goals.length === 0) return 0
  const sum = goals.reduce((total, goal) => total + Math.min(goal.achieved / goal.value, 1), 0)
  return clampPercent((sum / goals.length) * 100)
}

export function currentPhaseForDate(now: number): RoadmapPhaseId {
  const month = new Date(now).getMonth() // 0-11
  // Phase 1 (Oct – Jan): months Oct(9), Nov(10), Dec(11), Jan(0)
  if (month === 9 || month === 10 || month === 11 || month === 0) return 'foundation'
  // Phase 2 (Feb – Apr): Feb(1), Mar(2), Apr(3)
  if (month === 1 || month === 2 || month === 3) return 'speed'
  // Phase 3 (May – Early July): May(4), Jun(5), Jul(6)
  if (month === 4 || month === 5 || month === 6) return 'stamina'
  // Aug onward fallback to stamina
  return 'stamina'
}

export function computeRoadmap(input: RoadmapInput): RoadmapSnapshot {
  const { attempts, sessions, questionTimeTargets } = input
  // Count all FSCE mock papers (Adventure, Beacon, Compass) and mini mocks
  const completedMocks = sessions.filter(
    (session) =>
      session.status === 'completed' &&
      (session.mode === 'mock_paper_1' || session.mode === 'mock_paper_2' || session.mode === 'mock_paper_3'),
  )
  const completedMiniMocks = sessions.filter(
    (session) => session.status === 'completed' && session.mode === 'mini_mock',
  )
  // NVR and VR are an optional bonus and are NOT part of the Gloucestershire
  // FSCE exam. They must never raise OR lower the progress of the three
  // phases, so every phase metric below is calculated on the core subjects
  // only (English, Maths and Compass).
  const coreAttempts = attempts.filter((attempt) => !isOptionalSubject(attempt.subject))
  const optionalAttempts = attempts.filter((attempt) => isOptionalSubject(attempt.subject))

  const totalAnswered = coreAttempts.length
  const correct = coreAttempts.filter((attempt) => attempt.isCorrect).length
  const accuracy = totalAnswered === 0 ? 0 : Math.round((correct / totalAnswered) * 100)

  // Only count coverage of english, maths, compass (required subjects) - exclude nvr, vr
  const requiredSubjects = new Set<Subject>(['english', 'maths', 'compass'])
  const subjectsTouched = new Set(
    coreAttempts.filter((attempt) => requiredSubjects.has(attempt.subject)).map((attempt) => attempt.subject),
  )
  const subjectsCovered = ['english', 'maths', 'compass'].filter((subject) => subjectsTouched.has(subject as Subject)).length

  const onTarget = coreAttempts.filter((attempt) => {
    const target = questionTimeTargets.get(attempt.questionId)
    return target !== undefined && attempt.timeSpentSeconds <= target
  }).length
  const onTargetPacePercent = totalAnswered === 0 ? 0 : Math.round((onTarget / totalAnswered) * 100)

  const clinicAttempts = coreAttempts.filter((attempt) => {
    const session = sessions.find((candidate) => candidate.id === attempt.sessionId)
    return session?.mode === 'mistake_clinic'
  })
  const openMistakes = new Set(
    coreAttempts
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((attempt) => !attempt.isCorrect)
      .map((attempt) => attempt.questionId),
  )
  for (const attempt of coreAttempts) {
    if (attempt.isCorrect) openMistakes.delete(attempt.questionId)
  }

  const mockAverage =
    completedMocks.length === 0
      ? 0
      : Math.round(completedMocks.reduce((sum, session) => sum + session.scorePercentage, 0) / completedMocks.length)

  const foundationGoals: PhaseGoal[] = [
    {
      label: 'Answered questions',
      value: 500,
      unit: 'questions',
      achieved: totalAnswered,
      met: totalAnswered >= 500,
    },
    {
      label: 'Core subjects covered (English/Maths/Compass)',
      value: 3,
      unit: 'subjects',
      achieved: subjectsCovered,
      met: subjectsCovered >= 3,
    },
    {
      label: 'Accuracy',
      value: 65,
      unit: 'percent',
      achieved: accuracy,
      met: accuracy >= 65,
    },
  ]

  const speedGoals: PhaseGoal[] = [
    {
      label: 'Answered questions',
      value: 1000,
      unit: 'questions',
      achieved: totalAnswered,
      met: totalAnswered >= 1000,
    },
    {
      label: 'Mini-Mocks / Beacon Written sessions',
      value: 6,
      unit: 'sessions',
      achieved: completedMiniMocks.length,
      met: completedMiniMocks.length >= 6,
    },
    {
      label: 'Mistake Clinic questions',
      value: 50,
      unit: 'questions',
      achieved: clinicAttempts.length,
      met: clinicAttempts.length >= 50,
    },
    {
      label: 'Accuracy',
      value: 75,
      unit: 'percent',
      achieved: accuracy,
      met: accuracy >= 75,
    },
  ]

  const staminaGoals: PhaseGoal[] = [
    {
      label: 'Answered questions',
      value: 1500,
      unit: 'questions',
      achieved: totalAnswered,
      met: totalAnswered >= 1500,
    },
    {
      label: 'Full FSCE Papers (Adventure/Beacon/Compass)',
      value: 9,
      unit: 'sessions',
      achieved: completedMocks.length,
      met: completedMocks.length >= 9,
    },
    {
      label: 'Mock average',
      value: 75,
      unit: 'percent',
      achieved: mockAverage,
      met: mockAverage >= 75,
    },
  ]

  const phases: PhaseProgress[] = [
    {
      id: 'foundation',
      title: 'Phase 1 — Core KS2 Mastery',
      window: 'Oct – Jan',
      headline: 'English, Maths & Compass mastery.',
      percent: phasePercent(foundationGoals),
      goals: foundationGoals,
      barSegments: foundationGoals.map((goal) => ({
        label: goal.label,
        percent: ratioPercent(goal.achieved, goal.value),
      })),
    },
    {
      id: 'speed',
      title: 'Phase 2 — Beacon Written Precision & Speed',
      window: 'Feb – Apr',
      headline: '⚠️ Official G7 Registration Window: Feb – Mar!',
      percent: phasePercent(speedGoals),
      goals: speedGoals,
      barSegments: speedGoals.map((goal) => ({
        label: goal.label,
        percent: ratioPercent(goal.achieved, goal.value),
      })),
    },
    {
      id: 'stamina',
      title: 'Phase 3 — Full FSCE 3-Paper Stamina',
      window: 'May – Early July Exam',
      headline: '≥75% Glos Qualifying / ≥85% Pate\'s & Stroud High Stretch',
      percent: phasePercent(staminaGoals),
      goals: staminaGoals,
      barSegments: staminaGoals.map((goal) => ({
        label: goal.label,
        percent: ratioPercent(goal.achieved, goal.value),
      })),
    },
  ]

  return {
    currentPhaseId: currentPhaseForDate(Date.now()),
    phases,
    totalAnswered,
    accuracy,
    openMistakes: openMistakes.size,
    mockAverage,
    miniMocksDone: completedMiniMocks.length,
    papersDone: completedMocks.length,
    clinicQuestionsDone: clinicAttempts.length,
    onTargetPacePercent,
    optionalAnswered: optionalAttempts.length,
  }
}

export interface SparkTask {
  id: 'clinic' | 'mini_mock' | 'coverage' | 'timed_practice'
  title: string
  detail: string
  minutes: number
  questions: number
}

export interface SparkPlan {
  task: SparkTask
  reason: string
}

export function computeTodaysSpark(snapshot: RoadmapSnapshot, answeredToday: number): SparkPlan {
  const DAILY_QUESTIONS = 20
  const DAILY_MINUTES = 20
  const remaining = Math.max(0, DAILY_QUESTIONS - answeredToday)

  if (snapshot.openMistakes >= 5 && snapshot.currentPhaseId !== 'foundation') {
    const count = Math.min(remaining || 10, Math.min(snapshot.openMistakes, 10))
    return {
      task: {
        id: 'clinic',
        title: 'Clear your Mistake Bank',
        detail: `Redo ${count} tricky questions you have missed before.`,
        minutes: Math.max(5, Math.round((count * 70) / 60)),
        questions: count,
      },
      reason: 'Fixing past mistakes is the fastest way to climb.',
    }
  }
  if (snapshot.miniMocksDone < 6 && snapshot.currentPhaseId === 'speed' && remaining >= 10) {
    return {
      task: {
        id: 'mini_mock',
        title: 'Quick mini mock',
        detail: 'One short mixed paper to keep your exam rhythm sharp.',
        minutes: 15,
        questions: 10,
      },
      reason: 'Regular mini mocks build exam-day speed.',
    }
  }
  if (snapshot.phases[0] && snapshot.phases[0].percent < 100 && remaining >= 10) {
    return {
      task: {
        id: 'coverage',
        title: 'Explore a new topic',
        detail: 'Try a subject or topic you have not visited yet today.',
        minutes: DAILY_MINUTES,
        questions: Math.min(remaining, 20),
      },
      reason: 'Wide coverage in Phase 1 makes every later phase easier.',
    }
  }
  return {
    task: {
      id: 'timed_practice',
      title: 'Timed practice set',
      detail: remaining === 0 ? 'You finished today’s questions — redo a favourite topic for fun.' : `Answer ${remaining} practice questions before the timer runs out.`,
      minutes: Math.max(5, Math.round((remaining * 70) / 60)),
      questions: remaining === 0 ? 10 : remaining,
    },
    reason: 'Steady daily practice keeps your streak glowing.',
  }
}

export function todaysAnsweredToday(attempts: Attempt[]): number {
  const today = startOfToday()
  return attempts.filter((attempt) => attempt.timestamp >= today).length
}

export type MasteryLabel = 'mastered' | 'speed_booster' | 'growing'

export function masteryFor(accuracy: number, onTargetPace: number, total: number): MasteryLabel {
  if (total < 5) return 'growing'
  if (accuracy >= 85 && onTargetPace >= 70) return 'mastered'
  if (accuracy >= 65 || onTargetPace >= 60) return 'speed_booster'
  return 'growing'
}
