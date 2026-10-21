import type { Question } from '../db/schemas'

export function normalizeWrittenAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function acceptedAnswersFor(question: Question): string[] {
  const accepted = question.acceptedAnswers ?? []
  if (accepted.length > 0) return accepted
  const correct = question.options[question.correctIndex]
  return correct ? [correct] : []
}

export function isWrittenAnswerCorrect(question: Question, value: string): boolean {
  const given = normalizeWrittenAnswer(value)
  if (given === '') return false
  return acceptedAnswersFor(question).some(
    (answer) => normalizeWrittenAnswer(answer) === given,
  )
}
