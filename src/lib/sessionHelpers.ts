import { db } from '../db/database'
import type { SectionBreakdownEntry, SessionMode } from '../db/schemas'
import { DATA_CHANGED_EVENT } from './events'
import { uid } from './format'

export const MISTAKES_CLEARED_PREFIX = 'elevenspark.mistakes_cleared_at:'

function notifyDataChanged(): void {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT))
}

export function mistakesClearedKey(profileId: string): string {
  return `${MISTAKES_CLEARED_PREFIX}${profileId}`
}

export function getMistakesClearedAt(profileId: string): number {
  const raw = localStorage.getItem(mistakesClearedKey(profileId))
  const parsed = raw === null ? 0 : Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export async function startSession(
  mode: SessionMode,
  profileId: string,
  options?: { writtenMode?: boolean },
): Promise<string> {
  const id = uid()
  await db.sessions.add({
    id,
    profileId,
    mode,
    status: 'in_progress',
    startedAt: Date.now(),
    completedAt: null,
    totalTimeSeconds: 0,
    scorePercentage: 0,
    sectionBreakdown: [],
    writtenMode: options?.writtenMode === true ? true : undefined,
  })
  return id
}

export async function completeSession(
  sessionId: string,
  patch: {
    totalTimeSeconds: number
    scorePercentage: number
    sectionBreakdown: SectionBreakdownEntry[]
  },
): Promise<void> {
  await db.sessions.update(sessionId, {
    status: 'completed',
    completedAt: Date.now(),
    totalTimeSeconds: patch.totalTimeSeconds,
    scorePercentage: patch.scorePercentage,
    sectionBreakdown: patch.sectionBreakdown,
  })
  notifyDataChanged()
}

export async function abandonSession(sessionId: string, totalTimeSeconds: number): Promise<void> {
  await db.sessions.update(sessionId, {
    status: 'abandoned',
    completedAt: Date.now(),
    totalTimeSeconds,
  })
}

export function clearMistakeBank(profileId: string): void {
  localStorage.setItem(mistakesClearedKey(profileId), String(Date.now()))
}

export async function resetQuickPractice(profileId: string): Promise<number> {
  const sessions = await db.sessions
    .where('profileId')
    .equals(profileId)
    .and((session) => session.mode === 'quick_practice')
    .toArray()
  const sessionIds = new Set(sessions.map((session) => session.id))
  const attempts = await db.attempts
    .where('profileId')
    .equals(profileId)
    .and((attempt) => sessionIds.has(attempt.sessionId))
    .toArray()
  await db.attempts.bulkDelete(attempts.map((attempt) => attempt.id))
  await db.sessions.bulkDelete(sessions.map((session) => session.id))
  return sessions.length
}
