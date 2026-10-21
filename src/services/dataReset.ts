import { db } from '../db/database'
import { ACTIVE_PROFILE_KEY, PARENT_PIN_STORAGE_KEY, PROFILES_CHANGED_EVENT } from '../lib/admin'
import { THEME_KEY } from '../lib/themeMode'
import { clearSafetySeal } from './safetySeal'
import { clearSnapshots } from './localSnapshots'

export type ResetScope = 'progress' | 'settings' | 'factory'

export interface ResetResult {
  profilesRemoved: number
  sessionsRemoved: number
  attemptsRemoved: number
  passagesRemoved: number
  questionsRemoved: number
  snapshotsRemoved: number
}

const APP_PREFIX = 'elevenspark.'
const KEEP_ON_FACTORY = new Set<string>([APP_PREFIX + 'bank_version'])

function clearAppStorage(keep: Set<string>): number {
  const removable: string[] = []
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key) continue
      if (!key.startsWith(APP_PREFIX)) continue
      if (keep.has(key)) continue
      removable.push(key)
    }
    for (const key of removable) {
      window.localStorage.removeItem(key)
    }
  } catch {
    return 0
  }
  return removable.length
}

export async function resetLocalData(scope: ResetScope): Promise<ResetResult> {
  const result: ResetResult = {
    profilesRemoved: 0,
    sessionsRemoved: 0,
    attemptsRemoved: 0,
    passagesRemoved: 0,
    questionsRemoved: 0,
    snapshotsRemoved: 0,
  }

  if (scope === 'progress' || scope === 'factory') {
    result.profilesRemoved = await db.profiles.count()
    result.sessionsRemoved = await db.sessions.count()
    result.attemptsRemoved = await db.attempts.count()
    await db.transaction('rw', db.profiles, db.sessions, db.attempts, async () => {
      await db.profiles.clear()
      await db.sessions.clear()
      await db.attempts.clear()
    })
  }

  if (scope === 'factory') {
    result.passagesRemoved = await db.passages.count()
    result.questionsRemoved = await db.questions.count()
    await db.transaction('rw', db.passages, db.questions, async () => {
      await db.passages.clear()
      await db.questions.clear()
    })
  }

  if (scope === 'settings' || scope === 'factory') {
    const keep = scope === 'factory' ? new Set<string>() : KEEP_ON_FACTORY
    result.snapshotsRemoved = clearAppStorage(keep)
    clearSnapshots()
    clearSafetySeal()
    try {
      window.localStorage.removeItem(PARENT_PIN_STORAGE_KEY)
      window.localStorage.removeItem(ACTIVE_PROFILE_KEY)
      window.localStorage.removeItem(THEME_KEY)
    } catch {
      return result
    }
  } else {
    try {
      window.localStorage.removeItem(ACTIVE_PROFILE_KEY)
    } catch {
      return result
    }
  }

  window.dispatchEvent(new CustomEvent(PROFILES_CHANGED_EVENT))
  return result
}
