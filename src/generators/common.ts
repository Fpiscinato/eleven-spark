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
  const indexed = draft.options.map((text, index) => ({
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
