import type { Question } from '../db/schemas'
import { isCodeSafe } from '../utils/childSafetyGuard'
import {
  alphabetRuler,
  buildQuestion,
  difficultyAt,
  letterAt,
  makeQuestionId,
  shiftWord,
} from './common'
import { createRng, hashSeed, type Rng } from './rng'

const BASE_SEED = 20261020

const CODE_WORDS = [
  'CLOUD',
  'RAIN',
  'STORM',
  'LIGHT',
  'BRICK',
  'PLANT',
  'SHEEP',
  'WHALE',
  'GRAPE',
  'MOUSE',
  'TRAIN',
  'SUGAR',
]

const MOVE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['HEART', 'EARTH'],
  ['RINSE', 'RISEN'],
  ['SAINT', 'SATIN'],
  ['CRATE', 'CATER'],
  ['SPARE', 'PARES'],
  ['TRIAL', 'TRAIL'],
  ['BEAST', 'BEATS'],
  ['NEAR', 'EARN'],
  ['SHARK', 'HARKS'],
  ['BREAD', 'BEARD'],
  ['PLATE', 'PLEAT'],
  ['SHARE', 'HARES'],
]

const HIDDEN_SETUPS: ReadonlyArray<{ host: string; word: string }> = [
  { host: 'STARLING', word: 'STAR' },
  { host: 'STOPWATCH', word: 'STOP' },
  { host: 'SUNFLOWER', word: 'FLOW' },
  { host: 'SUNSHINE', word: 'SHIN' },
  { host: 'PLAYGROUND', word: 'PLAY' },
  { host: 'FEATHER', word: 'FEAT' },
  { host: 'KITCHEN', word: 'ITCH' },
  { host: 'BASKET', word: 'BASK' },
  { host: 'MARKET', word: 'MARK' },
  { host: 'ROCKET', word: 'ROCK' },
  { host: 'BISCUIT', word: 'SUIT' },
  { host: 'CARPET', word: 'CARP' },
]

const FOUR_LETTER_POOL = [
  'FISH',
  'WOLF',
  'BOOK',
  'JUMP',
  'LAKE',
  'SHIP',
  'GATE',
  'FROG',
  'NEST',
  'WIND',
  'PATH',
  'BIRD',
  'LAMP',
  'DUST',
  'GOLD',
  'HARP',
  'MIST',
  'POND',
]

const SYNONYM_ENTRIES: ReadonlyArray<{ word: string; synonym: string; antonym: string }> = [
  { word: 'ancient', synonym: 'old', antonym: 'modern' },
  { word: 'gigantic', synonym: 'enormous', antonym: 'tiny' },
  { word: 'fragile', synonym: 'delicate', antonym: 'sturdy' },
  { word: 'silent', synonym: 'quiet', antonym: 'noisy' },
  { word: 'scarce', synonym: 'rare', antonym: 'abundant' },
  { word: 'brave', synonym: 'courageous', antonym: 'cowardly' },
  { word: 'rapid', synonym: 'quick', antonym: 'slow' },
  { word: 'gloomy', synonym: 'dismal', antonym: 'cheerful' },
  { word: 'fortunate', synonym: 'lucky', antonym: 'unlucky' },
  { word: 'polite', synonym: 'courteous', antonym: 'rude' },
]

function alphabetIndex(ch: string): number {
  return ch.charCodeAt(0) - 65
}

/**
 * Picks two real words and the shift for the secret code so that neither the
 * words nor the coded strings can accidentally spell something a child should
 * never read (for example "SEX" hiding inside a letter series).
 */
function pickSafeCodeWords(rng: Rng): { example: string; question: string; shift: number } {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const example = rng.pick(CODE_WORDS)
    const question = rng.pick(CODE_WORDS.filter((word) => word !== example))
    const shift = rng.int(1, 3)
    const coded = [example, question, shiftWord(example, shift), shiftWord(question, shift)]
    for (let extra = 1; extra <= 3; extra += 1) {
      coded.push(shiftWord(question, shift + extra), shiftWord(question, -extra))
    }
    if (coded.every((entry) => isCodeSafe(entry))) return { example, question, shift }
  }
  const safeWord = CODE_WORDS.find((word) => isCodeSafe(word)) ?? CODE_WORDS[0] ?? 'CLOUD'
  const otherSafe =
    CODE_WORDS.find((word) => word !== safeWord && isCodeSafe(word)) ?? CODE_WORDS[1] ?? 'RAIN'
  return { example: safeWord, question: otherSafe, shift: 1 }
}

