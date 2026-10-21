import type { Difficulty, Question, Subject, SvgConfig } from '../db/schemas'
import type { Rng } from './rng'

export interface QuestionDraft {
  topic: string
  difficulty: Difficulty
  stem: string
  options: string[]
  correctIndex: number
  explanation: string
  timeTargetSeconds: number
  svgConfig?: SvgConfig
  passageId?: string
}

export type OptionTuple = [string, string, string, string, string]

/**
 * Shifts the number inside an option so that a duplicated answer can be
 * replaced by a fresh, still plausible distractor ("30 cm²" -> "31 cm²").
 */
function perturbNumericOption(text: string, delta: number): string | null {
  const match = text.match(/^([^0-9]*)(-?\d+(?:\.\d+)?)([^0-9]*)$/)
  if (!match) return null
  const prefix = match[1] ?? ''
  const digits = match[2] ?? ''
  const suffix = match[3] ?? ''
  const value = Number(digits)
  if (!Number.isFinite(value)) return null
  const decimals = digits.includes('.') ? (digits.split('.')[1] ?? '').length : 0
  return `${prefix}${(value + delta).toFixed(decimals)}${suffix}`
}

/**
 * Guarantees that the five options of a question are all different.
 * English questions may legitimately differ only by capitalisation (that is
 * how capital letters are tested), every other subject is compared ignoring
 * case. The correct answer is never replaced.
 */
export function ensureUniqueOptions(options: string[], caseSensitive: boolean, protectedIndex = -1): string[] {
  const keyOf = (value: string): string => (caseSensitive ? value : value.toLowerCase())
  const result = [...options]
  const used = new Set<string>()

  if (protectedIndex >= 0 && protectedIndex < result.length) {
    used.add(keyOf(result[protectedIndex]?.trim() ?? ''))
  }

  for (let index = 0; index < result.length; index += 1) {
    if (index === protectedIndex) continue
    const trimmed = result[index]?.trim() ?? ''
    const key = keyOf(trimmed)
    if (trimmed !== '' && !used.has(key)) {
      used.add(key)
      continue
    }

    let replacement = ''
    if (trimmed === '') {
      replacement = `Option ${index + 1}`
    } else {
      for (const delta of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8, 9, -9, 10, -10]) {
        const candidate = perturbNumericOption(trimmed, delta)
        if (candidate === null) continue
        if (used.has(keyOf(candidate))) continue
        replacement = candidate
        break
      }
    }
    if (replacement === '') {
      let suffix = 2
      while (replacement === '') {
        const candidate = `${trimmed} (${suffix})`
        if (!used.has(keyOf(candidate))) replacement = candidate
        suffix += 1
      }
    }
    used.add(keyOf(replacement))
    result[index] = replacement
  }

  return result
}

export function buildQuestion(
  rng: Rng,
  subject: Subject,
  id: string,
  draft: QuestionDraft,
): Question {
  if (draft.options.length !== 5) {
    throw new Error(`Question ${id} must have exactly 5 options, received ${draft.options.length}.`)
  }
  const optionFigures = draft.svgConfig?.optionFigures
  if (optionFigures !== undefined && optionFigures.length !== 5) {
    throw new Error(`Question ${id} must have exactly 5 option figures, received ${optionFigures.length}.`)
  }
  const optionTexts =
    optionFigures !== undefined
      ? draft.options
      : ensureUniqueOptions(draft.options, subject === 'english', draft.correctIndex)
  const indexed = optionTexts.map((text, index) => ({
    text,
    figure: optionFigures?.[index],
    correct: index === draft.correctIndex,
  }))
  const shuffled = rng.shuffle(indexed)
  const correctIndex = shuffled.findIndex((entry) => entry.correct)
  const options: OptionTuple = [
    shuffled[0]?.text ?? '',
    shuffled[1]?.text ?? '',
    shuffled[2]?.text ?? '',
    shuffled[3]?.text ?? '',
    shuffled[4]?.text ?? '',
  ]
  const question: Question = {
    id,
    subject,
    topic: draft.topic,
    difficulty: draft.difficulty,
    stem: draft.stem,
    options,
    correctIndex,
    explanation: draft.explanation,
    timeTargetSeconds: draft.timeTargetSeconds,
  }
  if (draft.passageId !== undefined) question.passageId = draft.passageId
  if (draft.svgConfig !== undefined) {
    if (optionFigures !== undefined) {
      question.svgConfig = {
        ...draft.svgConfig,
        optionFigures: shuffled.map((entry) => entry.figure).filter((figure) => figure !== undefined),
      }
    } else {
      question.svgConfig = draft.svgConfig
    }
  }
  return question
}

export function makeQuestionId(
  nonce: string,
  subject: Subject,
  topic: string,
  index: number,
): string {
  const prefix = nonce === '' ? '' : `${nonce}-`
  return `${prefix}q-${subject}-${topic}-${String(index).padStart(3, '0')}`
}

export function difficultyAt(index: number): Difficulty {
  const slot = index % 3
  if (slot === 0) return 1
  if (slot === 1) return 2
  return 3
}

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function letterAt(position: number): string {
  const wrapped = ((position % 26) + 26) % 26
  return ALPHABET[wrapped] ?? 'A'
}

export function alphabetRuler(): string {
  return ALPHABET.split('').join(' ')
}

export function shiftWord(word: string, shift: number): string {
  return word
    .split('')
    .map((ch) => letterAt(ALPHABET.indexOf(ch) + shift))
    .join('')
}
