import { z } from 'zod'
import { db } from '../db/database'
import { attemptSchema, profileSchema, sessionSchema, type Attempt, type Profile, type Session } from '../db/schemas'
import { triggerDownload } from '../lib/backup'
import { PROFILES_CHANGED_EVENT } from '../lib/admin'
import { saveSnapshot } from './localSnapshots'

export const GIST_FILENAME = 'elevenspark-progress-sync.json'
const GIST_DESCRIPTION = 'ElevenSpark progress sync'
const TOKEN_KEY = 'elevenspark.github_token'
const GIST_KEY = 'elevenspark.gist_id'
const LAST_SYNC_KEY = 'elevenspark.last_sync_at'
const API_BASE = 'https://api.github.com/gists'

export type SyncState = 'not-configured' | 'syncing' | 'ok' | 'error'

export interface SyncStatus {
  state: SyncState
  lastSyncAt: number | null
  error: string | null
  online: boolean
  busy: boolean
}

export interface SyncConfig {
  token: string
  gistId: string
}

export interface SyncPayload {
  version: 1
  updatedAt: number
  profiles: Profile[]
  sessions: Session[]
  attempts: Attempt[]
}

const syncPayloadSchema = z.object({
  version: z.number().optional(),
  updatedAt: z.number().optional(),
  profiles: z.array(profileSchema).default([]),
  sessions: z.array(sessionSchema),
  attempts: z.array(attemptSchema),
})

const listeners = new Set<() => void>()

function readLastSync(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_SYNC_KEY)
    if (!raw) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

let status: SyncStatus = {
  state: 'not-configured',
  lastSyncAt: readLastSync(),
  error: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  busy: false,
}

function emit(): void {
  for (const listener of listeners) listener()
}

function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch }
  emit()
}

export function getSyncStatus(): SyncStatus {
  return status
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSyncConfig(): SyncConfig {
  try {
    return {
      token: window.localStorage.getItem(TOKEN_KEY) ?? '',
      gistId: window.localStorage.getItem(GIST_KEY) ?? '',
    }
  } catch {
    return { token: '', gistId: '' }
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, config.token.trim())
    window.localStorage.setItem(GIST_KEY, config.gistId.trim())
  } catch {
    setStatus({ state: 'error', error: 'This browser is blocking local storage, so the token cannot be saved.' })
    return
  }
  if (config.token.trim()) {
    setStatus({ state: 'syncing', error: null })
    scheduleSync(600)
  } else {
    setStatus({ state: 'not-configured', error: null, busy: false })
  }
}

export function isConfigured(config: SyncConfig = getSyncConfig()): boolean {
  return config.token.trim().length > 0
}

async function collectPayload(): Promise<SyncPayload> {
  const [profiles, sessions, attempts] = await Promise.all([
    db.profiles.toArray(),
    db.sessions.toArray(),
    db.attempts.toArray(),
  ])
  return { version: 1, updatedAt: Date.now(), profiles, sessions, attempts }
}

function sessionTime(session: Session): number {
  return session.completedAt ?? session.startedAt
}

function mergeById<T extends { id: string }>(local: T[], remote: T[], timeOf: (row: T) => number): T[] {
  const byId = new Map<string, T>()
  for (const row of remote) byId.set(row.id, row)
  for (const row of local) {
    const existing = byId.get(row.id)
    if (!existing || timeOf(row) >= timeOf(existing)) {
      byId.set(row.id, row)
    }
  }
  return [...byId.values()]
}

export function mergePayloads(local: SyncPayload, remote: SyncPayload): SyncPayload {
  return {
    version: 1,
    updatedAt: Date.now(),
    profiles: mergeById(local.profiles, remote.profiles, (row) => row.updatedAt),
    sessions: mergeById(local.sessions, remote.sessions, sessionTime),
    attempts: mergeById(local.attempts, remote.attempts, (row) => row.timestamp),
  }
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

async function readGithubError(response: Response, fallback: string): Promise<string> {
  let detail = ''
  try {
    const body = (await response.json()) as { message?: string }
    if (body.message) detail = ` — ${body.message}`
  } catch {
    detail = ''
  }
  if (response.status === 401) return `GitHub token was rejected (401${detail}). Check your Personal Access Token.`
  if (response.status === 403) return `GitHub said no (403${detail}). Check the token scope for gists.`
  if (response.status === 404) return `Gist not found (404${detail}). Check the Gist ID.`
  return `${fallback} (${response.status}${detail}).`
}

function stringifyPayload(payload: SyncPayload): string {
  return JSON.stringify(payload, null, 2)
}

async function createGist(token: string, payload: SyncPayload): Promise<string> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILENAME]: { content: stringifyPayload(payload) } },
    }),
  })
  if (!response.ok) throw new Error(await readGithubError(response, 'Could not create the Gist'))
  const body = (await response.json()) as { id: string }
  return body.id
}

