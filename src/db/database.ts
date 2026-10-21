import Dexie, { type Table } from 'dexie'
import type { Attempt, Passage, Profile, Question, Session } from './schemas'
import { DEFAULT_PROFILE_ID } from './schemas'

export class ElevenSparkDB extends Dexie {
  profiles!: Table<Profile, string>
  questions!: Table<Question, string>
  passages!: Table<Passage, string>
  sessions!: Table<Session, string>
  attempts!: Table<Attempt, string>

  constructor() {
    super('eleven-spark')
    this.version(1).stores({
      questions: 'id, subject, topic, difficulty, passageId',
      passages: 'id, title',
      sessions: 'id, mode, startedAt',
      attempts: 'id, sessionId, questionId, subject, timestamp',
    })
    this.version(2)
      .stores({
        profiles: 'id, updatedAt',
        questions: 'id, subject, topic, difficulty, passageId',
        passages: 'id, title',
        sessions: 'id, profileId, mode, startedAt',
        attempts: 'id, profileId, sessionId, questionId, subject, timestamp',
      })
      .upgrade(async (tx) => {
        await tx
          .table('sessions')
          .toCollection()
          .modify((row) => {
            if (!row.profileId) row.profileId = DEFAULT_PROFILE_ID
          })
        await tx
          .table('attempts')
          .toCollection()
          .modify((row) => {
            if (!row.profileId) row.profileId = DEFAULT_PROFILE_ID
          })
      })
    this.version(3)
      .stores({
        profiles: 'id, updatedAt',
        questions: 'id, subject, topic, difficulty, passageId',
        passages: 'id, title',
        sessions: 'id, profileId, status, mode, startedAt',
        attempts: 'id, profileId, sessionId, questionId, subject, timestamp',
      })
      .upgrade(async (tx) => {
        await tx
          .table('sessions')
          .toCollection()
          .modify((row) => {
            if (!row.status) {
              row.status = row.completedAt !== null && row.completedAt !== undefined ? 'completed' : 'in_progress'
            }
          })
      })
    this.version(4).stores({
      profiles: 'id, createdAt, updatedAt',
      questions: 'id, subject, topic, difficulty, passageId',
      passages: 'id, title',
      sessions: 'id, profileId, status, mode, startedAt',
      attempts: 'id, profileId, sessionId, questionId, subject, timestamp',
    })
    this.version(5).stores({
      profiles: 'id, createdAt, updatedAt',
      questions: 'id, subject, topic, difficulty, passageId',
      passages: 'id, title',
      sessions: 'id, profileId, status, mode, startedAt',
      attempts: 'id, profileId, sessionId, questionId, subject, timestamp',
    })
  }
}

export const db = new ElevenSparkDB()

export async function initializeDatabase(): Promise<void> {
  await db.open()
  const { syncQuestionBank } = await import('./seed')
  await syncQuestionBank()
}