function letterCodeQuestion(rng: Rng, index: number, nonce: string): Question {
  const { example: exampleWord, question: questionWord, shift } = pickSafeCodeWords(rng)
  const exampleCoded = shiftWord(exampleWord, shift)
  const questionCoded = shiftWord(questionWord, shift)

  if (index % 2 === 0) {
    return buildQuestion(rng, 'vr', makeQuestionId(nonce, 'vr', 'letter_codes', index), {
      topic: 'letter_codes',
      difficulty: difficultyAt(index),
      stem: `In a secret code, every letter moves the same number of places forward in the alphabet.\n\n${alphabetRuler()}\n\n${exampleWord} is written as ${exampleCoded}.\n\nHow is ${questionWord} written in this code?`,
      options: [
        questionCoded,
        shiftWord(questionWord, shift + 1),
        shiftWord(questionWord, shift + 2),
        shiftWord(questionWord, shift + 3),
        questionWord,
      ],
      correctIndex: 0,
      explanation: `The code moves every letter forward by ${shift} place${shift === 1 ? '' : 's'}: ${exampleWord} becomes ${exampleCoded}. Doing the same to ${questionWord} gives ${questionCoded}.`,
      timeTargetSeconds: 45,
    })
  }

  return buildQuestion(rng, 'vr', makeQuestionId(nonce, 'vr', 'letter_codes', index), {
    topic: 'letter_codes',
    difficulty: difficultyAt(index),
    stem: `In a secret code, every letter moves the same number of places forward in the alphabet.\n\n${alphabetRuler()}\n\nIn this code, ${exampleCoded} stands for ${exampleWord}.\n\nWhich real word does ${questionCoded} stand for?`,
    options: [
      questionWord,
      shiftWord(questionCoded, -shift - 1),
      shiftWord(questionCoded, -shift - 2),
      shiftWord(questionCoded, -shift - 3),
      questionCoded,
    ],
    correctIndex: 0,
    explanation: `Every letter was moved forward by ${shift}, so move each letter of ${questionCoded} back by ${shift} to rebuild ${questionWord}.`,
    timeTargetSeconds: 45,
  })
}

/**
 * True when `to` can be built from `from` by lifting one letter out and
 * sliding it somewhere else while the other letters keep their order.
 */
function canMoveOneLetter(from: string, to: string): boolean {
  if (from.length !== to.length) return false
  for (let i = 0; i < from.length; i += 1) {
    const rest = from.slice(0, i) + from.slice(i + 1)
    for (let j = 0; j <= rest.length; j += 1) {
      if (rest.slice(0, j) + from[i] + rest.slice(j) === to) return true
    }
  }
  return false
}

function moveOneLetterQuestion(rng: Rng, index: number, nonce: string): Question {
  const [from, to] = rng.pick(MOVE_PAIRS)
  const distractors = rng
    .shuffle(
      MOVE_PAIRS.map((entry) => entry[1]).filter(
        (word) => word !== to && !canMoveOneLetter(from, word),
      ),
    )
    .slice(0, 4)
  return buildQuestion(rng, 'vr', makeQuestionId(nonce, 'vr', 'move_one_letter', index), {
    topic: 'move_one_letter',
    difficulty: difficultyAt(index),
    stem: `Move exactly one letter of ${from} to make another real word.\n\nYou may move the letter to the front, the end, or between two letters — but the other letters must keep their order.`,
    options: [to, ...distractors],
    correctIndex: 0,
    explanation: `Remove one letter and slide it somewhere else while the rest keep their order. Doing that to ${from} builds ${to}.`,
    timeTargetSeconds: 40,
  })
}