async function fetchRemotePayload(token: string, gistId: string): Promise<SyncPayload> {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(gistId.trim())}`, {
    method: 'GET',
    headers: headers(token),
  })
  if (!response.ok) throw new Error(await readGithubError(response, 'Could not read the Gist'))
  const body = (await response.json()) as {
    files?: Record<string, { content?: string }>
  }
  const content = body.files?.[GIST_FILENAME]?.content
  if (!content) throw new Error(`The Gist does not contain ${GIST_FILENAME} yet — upload once to create it.`)
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('The file inside the Gist is not valid JSON. Fix it or upload a fresh file.')
  }
  const result = syncPayloadSchema.safeParse(parsed)
  if (!result.success) throw new Error('The file inside the Gist is not an ElevenSpark sync file.')
  return {
    version: 1,
    updatedAt: result.data.updatedAt ?? 0,
    profiles: result.data.profiles,
    sessions: result.data.sessions,
    attempts: result.data.attempts,
  }
}

async function updateGist(token: string, gistId: string, payload: SyncPayload): Promise<void> {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(gistId.trim())}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      files: { [GIST_FILENAME]: { content: stringifyPayload(payload) } },
    }),
  })
  if (!response.ok) throw new Error(await readGithubError(response, 'Could not update the Gist'))
}

function writeLastSync(value: number): boolean {
  try {
    window.localStorage.setItem(LAST_SYNC_KEY, String(value))
    return true
  } catch {
    return false
  }
}

function markSynced(): void {
  const now = Date.now()
  setStatus({ state: 'ok', lastSyncAt: now, error: null, busy: false })
  writeLastSync(now)
}

export async function syncNow(): Promise<void> {
  const { token, gistId } = getSyncConfig()
  if (!token.trim()) {
    setStatus({ state: 'not-configured', busy: false, error: 'Add your GitHub Personal Access Token to start syncing.' })
    return
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus({ state: 'error', busy: false, error: 'You are offline — ElevenSpark will sync when you reconnect.' })
    return
  }
  setStatus({ state: 'syncing', busy: true, error: null })
  try {
    const local = await collectPayload()
    if (!gistId.trim()) {
      const createdId = await createGist(token, local)
      try {
        window.localStorage.setItem(GIST_KEY, createdId)
      } catch {
        setStatus({ state: 'error', busy: false, error: 'Gist created, but this browser blocked saving the Gist ID.' })
        return
      }
      void saveSnapshot('sync')
      markSynced()
      return
    }
    const remote = await fetchRemotePayload(token, gistId)
    const merged = mergePayloads(local, remote)
    await updateGist(token, gistId, merged)
    void saveSnapshot('sync')
    markSynced()
  } catch (error) {
    setStatus({
      state: 'error',
      busy: false,
      error: error instanceof Error ? error.message : 'Unexpected sync error.',
    })
  }
}

let debounceTimer: number | null = null

export function scheduleSync(delayMs = 4000): void {
  if (!isConfigured()) return
  if (debounceTimer !== null) window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null
    void syncNow()
  }, delayMs)
}

export function exportSyncFile(): void {
  void collectPayload().then((payload) => {
    triggerDownload('elevenspark-sync.json', stringifyPayload(payload))
  })
}

export async function importSyncFile(text: string): Promise<number> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const result = syncPayloadSchema.safeParse(parsed)
  if (!result.success) throw new Error('That file is not an ElevenSpark sync file.')
  const remote: SyncPayload = {
    version: 1,
    updatedAt: result.data.updatedAt ?? 0,
    profiles: result.data.profiles,
    sessions: result.data.sessions,
    attempts: result.data.attempts,
  }
  const local = await collectPayload()
  const merged = mergePayloads(local, remote)
  await db.transaction('rw', db.profiles, db.sessions, db.attempts, async () => {
    await db.profiles.bulkPut(merged.profiles)
    await db.sessions.bulkPut(merged.sessions)
    await db.attempts.bulkPut(merged.attempts)
  })
  scheduleSync(1500)
  return merged.attempts.length
}

export function startSyncListeners(): () => void {
  const handleOnline = () => {
    setStatus({ online: true })
    scheduleSync(2000)
  }
  const handleOffline = () => {
    setStatus({ online: false })
  }
  const handleProfilesChanged = () => {
    scheduleSync(1500)
  }
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  window.addEventListener(PROFILES_CHANGED_EVENT, handleProfilesChanged)
  if (isConfigured()) scheduleSync(1500)
  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener(PROFILES_CHANGED_EVENT, handleProfilesChanged)
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }
}
