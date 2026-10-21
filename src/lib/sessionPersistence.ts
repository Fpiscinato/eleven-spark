/**
 * Keeps the running practice and mock sessions alive while the child moves
 * between screens or tabs. The data lives in `sessionStorage`, so it is
 * cleared as soon as the browser tab is closed.
 */
const PRACTICE_RUN_KEY = 'elevenspark.practice.run'
const PRACTICE_PROGRESS_PREFIX = 'elevenspark.practice.progress.'
const MOCK_ENGINE_KEY = 'elevenspark.mock.engine'

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    return null
  }
}

export function writeSession(key: string, value: unknown): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(key, JSON.stringify(value))
  } catch {
    // The session storage is full or blocked: the practice simply keeps
    // running in memory instead of being restored later.
  }
}

export function readSession<T>(key: string): T | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function removeSession(key: string): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(key)
  } catch {
    // Nothing to clean up.
  }
}

export function removeSessionsWithPrefix(prefix: string): void {
  const store = storage()
  if (!store) return
  try {
    const keys: string[] = []
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index)
      if (key && key.startsWith(prefix)) keys.push(key)
    }
    for (const key of keys) store.removeItem(key)
  } catch {
    // Nothing to clean up.
  }
}

export const SESSION_KEYS = {
  practiceRun: PRACTICE_RUN_KEY,
  practiceProgress: PRACTICE_PROGRESS_PREFIX,
  mockEngine: MOCK_ENGINE_KEY,
} as const
