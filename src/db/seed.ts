import { z } from 'zod'
import { QUESTION_BANK_VERSION } from '../config/version'
import { generateQuestionBank } from '../generators'
import { db } from './database'
import { passageSchema, questionSchema } from './schemas'

const BANK_VERSION_KEY = 'elevenspark.bank_version'
const SNAPSHOT_KEY = 'elevenspark.sync_snapshot'

interface SyncSnapshot {
  profiles: unknown[]
  sessions: unknown[]
  attempts: unknown[]
}

function readSnapshot(): SyncSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Record<string, unknown>
    if (!Array.isArray(record.profiles) || !Array.isArray(record.sessions) || !Array.isArray(record.attempts)) {
      return null
    }
    return { profiles: record.profiles, sessions: record.sessions, attempts: record.attempts }
  } catch {
    return null
  }
}

async function restoreSnapshotIfEmpty(): Promise<void> {
  const [sessionCount, attemptCount] = await Promise.all([db.sessions.count(), db.attempts.count()])
  if (sessionCount > 0 || attemptCount > 0) return
  const snapshot = readSnapshot()
  if (!snapshot) return
  if (snapshot.sessions.length === 0 && snapshot.attempts.length === 0) return
  await db.transaction('rw', db.sessions, db.attempts, async () => {
    await db.sessions.bulkPut(snapshot.sessions as never)
    await db.attempts.bulkPut(snapshot.attempts as never)
  })
}

export async function syncQuestionBank(): Promise<void> {
  const bankVersion = String(QUESTION_BANK_VERSION)
  const storedVersion = window.localStorage.getItem(BANK_VERSION_KEY)
  const questionCount = await db.questions.count()
  if (questionCount === 0 || storedVersion !== bankVersion) {
    const bank = generateQuestionBank('')
    const passages = z.array(passageSchema).parse(bank.passages)
    const questions = z.array(questionSchema).parse(bank.questions)
    await db.transaction('rw', db.passages, db.questions, async () => {
      if (storedVersion !== null && questionCount > 0) {
        const existingIds = new Set((await db.questions.toArray()).map((question) => question.id))
        const keepIds = new Set(questions.map((question) => question.id))
        const staleIds = [...existingIds].filter((id) => !keepIds.has(id))
        if (staleIds.length > 0) await db.questions.bulkDelete(staleIds)
      }
      await db.passages.bulkPut(passages)
      await db.questions.bulkPut(questions)
    })
    window.localStorage.setItem(BANK_VERSION_KEY, bankVersion)
  }
  await restoreSnapshotIfEmpty()
}
