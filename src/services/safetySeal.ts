import { db } from '../db/database'
import { QUESTION_BANK_VERSION } from '../config/version'
import { validatePassage, validateQuestion, type SafetyViolation } from '../utils/childSafetyGuard'

export const SAFETY_SEAL_KEY = 'elevenspark.safety_seal'
export const SAFETY_SEAL_VERSION = 1

export interface SafetySeal {
  sealVersion: number
  bankVersion: string
  checkedAt: number
  questionsChecked: number
  passagesChecked: number
  violations: number
  samples: string[]
  durationMs: number
}

export interface SafetyCheckOptions {
  batchSize?: number
  onProgress?: (done: number, total: number) => void
}

export function readSafetySeal(): SafetySeal | null {
  try {
    const raw = window.localStorage.getItem(SAFETY_SEAL_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Partial<SafetySeal>
    if (typeof record.checkedAt !== 'number') return null
    return {
      sealVersion: typeof record.sealVersion === 'number' ? record.sealVersion : SAFETY_SEAL_VERSION,
      bankVersion: typeof record.bankVersion === 'string' ? record.bankVersion : '',
      checkedAt: record.checkedAt,
      questionsChecked: typeof record.questionsChecked === 'number' ? record.questionsChecked : 0,
      passagesChecked: typeof record.passagesChecked === 'number' ? record.passagesChecked : 0,
      violations: typeof record.violations === 'number' ? record.violations : 0,
      samples: Array.isArray(record.samples) ? record.samples.slice(0, 5) : [],
      durationMs: typeof record.durationMs === 'number' ? record.durationMs : 0,
    }
  } catch {
    return null
  }
}

export function writeSafetySeal(seal: SafetySeal): void {
  try {
    window.localStorage.setItem(SAFETY_SEAL_KEY, JSON.stringify(seal))
  } catch {
    return
  }
}

export function clearSafetySeal(): void {
  try {
    window.localStorage.removeItem(SAFETY_SEAL_KEY)
  } catch {
    return
  }
}

function describe(violation: SafetyViolation): string {
  return `${violation.field}: "${violation.term}"`
}

export async function runSafetyCheck(options: SafetyCheckOptions = {}): Promise<SafetySeal> {
  const batchSize = options.batchSize ?? 800
  const startedAt = Date.now()
  const total = (await db.questions.count()) + (await db.passages.count())
  const samples: string[] = []
  let violations = 0
  let questionsChecked = 0
  let passagesChecked = 0

  const questionTotal = await db.questions.count()
  for (let offset = 0; offset < questionTotal; offset += batchSize) {
    const rows = await db.questions.orderBy('id').offset(offset).limit(batchSize).toArray()
    for (const question of rows) {
      questionsChecked += 1
      const result = validateQuestion(question)
      if (!result.safe) {
        violations += result.violations.length
        for (const violation of result.violations) {
          if (samples.length < 5) samples.push(describe(violation))
        }
      }
    }
    options.onProgress?.(questionsChecked + passagesChecked, total)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  const passageTotal = await db.passages.count()
  for (let offset = 0; offset < passageTotal; offset += batchSize) {
    const rows = await db.passages.orderBy('id').offset(offset).limit(batchSize).toArray()
    for (const passage of rows) {
      passagesChecked += 1
      const result = validatePassage(passage)
      if (!result.safe) {
        violations += result.violations.length
        for (const violation of result.violations) {
          if (samples.length < 5) samples.push(describe(violation))
        }
      }
    }
    options.onProgress?.(questionsChecked + passagesChecked, total)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  const seal: SafetySeal = {
    sealVersion: SAFETY_SEAL_VERSION,
    bankVersion: String(QUESTION_BANK_VERSION),
    checkedAt: Date.now(),
    questionsChecked,
    passagesChecked,
    violations,
    samples,
    durationMs: Date.now() - startedAt,
  }
  writeSafetySeal(seal)
  return seal
}

export interface BankFilterResult<T> {
  kept: T[]
  removed: number
}

export function filterUnsafeQuestions<T extends Parameters<typeof validateQuestion>[0]>(
  questions: T[],
): BankFilterResult<T> {
  const kept: T[] = []
  let removed = 0
  for (const question of questions) {
    if (validateQuestion(question).safe) {
      kept.push(question)
    } else {
      removed += 1
    }
  }
  return { kept, removed }
}

export function filterUnsafePassages<T extends Parameters<typeof validatePassage>[0]>(
  passages: T[],
): BankFilterResult<T> {
  const kept: T[] = []
  let removed = 0
  for (const passage of passages) {
    if (validatePassage(passage).safe) {
      kept.push(passage)
    } else {
      removed += 1
    }
  }
  return { kept, removed }
}