function hiddenWordQuestion(rng: Rng, index: number, nonce: string): Question {
  const setup = HIDDEN_SETUPS[index % HIDDEN_SETUPS.length]
  const distractors: string[] = []
  for (const candidate of rng.shuffle(FOUR_LETTER_POOL)) {
    if (candidate === setup.word) continue
    if (setup.host.includes(candidate)) continue
    distractors.push(candidate)
    if (distractors.length === 4) break
  }
  while (distractors.length < 4) {
    const candidate = rng.pick(FOUR_LETTER_POOL)
    if (candidate !== setup.word && !setup.host.includes(candidate) && !distractors.includes(candidate)) {
      distractors.push(candidate)
    }
  }
  return buildQuestion(rng, 'vr', makeQuestionId(nonce, 'vr', 'hidden_words', index), {
    topic: 'hidden_words',
    difficulty: difficultyAt(index),
    stem: `Which four-letter word is hidden inside these letters?\n\n${setup.host
      .split('')
      .join(' ')}\n\nThe hidden word runs straight through the letters without skipping any.`,
    options: [setup.word, ...distractors],
    correctIndex: 0,
    explanation: `Reading straight through, the letters ${setup.word
      .split('')
      .join(' ')} sit next to each other inside ${setup.host}, so the hidden word is ${setup.word}.`,
    timeTargetSeconds: 35,
  })
}

function buildPairDistractors(answer: string, nextPair: string): string[] {
  const distractors: string[] = []
  const bumpCandidates = [1, -1, 2, -2, 3, 4, 5]
  for (const offset of bumpCandidates) {
    const candidate = `${answer[0]}${letterAt(alphabetIndex(answer[1] ?? 'A') + offset)}`
    if (candidate !== answer && !distractors.includes(candidate)) distractors.push(candidate)
    if (distractors.length === 4) break
  }
  if (nextPair !== answer && !distractors.includes(nextPair) && distractors.length < 4) {
    distractors.push(nextPair)
  }
  while (distractors.length < 4) {
    const candidate = `${letterAt(alphabetIndex(answer[0] ?? 'A') + 1)}${
      distractors.length % 2 === 0 ? 'Z' : 'Q'
    }`
    if (candidate !== answer && !distractors.includes(candidate)) distractors.push(candidate)
  }
  return distractors
}

function pairSeriesQuestion(rng: Rng, index: number, nonce: string): Question {
  let start = rng.int(0, 14)
  let gap = rng.int(1, 3)
  let advance = rng.int(2, 4)
  let terms: string[] = []
  let answer = ''
  let distractors: string[] = []

  for (let attempt = 0; attempt < 16; attempt += 1) {
    start = rng.int(0, 14)
    gap = rng.int(1, 3)
    advance = rng.int(2, 4)
    const pairAt = (step: number): string =>
      `${letterAt(start + step * advance)}${letterAt(start + step * advance + gap)}`
    terms = [pairAt(0), pairAt(1), pairAt(2)]
    answer = pairAt(3)
    distractors = buildPairDistractors(answer, pairAt(4))
    if (isCodeSafe([...terms, answer, ...distractors].join(''))) break
  }

  return buildQuestion(rng, 'vr', makeQuestionId(nonce, 'vr', 'letter_series', index), {
    topic: 'letter_series',
    difficulty: difficultyAt(index),
    stem: `Look at this letter series.\n\n${alphabetRuler()}\n\n${terms.join(', ')}, ?\n\nWhich pair comes next?`,
    options: [answer, ...distractors],
    correctIndex: 0,
    explanation: `Inside each pair the letters jump ${gap} place${gap === 1 ? '' : 's'}. From one pair to the next, the first letter jumps ${advance} places. Carrying both rules on gives ${answer}.`,
    timeTargetSeconds: 40,
  })
}

