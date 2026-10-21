import type { Question } from '../db/schemas'

export function normalizeWrittenAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ /g, ' ')
    // Only the thousands separator is removed: the decimal point must stay so
    // "12.50" never turns into "1250".
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Reads the numeric meaning of a typed answer so "8", "8.00", "£8" and
 * "8 cm" are all recognised as the same amount. Returns null for answers that
 * are not a number (words, fractions written as words, and so on).
 */
function numericValue(value: string): number | null {
  const cleaned = value
    .replace(/[£$]/g, '')
    .replace(/\s+/g, '')
    .replace(/[a-z%°²³]+$/, '')
  if (cleaned === '') return null
  // A LaTeX fraction such as "\frac{2}{3}" is the same value as "2/3".
  const latexFraction = cleaned.match(/^\\frac\{(-?\d+)\}\{(-?\d+)\}$/)
  if (latexFraction) {
    const denominator = Number(latexFraction[2])
    if (denominator === 0) return null
    return Number(latexFraction[1]) / denominator
  }
  const fraction = cleaned.match(/^(-?\d+)\/(-?\d+)$/)
  if (fraction) {
    const denominator = Number(fraction[2])
    if (denominator === 0) return null
    return Number(fraction[1]) / denominator
  }
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
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
  const accepted = acceptedAnswersFor(question)
  if (accepted.some((answer) => normalizeWrittenAnswer(answer) === given)) return true
  // The child may type the bare amount ("8") or a different but equal way of
  // writing it ("8.00", "£8"). Those must still be marked as correct.
  const givenNumber = numericValue(given)
  if (givenNumber === null) return false
  return accepted.some((answer) => {
    const acceptedNumber = numericValue(normalizeWrittenAnswer(answer))
    return acceptedNumber !== null && Math.abs(acceptedNumber - givenNumber) < 1e-9
  })
}
