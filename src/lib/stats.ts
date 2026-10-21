import { db } from '../db/database'
import { SUBJECTS, type Attempt, type Difficulty, type Question, type Session, type Subject } from '../db/schemas'
import { localDayKey, startOfToday } from './format'
import { getMistakesClearedAt } from './sessionHelpers'
import { averageSeconds, isAnomalousTimeSpent, medianSeconds, totalUsableSeconds } from './timing'

export interface SubjectStat {
  subject: Subject
  total: number
  correct: number
  accuracy: number
}

export interface BreakdownStat {
  key: Difficulty
  label: string
  total: number
  correct: number
  accuracy: number
}

export interface DashboardStats {
  totalAnswered: number
  correct: number
  accuracy: number
  answeredToday: number
  streakDays: number
  openMistakes: number
  avgTimeSeconds: number
  medianTimeSeconds: number
}

export interface MistakeEntry {
  question: Question
  lastAttempt: Attempt
}

export function computeStreak(timestamps: number[]): number {
  if (timestamps.length === 0) return 0
  const days = new Set(timestamps.map(localDayKey))
  const today = localDayKey(Date.now())
  const dayMs = 86_400_000
  let cursor = today
  if (!days.has(cursor)) {
    cursor = today - dayMs
    if (!days.has(cursor)) return 0
  }
  let streak = 0
  while (days.has(cursor)) {
    streak += 1
    cursor -= dayMs
  }
  return streak
}

export function summariseAttempts(attempts: Attempt[]): {
  total: number
  correct: number
  accuracy: number
  avgTimeSeconds: number
  medianTimeSeconds: number
  timedAttempts: number
} {
  const total = attempts.length
  const correct = attempts.filter((a) => a.isCorrect).length
  // Attempts that were left open far too long (tab left open, device asleep)
  // are anomalies: they are excluded from the "average time" so the number
  // only ever reflects real thinking time.
  const usableTimes = attempts
    .filter((attempt) => !isAnomalousTimeSpent(attempt.timeSpentSeconds))
    .map((attempt) => attempt.timeSpentSeconds)
  return {
    total,
    correct,
    accuracy: total === 0 ? 0 : Math.round((correct / total) * 100),
    avgTimeSeconds: averageSeconds(usableTimes),
    medianTimeSeconds: medianSeconds(usableTimes),
    timedAttempts: usableTimes.length,
  }
}

/** Total genuine (non-anomalous) thinking time across a list of attempts. */
export function attemptsRealTimeSeconds(attempts: Attempt[]): number {
  return totalUsableSeconds(attempts.map((attempt) => attempt.timeSpentSeconds))
}

export function subjectStats(attempts: Attempt[]): SubjectStat[] {
  return SUBJECTS.map((subject) => {
    const own = attempts.filter((a) => a.subject === subject)
    const correct = own.filter((a) => a.isCorrect).length
    return {
      subject,
      total: own.length,
      correct,
      accuracy: own.length === 0 ? 0 : Math.round((correct / own.length) * 100),
    }
  })
}

export function difficultyStats(attempts: Attempt[]): BreakdownStat[] {
  return ([1, 2, 3] as const).map((level) => {
    const own = attempts.filter((a) => a.difficulty === level)
    const correct = own.filter((a) => a.isCorrect).length
    return {
      key: level,
      label: `Difficulty ${level}`,
      total: own.length,
      correct,
      accuracy: own.length === 0 ? 0 : Math.round((correct / own.length) * 100),
    }
  })
}

export async function getAllAttempts(profileId: string): Promise<Attempt[]> {
  return (await db.attempts.where('profileId').equals(profileId).toArray()).sort(
    (a, b) => a.timestamp - b.timestamp,
  )
}

export async function getSubjectStats(profileId: string): Promise<SubjectStat[]> {
  return subjectStats(await getAllAttempts(profileId))
}

export async function getRecentSessions(profileId: string, limit: number): Promise<Session[]> {
  const sessions = await db.sessions.where('profileId').equals(profileId).sortBy('startedAt')
  return sessions
    .filter((s) => s.status === 'completed' && s.completedAt !== null)
    .reverse()
    .slice(0, limit)
}

export async function getCompletedSessions(profileId: string): Promise<Session[]> {
  const sessions = await db.sessions.where('profileId').equals(profileId).sortBy('startedAt')
  return sessions.filter((s) => s.status === 'completed' && s.completedAt !== null)
}

export async function getAbandonedSessions(profileId: string): Promise<Session[]> {
  const sessions = await db.sessions.where('profileId').equals(profileId).sortBy('startedAt')
  return sessions.filter((s) => s.status === 'abandoned').reverse()
}

export async function getOpenMistakes(profileId: string): Promise<MistakeEntry[]> {
  const clearedAt = getMistakesClearedAt(profileId)
  const attempts = (await db.attempts.where('profileId').equals(profileId).toArray())
    .filter((a) => a.timestamp > clearedAt)
    .sort((a, b) => b.timestamp - a.timestamp)
  const latestByQuestion = new Map<string, Attempt>()
  for (const attempt of attempts) {
    if (!latestByQuestion.has(attempt.questionId)) {
      latestByQuestion.set(attempt.questionId, attempt)
    }
  }
  const wrong = [...latestByQuestion.values()].filter((a) => !a.isCorrect)
  if (wrong.length === 0) return []
  const questions = await db.questions.bulkGet(wrong.map((a) => a.questionId))
  const entries: MistakeEntry[] = []
  wrong.forEach((attempt, index) => {
    const question = questions[index]
    if (question) {
      entries.push({ question, lastAttempt: attempt })
    }
  })
  return entries
}

export async function getDashboardStats(profileId: string): Promise<DashboardStats> {
  const attempts = await getAllAttempts(profileId)
  const summary = summariseAttempts(attempts)
  const today = startOfToday()
  const answeredToday = attempts.filter((a) => a.timestamp >= today).length
  const streakDays = computeStreak(attempts.map((a) => a.timestamp))
  const openMistakes = (await getOpenMistakes(profileId)).length
  return {
    totalAnswered: summary.total,
    correct: summary.correct,
    accuracy: summary.accuracy,
    answeredToday,
    streakDays,
    openMistakes,
    avgTimeSeconds: summary.avgTimeSeconds,
    medianTimeSeconds: summary.medianTimeSeconds,
  }
}