function letterRunSeriesQuestion(rng: Rng, index: number, nonce: string): Question {
  let start = rng.int(0, 10)
  let firstGap = rng.int(1, 3)
  let positions: number[] = []
  let terms: string[] = []
  let answerPosition = start

  for (let attempt = 0; attempt < 16; attempt += 1) {
    start = rng.int(0, 10)
    firstGap = rng.int(1, 3)
    positions = [start]
    for (let i = 1; i <= 5; i += 1) {
      positions.push((positions[i - 1] ?? start) + firstGap + i - 1)
    }
    terms = positions.slice(0, 5).map((position) => letterAt(position))
    answerPosition = positions[5] ?? start
    if (isCodeSafe([...terms, letterAt(answerPosition)].join(''))) break
  }

  return buildQuestion(rng, 'vr', makeQuestionId(nonce, 'vr', 'letter_series', index), {
    topic: 'letter_series',
    difficulty: difficultyAt(index),
    stem: `Look at this letter series.\n\n${alphabetRuler()}\n\n${terms.join(', ')}, ?\n\nWhich letter comes next?`,
    options: [
      letterAt(answerPosition),
      letterAt(answerPosition + 1),
      letterAt(answerPosition - 1),
      letterAt((positions[4] ?? start) + firstGap),
      letterAt(answerPosition + 2),
    ],
    correctIndex: 0,
    explanation: `The gaps grow by one each time (${firstGap}, ${firstGap + 1}, ${firstGap + 2}, ${firstGap + 3}), so the next gap is ${firstGap + 4}. Counting on from ${terms[4]} lands on ${letterAt(answerPosition)}.`,
    timeTargetSeconds: 40,
  })
}

function letterSeriesQuestion(rng: Rng, index: number, nonce: string): Question {
  if (index % 2 === 0) return pairSeriesQuestion(rng, index, nonce)
  return letterRunSeriesQuestion(rng, index, nonce)
}

function numberSequenceQuestion(rng: Rng, index: number, nonce: string): Question {
  const kind = index % 4
  let terms: number[]
  let answer: number
  let ruleText: string

  if (kind === 0) {
    const start = rng.int(2, 15)
    const step = rng.int(2, 12)
    terms = [0, 1, 2, 3, 4].map((i) => start + i * step)
    answer = start + 5 * step
    ruleText = `Add ${step} each time`
  } else if (kind === 1) {
    const start = rng.int(2, 6)
    const mult = rng.int(2, 3)
    terms = [0, 1, 2, 3].map((i) => start * mult ** i)
    answer = start * mult ** 4
    ruleText = `Multiply by ${mult} each time`
  } else if (kind === 2) {
    const start = rng.int(1, 4)
    terms = [0, 1, 2, 3, 4].map((i) => (start + i) ** 2)
    answer = (start + 5) ** 2
    ruleText = `The square numbers carry on: ${start + 5} × ${start + 5}`
  } else {
    const start = rng.int(1, 6)
    const add = rng.int(2, 6)
    terms = [start]
    for (let i = 1; i < 5; i += 1) {
      const previous = terms[i - 1] ?? start
      terms.push(i % 2 === 1 ? previous + add : previous * 2)
    }
    answer = (terms[4] ?? start) + add
    ruleText = `Add ${add}, double, add ${add}, double — so the next step is add ${add}`
  }

  const near = [answer + 1, answer - 1, answer + 2, answer <= 3 ? answer + 5 : answer - 2]
  return buildQuestion(rng, 'vr', makeQuestionId(nonce, 'vr', 'number_sequences', index), {
    topic: 'number_sequences',
    difficulty: difficultyAt(index),
    stem: `What number comes next?\n\n${terms.join(', ')}, ?`,
    options: [answer, ...near].map(String),
    correctIndex: 0,
    explanation: `${ruleText}. Working carefully, the next term is ${answer}.`,
    timeTargetSeconds: 40,
  })
}

function synonymAntonymQuestion(rng: Rng, index: number, nonce: string): Question {
  const entry = rng.pick(SYNONYM_ENTRIES)
  const others = rng
    .shuffle(SYNONYM_ENTRIES.filter((item) => item.word !== entry.word))
    .slice(0, 3)
    .map((item) => (index % 2 === 0 ? item.synonym : item.antonym))
  const askingSynonym = index % 2 === 0
  return buildQuestion(rng, 'vr', makeQuestionId(nonce, 'vr', 'synonyms_antonyms', index), {
    topic: 'synonyms_antonyms',
    difficulty: difficultyAt(index),
    stem: askingSynonym
      ? `Which word means the same as "${entry.word}"?`
      : `Which word means the opposite of "${entry.word}"?`,
    options: [
      askingSynonym ? entry.synonym : entry.antonym,
      askingSynonym ? entry.antonym : entry.synonym,
      ...others,
    ],
    correctIndex: 0,
    explanation: askingSynonym
      ? `A synonym has the same meaning: "${entry.word}" and "${entry.synonym}" mean the same. "${entry.antonym}" is the opposite.`
      : `An antonym has the opposite meaning: "${entry.antonym}" is the opposite of "${entry.word}". "${entry.synonym}" would be a synonym instead.`,
    timeTargetSeconds: 30,
  })
}

