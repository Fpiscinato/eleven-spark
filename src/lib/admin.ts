import { db } from '../db/database'
import type { Profile, Session, SessionMode } from '../db/schemas'
import { PROFILES_CHANGED_EVENT } from './events'
import { mistakesClearedKey, resetQuickPractice } from './sessionHelpers'

export { PROFILES_CHANGED_EVENT } from './events'
export const PARENT_PIN_STORAGE_KEY = 'elevenspark.parent_pin'
export const DEFAULT_PARENT_PIN = '1126'
export const SYNC_SNAPSHOT_KEY = 'elevenspark.sync_snapshot'
export const BANK_VERSION_KEY = 'elevenspark.bank_version'
export const ACTIVE_PROFILE_KEY = 'elevenspark.active_profile_id'

export const TARGET_SCHOOLS = [
  "Pate's Grammar School",
  'Stroud High School',
  'Ribston Hall School',
  'Denmark Road High School',
  'The Crypt School',
] as const

export function getParentPin(): string {
  return localStorage.getItem(PARENT_PIN_STORAGE_KEY) ?? DEFAULT_PARENT_PIN
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin)
}

export function changePin(oldPin: string, newPin: string): boolean {
  if (getParentPin() !== oldPin) return false
  if (!isValidPinFormat(newPin)) return false
  localStorage.setItem(PARENT_PIN_STORAGE_KEY, newPin)
  return true
}

export function setParentPin(newPin: string): boolean {
  if (!isValidPinFormat(newPin)) return false
  localStorage.setItem(PARENT_PIN_STORAGE_KEY, newPin)
  return true
}

export function isUsingDefaultPin(): boolean {
  return getParentPin() === DEFAULT_PARENT_PIN
}

export interface ProfileInput {
  name: string
  avatar: string
  targetSchool: string
}

export function validateProfileInput(input: ProfileInput): string | null {
  const name = input.name.trim()
  if (name.length === 0 || name.length > 40) return 'Name must be between 1 and 40 characters.'
  if (input.avatar.trim().length === 0 || input.avatar.trim().length > 8) return 'Choose an emoji avatar.'
  if (input.targetSchool !== '' && !(TARGET_SCHOOLS as readonly string[]).includes(input.targetSchool)) {
    return 'Choose a valid target school.'
  }
  return null
}

export async function createProfile(input: ProfileInput): Promise<Profile> {
  const now = Date.now()
  const profile: Profile = {
    id: `profile-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name.trim(),
    avatar: input.avatar.trim(),
    targetSchool: input.targetSchool,
    isGuest: false,
    createdAt: now,
    updatedAt: now,
  }
  await db.profiles.put(profile)
  window.dispatchEvent(new CustomEvent(PROFILES_CHANGED_EVENT))
  return profile
}

export async function updateProfile(profileId: string, input: ProfileInput): Promise<void> {
  await db.profiles.update(profileId, {
    name: input.name.trim(),
    avatar: input.avatar.trim(),
    targetSchool: input.targetSchool,
    updatedAt: Date.now(),
  })
  window.dispatchEvent(new CustomEvent(PROFILES_CHANGED_EVENT))
}

export async function cloneProfile(profileId: string, newName: string): Promise<Profile | null> {
  const source = await db.profiles.get(profileId)
  if (!source) return null
  const now = Date.now()
  const clone: Profile = {
    ...source,
    id: `profile-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: newName.trim().slice(0, 40) || `${source.name} (copy)`,
    isGuest: false,
    createdAt: now,
    updatedAt: now,
  }
  await db.profiles.put(clone)
  window.dispatchEvent(new CustomEvent(PROFILES_CHANGED_EVENT))
  return clone
}

export async function deleteProfile(profileId: string): Promise<'ok' | 'last' | 'missing'> {
  const all = await db.profiles.toArray()
  const remaining = all.filter((profile) => profile.id !== profileId)
  if (!all.some((profile) => profile.id === profileId)) return 'missing'
  if (remaining.length === 0) return 'last'
  await db.profiles.delete(profileId)
  await db.sessions.where('profileId').equals(profileId).delete()
  await db.attempts.where('profileId').equals(profileId).delete()
  localStorage.removeItem(mistakesClearedKey(profileId))
  const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY)
  if (activeId === profileId) {
    const fallback = remaining[0]
    if (fallback) localStorage.setItem(ACTIVE_PROFILE_KEY, fallback.id)
  }
  window.dispatchEvent(new CustomEvent(PROFILES_CHANGED_EVENT))
  return 'ok'
}

export interface ResetResult {
  sessionsRemoved: number
  attemptsRemoved: number
  sessionsKept: number
}

const MOCK_MODES: readonly SessionMode[] = ['mock_paper_1', 'mock_paper_2', 'mock_paper_3', 'mini_mock']

/**
 * A finished mock paper is the child's official exam record, so it can never
 * be wiped by a reset. Only unfinished or abandoned mocks may be removed.
 */
export function isCompletedMock(session: Session): boolean {
  return session.status === 'completed' && MOCK_MODES.includes(session.mode)
}

export async function resetAllProgress(profileId: string): Promise<ResetResult> {
  const sessions = await db.sessions.where('profileId').equals(profileId).toArray()
  const kept = sessions.filter(isCompletedMock)
  const removable = sessions.filter((session) => !isCompletedMock(session))
  const keptIds = new Set(kept.map((session) => session.id))
  const attempts = await db.attempts.where('profileId').equals(profileId).toArray()
  const removableAttempts = attempts.filter((attempt) => !keptIds.has(attempt.sessionId))
  await db.attempts.bulkDelete(removableAttempts.map((attempt) => attempt.id))
  await db.sessions.bulkDelete(removable.map((session) => session.id))
  localStorage.removeItem(mistakesClearedKey(profileId))
  return {
    sessionsRemoved: removable.length,
    attemptsRemoved: removableAttempts.length,
    sessionsKept: kept.length,
  }
}

export { resetQuickPractice }

export function resetMistakeBank(profileId: string): void {
  localStorage.setItem(mistakesClearedKey(profileId), String(Date.now()))
}

export async function resetMocks(profileId: string): Promise<ResetResult> {
  const sessions = await db.sessions
    .where('profileId')
    .equals(profileId)
    .and((session) => session.mode === 'mock_paper_1' || session.mode === 'mock_paper_2' || session.mode === 'mini_mock')
    .toArray()
  const kept = sessions.filter(isCompletedMock)
  const removable = sessions.filter((session) => !isCompletedMock(session))
  const keptIds = new Set(kept.map((session) => session.id))
  const mockSessionIds = new Set(sessions.map((session) => session.id))
  const attempts = await db.attempts
    .where('profileId')
    .equals(profileId)
    .and((attempt) => mockSessionIds.has(attempt.sessionId))
    .toArray()
  const removableAttempts = attempts.filter((attempt) => !keptIds.has(attempt.sessionId))
  await db.attempts.bulkDelete(removableAttempts.map((attempt) => attempt.id))
  await db.sessions.bulkDelete(removable.map((session) => session.id))
  return {
    sessionsRemoved: removable.length,
    attemptsRemoved: removableAttempts.length,
    sessionsKept: kept.length,
  }
}
