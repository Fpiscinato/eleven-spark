import type { Attempt, Session, Subject } from '../db/schemas'
import { SUBJECTS } from '../db/schemas'
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
  const month = new Date(now).getMonth()
  if (month >= 3 && month <= 5) return 'speed'
  if (month >= 6 && month <= 8) return 'stamina'
  return 'foundation'
}

export function computeRoadmap(input: RoadmapInput): RoadmapSnapshot {
  const { attempts, sessions, questionTimeTargets } = input
  const completedMocks = sessions.filter(
    (session) => session.status === 'completed' && (session.mode === 'mock_paper_1' || session.mode === 'mock_paper_2'),
  )
  const completedMiniMocks = sessions.filter(
    (session) => session.status === 'completed' && session.mode === 'mini_mock',
  )
  const totalAnswered = attempts.length
  const correct = attempts.filter((attempt) => attempt.isCorrect).length
  const accuracy = totalAnswered === 0 ? 0 : Math.round((correct / totalAnswered) * 100)

  const subjectsTouched = new Set(attempts.map((attempt) => attempt.subject))
  const subjectsCovered = SUBJECTS.filter((subject) => subjectsTouched.has(subject as Subject)).length

  const onTarget = attempts.filter((attempt) => {
    const target = questionTimeTargets.get(attempt.questionId)
    return target !== undefined && attempt.timeSpentSeconds <= target
  }).length
  const onTargetPacePercent = totalAnswered === 0 ? 0 : Math.round((onTarget / totalAnswered) * 100)

  const clinicAttempts = attempts.filter((attempt) => {
    const session = sessions.find((candidate) => candidate.id === attempt.sessionId)
    return session?.mode === 'mistake_clinic'
  })
  const openMistakes = new Set(
    attempts
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((attempt) => !attempt.isCorrect)
      .map((attempt) => attempt.questionId),
  )
  for (const attempt of attempts) {
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
      label: 'Subjects covered',
      value: 4,
      unit: 'subjects',
      achieved: subjectsCovered,
      met: subjectsCovered >= 4,
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
      label: 'Mini mocks',
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
      label: 'On-target pace',
      value: 70,
      unit: 'percent',
      achieved: onTargetPacePercent,
      met: onTargetPacePercent >= 70,
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
      label: 'Full mock papers',
      value: 10,
      unit: 'sessions',
      achieved: completedMocks.length,
      met: completedMocks.length >= 10,
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
      title: 'Phase 1 — Foundation',
      window: 'October to March',
      headline: 'Build strong basics across every subject.',
      percent: phasePercent(foundationGoals),
      goals: foundationGoals,
      barSegments: foundationGoals.map((goal) => ({
        label: goal.label,
        percent: ratioPercent(goal.achieved, goal.value),
      })),
    },
    {
      id: 'speed',
      title: 'Phase 2 — Speed',
      window: 'April to June',
      headline: 'Answer accurately within the time target.',
      percent: phasePercent(speedGoals),
      goals: speedGoals,
      barSegments: speedGoals.map((goal) => ({
        label: goal.label,
        percent: ratioPercent(goal.achieved, goal.value),
      })),
    },
    {
      id: 'stamina',
      title: 'Phase 3 — Stamina',
      window: 'July to September',
      headline: 'Hold focus through full mock papers.',
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