function letterNumberQuestion(rng: Rng, index: number, nonce: string): Question {
  if (index % 2 === 0) {
    const pool = rng.shuffle(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    const letters = pool.slice(0, 4)
    const isVowel = (ch: string | undefined): boolean => ch === 'A' || ch === 'E'
    if (!letters.slice(0, 3).some(isVowel)) {
      const spareVowel = pool.find((ch) => isVowel(ch) && !letters.includes(ch))
      if (spareVowel) letters[2] = spareVowel
    }
    const [l1, l2, l3, l4] = [
      letters[0] ?? 'A',
      letters[1] ?? 'B',
      letters[2] ?? 'C',
      letters[3] ?? 'D',
    ]
    const digits = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4)
    const [v1, v2, v3, v4] = [digits[0] ?? 1, digits[1] ?? 2, digits[2] ?? 3, digits[3] ?? 4]
    const word = `${l1}${l2}${l3}`
    const value = Number(`${v1}${v2}${v3}`)
    return buildQuestion(rng, 'vr', makeQuestionId(nonce, 'vr', 'letter_number_algebra', index), {
      topic: 'letter_number_algebra',
      difficulty: difficultyAt(index),
      stem: `Each letter stands for a digit.\n\n${l1} = ${v1}, ${l2} = ${v2}, ${l3} = ${v3}, ${l4} = ${v4}\n\nWhat is the value of ${word} when the digits are written together?`,
      options: [
        String(value),
        String(v1 + v2 + v3),
        String(Number(`${v2}${v1}${v3}`)),
        String(Number(`${v3}${v2}${v1}`)),
        String(value + 1),
      ],
      correctIndex: 0,
      explanation: `${l1} is ${v1}, ${l2} is ${v2} and ${l3} is ${v3}. Written together in order they make ${value}. Adding the digits (${v1 + v2 + v3}) is a different question — always check whether to join or add.`,
      timeTargetSeconds: 45,
    })
  }

  const word = rng.pick(['CAT', 'DOG', 'HEN', 'FOX', 'OWL', 'BAT'])
  const positions = word.split('').map((ch) => alphabetIndex(ch) + 1)
  const total = positions.reduce((sum, value) => sum + value, 0)
  return buildQuestion(rng, 'vr', makeQuestionId(nonce, 'vr', 'letter_number_algebra', index), {
    topic: 'letter_number_algebra',
    difficulty: difficultyAt(index),
    stem: `If A = 1, B = 2, C = 3 and so on, what is the total of all the letters in the word "${word}"?\n\n${alphabetRuler()}`,
    options: [total, total + 1, total - 1, total + 2, total <= 3 ? total + 10 : total - 3].map(String),
    correctIndex: 0,
    explanation: `${word
      .split('')
      .map((ch, i) => `${ch} = ${positions[i]}`)
      .join(', ')}. Adding them: ${positions.join(' + ')} = ${total}.`,
    timeTargetSeconds: 45,
  })
}

export function generateVrQuestions(nonce: string, countPerType = 10): Question[] {
  const questions: Question[] = []
  const builders: ReadonlyArray<(rng: Rng, index: number, nonce: string) => Question> = [
    letterCodeQuestion,
    moveOneLetterQuestion,
    hiddenWordQuestion,
    letterSeriesQuestion,
    numberSequenceQuestion,
    synonymAntonymQuestion,
    letterNumberQuestion,
  ]
  const seeds = ['vr-codes', 'vr-move', 'vr-hidden', 'vr-series', 'vr-numseq', 'vr-syn', 'vr-letters']
  builders.forEach((builder, builderIndex) => {
    for (let i = 0; i < countPerType; i += 1) {
      const rng = createRng(hashSeed(BASE_SEED, seeds[builderIndex] ?? 'vr', nonce, i))
      questions.push(builder(rng, i, nonce))
    }
  })
  return questions
}
