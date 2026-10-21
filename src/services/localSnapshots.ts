import { db } from '../db/database'
import type { Attempt, Profile, Session } from '../db/schemas'
import { DATA_CHANGED_EVENT, PROFILES_CHANGED_EVENT } from '../lib/events'

export const SNAPSHOT_INDEX_KEY = 'elevenspark.snapshots.index'
export const SNAPSHOT_KEY_PREFIX = 'elevenspark.snapshot.'
export const LEGACY_SYNC_SNAPSHOT_KEY = 'elevenspark.sync_snapshot'
export const MAX_SNAPSHOTS = 20
export const MAX_SNAPSHOT_ATTEMPTS = 400
export const MAX_SNAPSHOT_SESSIONS = 100
export const MAX_SNAPSHOT_BYTES = 3 * 1024 * 1024

export type SnapshotLabel = 'auto' | 'manual' | 'sync'

export interface SnapshotEntry {
  id: string
  date: string
  createdAt: number
  label: SnapshotLabel
  profiles: number
  sessions: number
  attempts: number
  bytes: number
}

export interface SnapshotPayload {
  id: string
  date: string
  createdAt: number
  label: SnapshotLabel
  profiles: Profile[]
  sessions: Session[]
  attempts: Attempt[]
}

export function snapshotDateKey(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function snapshotKey(id: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${id}`
}

function readIndex(): SnapshotEntry[] {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_INDEX_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const entries: SnapshotEntry[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const record = item as Partial<SnapshotEntry>
      if (typeof record.id !== 'string' || typeof record.createdAt !== 'number') continue
      entries.push({
        id: record.id,
        date: typeof record.date === 'string' ? record.date : record.id,
        createdAt: record.createdAt,
        label: record.label === 'manual' || record.label === 'sync' ? record.label : 'auto',
        profiles: typeof record.profiles === 'number' ? record.profiles : 0,
        sessions: typeof record.sessions === 'number' ? record.sessions : 0,
        attempts: typeof record.attempts === 'number' ? record.attempts : 0,
        bytes: typeof record.bytes === 'number' ? record.bytes : 0,
      })
    }
    return entries.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

function writeIndex(entries: SnapshotEntry[]): void {
  try {
    window.localStorage.setItem(SNAPSHOT_INDEX_KEY, JSON.stringify(entries))
  } catch {
    return
  }
}

export function listSnapshots(): SnapshotEntry[] {
  const entries = readIndex()
  const kept = prune(entries)
  if (kept.length !== entries.length) {
    writeIndex(kept)
  }
  return kept
}

export function readSnapshot(id: string): SnapshotPayload | null {
  try {
    const raw = window.localStorage.getItem(snapshotKey(id))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Partial<SnapshotPayload>
    if (!Array.isArray(record.profiles) || !Array.isArray(record.sessions) || !Array.isArray(record.attempts)) {
      return null
    }
    return {
      id: typeof record.id === 'string' ? record.id : id,
      date: typeof record.date === 'string' ? record.date : id,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
      label: record.label === 'manual' || record.label === 'sync' ? record.label : 'auto',
      profiles: record.profiles as Profile[],
      sessions: record.sessions as Session[],
      attempts: record.attempts as Attempt[],
    }
  } catch {
    return null
  }
}

export function latestSnapshot(): SnapshotPayload | null {
  const entries = readIndex()
  for (const entry of entries) {
    const payload = readSnapshot(entry.id)
    if (payload) return payload
  }
  return readLegacySnapshot()
}

export function readLegacySnapshot(): SnapshotPayload | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_SYNC_SNAPSHOT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Record<string, unknown>
    if (!Array.isArray(record.profiles) || !Array.isArray(record.sessions) || !Array.isArray(record.attempts)) {
      return null
    }
    return {
      id: 'legacy',
      date: snapshotDateKey(),
      createdAt: Date.now(),
      label: 'sync',
      profiles: record.profiles as Profile[],
      sessions: record.sessions as Session[],
      attempts: record.attempts as Attempt[],
    }
  } catch {
    return null
  }
}

function removeSnapshotEntry(entry: SnapshotEntry): void {
  try {
    window.localStorage.removeItem(snapshotKey(entry.id))
  } catch {
    return
  }
}

function prune(entries: SnapshotEntry[]): SnapshotEntry[] {
  let kept = entries
  while (kept.length > MAX_SNAPSHOTS) {
    const oldest = kept[kept.length - 1]
    removeSnapshotEntry(oldest)
    kept = kept.slice(0, kept.length - 1)
  }
  let total = kept.reduce((sum, entry) => sum + entry.bytes, 0)
  while (kept.length > 1 && total > MAX_SNAPSHOT_BYTES) {
    const oldest = kept[kept.length - 1]
    removeSnapshotEntry(oldest)
    total -= oldest.bytes
    kept = kept.slice(0, kept.length - 1)
  }
  return kept
}

async function collectData(): Promise<{
  profiles: Profile[]
  sessions: Session[]
  attempts: Attempt[]
}> {
  const [profiles, sessions, attempts] = await Promise.all([
    db.profiles.toArray(),
    db.sessions.orderBy('startedAt').reverse().limit(MAX_SNAPSHOT_SESSIONS).toArray(),
    db.attempts.orderBy('timestamp').reverse().limit(MAX_SNAPSHOT_ATTEMPTS).toArray(),
  ])
  return { profiles, sessions, attempts }
}

export async function saveSnapshot(label: SnapshotLabel = 'auto'): Promise<SnapshotEntry | null> {
  const { profiles, sessions, attempts } = await collectData()
  const id = snapshotDateKey()
  const payload: SnapshotPayload = {
    id,
    date: id,
    createdAt: Date.now(),
    label,
    profiles,
    sessions,
    attempts,
  }
  const serialized = JSON.stringify(payload)
  const bytes = serialized.length * 2

  let index = listSnapshots().filter((entry) => entry.id !== id)
  let stored = false
  for (let attempt = 0; attempt < 4 && !stored; attempt += 1) {
    try {
      window.localStorage.setItem(snapshotKey(id), serialized)
      stored = true
    } catch {
      const oldest = index[index.length - 1]
      if (!oldest) return null
      removeSnapshotEntry(oldest)
      index = index.slice(0, index.length - 1)
    }
  }
  if (!stored) return null

  const entry: SnapshotEntry = {
    id,
    date: id,
    createdAt: payload.createdAt,
    label,
    profiles: profiles.length,
    sessions: sessions.length,
    attempts: attempts.length,
    bytes,
  }

  const kept = prune([entry, ...index].sort((a, b) => b.createdAt - a.createdAt))
  writeIndex(kept)
  return entry
}

export async function maybeAutoSnapshot(): Promise<SnapshotEntry | null> {
  const { sessions, attempts } = await collectData()
  const entries = listSnapshots()
  const today = entries.find((entry) => entry.id === snapshotDateKey())
  if (today && today.sessions === sessions.length && today.attempts === attempts.length) {
    return today
  }
  return saveSnapshot('auto')
}

export async function restoreSnapshot(id: string): Promise<boolean> {
  const payload = readSnapshot(id)
  if (!payload) return false
  await db.transaction('rw', db.profiles, db.sessions, db.attempts, async () => {
    await db.profiles.clear()
    await db.sessions.clear()
    await db.attempts.clear()
    await db.profiles.bulkPut(payload.profiles)
    await db.sessions.bulkPut(payload.sessions)
    await db.attempts.bulkPut(payload.attempts)
  })
  window.dispatchEvent(new CustomEvent(PROFILES_CHANGED_EVENT))
  return true
}

export function deleteSnapshot(id: string): void {
  const entries = readIndex().filter((entry) => entry.id !== id)
  removeSnapshotEntry({ id, date: id, createdAt: Date.now(), label: 'auto', profiles: 0, sessions: 0, attempts: 0, bytes: 0 })
  writeIndex(entries)
}

export function clearSnapshots(): void {
  for (const entry of readIndex()) {
    removeSnapshotEntry(entry)
  }
  try {
    window.localStorage.removeItem(SNAPSHOT_INDEX_KEY)
  } catch {
    return
  }
}

let watcherTimer: number | null = null

export function startSnapshotWatcher(): () => void {
  const handleDataChanged = () => {
    if (watcherTimer !== null) window.clearTimeout(watcherTimer)
    watcherTimer = window.setTimeout(() => {
      watcherTimer = null
      void maybeAutoSnapshot()
    }, 2000)
  }
  window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged)
  return () => {
    window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged)
    if (watcherTimer !== null) {
      window.clearTimeout(watcherTimer)
      watcherTimer = null
    }
  }
}
