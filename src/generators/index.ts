import type { Passage, Question, Subject } from '../db/schemas'
import { generateCompassQuestions } from './compassGenerator'
import { generateEnglishQuestions } from './englishGenerator'
import { generateMathsQuestions } from './mathsGenerator'
import { generateNvrQuestions } from './nvrGenerator'
import { generateVrQuestions } from './vrGenerator'

export interface QuestionBank {
  passages: Passage[]
  questions: Question[]
}

export function generateQuestionBank(nonce: string): QuestionBank {
  const english = generateEnglishQuestions(nonce)
  const vr = generateVrQuestions(nonce)
  const maths = generateMathsQuestions(nonce)
  const nvr = generateNvrQuestions(nonce)
  const compass = generateCompassQuestions(nonce)
  return {
    passages: english.passages,
    questions: [...english.questions, ...vr, ...maths, ...nvr, ...compass],
  }
}

function randomNonce(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function generateFreshBatch(count: number): QuestionBank {
  const bank = generateQuestionBank(randomNonce())
  if (count >= bank.questions.length) return bank

  const bySubject = new Map<Subject, Question[]>()
  for (const question of bank.questions) {
    const bucket = bySubject.get(question.subject) ?? []
    bucket.push(question)
    bySubject.set(question.subject, bucket)
  }
  for (const bucket of bySubject.values()) {
    for (let i = bucket.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      const a = bucket[i]
      const b = bucket[j]
      if (a && b) {
        bucket[i] = b
        bucket[j] = a
      }
    }
  }

  const subjects: Subject[] = ['english', 'maths', 'compass', 'vr', 'nvr']
  const picked: Question[] = []
  let round = 0
  while (picked.length < count) {
    let added = false
    for (const subject of subjects) {
      if (picked.length >= count) break
      const bucket = bySubject.get(subject) ?? []
      const question = bucket[round]
      if (question) {
        picked.push(question)
        added = true
      }
    }
    if (!added) break
    round += 1
  }

  const passageIds = new Set(
    picked
      .map((question) => question.passageId)
      .filter((id): id is string => id !== undefined),
  )
  return {
    passages: bank.passages.filter((passage) => passageIds.has(passage.id)),
    questions: picked,
  }
}
