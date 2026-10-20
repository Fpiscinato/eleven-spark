import { db, defaultProfiles } from '../db/database'
import { backupSchema, type Backup } from '../db/schemas'

export async function buildBackup(): Promise<Backup> {
  const [profiles, passages, questions, sessions, attempts] = await Promise.all([
    db.profiles.toArray(),
    db.passages.toArray(),
    db.questions.toArray(),
    db.sessions.toArray(),
    db.attempts.toArray(),
  ])
  return backupSchema.parse({
    app: 'ElevenSpark',
    version: 1,
    exportedAt: Date.now(),
    profiles,
    passages,
    questions,
    sessions,
    attempts,
  })
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2)
}

export function triggerDownload(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function backupFilename(): string {
  const d = new Date()
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `elevenspark-backup-${ymd}.json`
}

export function parseBackup(text: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON. Please choose an ElevenSpark backup file.')
  }
  const result = backupSchema.safeParse(raw)
  if (!result.success) {
    const first = result.error.issues[0]
    const path = first.path.join('.') || 'file'
    throw new Error(`This backup file is not valid (${path}: ${first.message}).`)
  }
  return result.data
}

export async function restoreBackup(backup: Backup): Promise<void> {
  await db.transaction(
    'rw',
    db.profiles,
    db.passages,
    db.questions,
    db.sessions,
    db.attempts,
    async () => {
      await db.profiles.clear()
      await db.passages.clear()
      await db.questions.clear()
      await db.sessions.clear()
      await db.attempts.clear()
      const profiles = backup.profiles.length > 0 ? backup.profiles : defaultProfiles()
      await db.profiles.bulkPut(profiles)
      await db.passages.bulkPut(backup.passages)
      await db.questions.bulkPut(backup.questions)
      await db.sessions.bulkPut(backup.sessions)
      await db.attempts.bulkPut(backup.attempts)
    },
  )
  window.dispatchEvent(new Event('elevenspark:profiles-changed'))
}
