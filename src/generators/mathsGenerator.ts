import type { NvrShape, Question } from '../db/schemas'
import { buildQuestion, difficultyAt, makeQuestionId } from './common'
import { createRng, hashSeed, type Rng } from './rng'

const BASE_SEED = 20261020

interface OptionValue {
  value: number
  unit: string
}

/**
 * Reads the number and the unit of an option so two options can be compared
 * for mathematical equality ("$\frac{4}{16}$" and "$\frac{2}{8}$" are the
 * same quantity, "16 cm²" and "16 cm" are not).
 */
function optionValue(text: string): OptionValue | null {
  let trimmed = text.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('$') && trimmed.endsWith('$')) {
    trimmed = trimmed.slice(1, -1).trim()
  }
  const fraction = trimmed.match(/^\\frac\{(-?\d+)\}\{(-?\d+)\}$/)
  if (fraction) {
    const denominator = Number(fraction[2])
    if (denominator === 0) return null
    return { value: Number(fraction[1]) / denominator, unit: '' }
  }
  const number = trimmed.match(/^(-?\d+(?:\.\d+)?)(.*)$/)
  if (!number) return null
  const rest = (number[2] ?? '').trim()
  const unit = rest.startsWith('£') ? `£${rest.slice(1).trim()}` : rest
  return { value: Number(number[1]), unit }
}

/** True when both options mean exactly the same quantity. */
function sameValue(left: string, right: string): boolean {
  const a = optionValue(left)
  const b = optionValue(right)
  if (!a || !b) return left.trim() === right.trim()
  return a.unit === b.unit && Math.abs(a.value - b.value) < 1e-9
}

/** Removes the candidates that mean the same as the correct answer. */
function withoutEquivalent(correct: string, candidates: string[]): string[] {
  return candidates.filter((candidate) => !sameValue(correct, candidate))
}

function dedupedOptions(correct: string, candidates: string[]): string[] {
  const seen = new Set<string>([correct])
  const picked: string[] = []
  for (const candidate of candidates) {
    if (picked.length === 4) break
    if (candidate === '' || seen.has(candidate)) continue
    if (sameValue(correct, candidate)) continue
    seen.add(candidate)
    picked.push(candidate)
  }
  const numeric = Number(correct.replace(/[^0-9.]/g, ''))
  const prefix = correct.match(/^[^0-9.-]*/)?.[0] ?? ''
  const suffix = correct.match(/[^0-9.-]*$/)?.[0] ?? ''
  const core = correct.slice(prefix.length, correct.length - suffix.length)
  let bump = 1
  while (picked.length < 4 && bump <= 50) {
    let candidate = ''
    if (core !== '' && Number.isFinite(numeric) && Number.isFinite(Number(core))) {
      candidate = `${prefix}${numeric + bump}${suffix}`
    }
    if (candidate !== '' && !seen.has(candidate) && !sameValue(correct, candidate)) {
      seen.add(candidate)
      picked.push(candidate)
    }
    bump += 1
  }
  while (picked.length < 4) {
    const candidate = `${correct} (${bump})`
    if (!seen.has(candidate) && !sameValue(correct, candidate)) {
      seen.add(candidate)
      picked.push(candidate)
    }
    bump += 1
  }
  return [correct, ...picked]
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function simplify(numerator: number, denominator: number): string {
  const divisor = gcd(numerator, denominator) || 1
  const n = numerator / divisor
  const d = denominator / divisor
  return d === 1 ? String(n) : `$\\frac{${n}}{${d}}$`
}

/** Rounds a value to a given number of decimals without float noise. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function fractionOfQuestion(rng: Rng, index: number, nonce: string): Question {
  const denominators = [2, 3, 4, 5, 6, 8, 10]
  const denominator = rng.pick(denominators)
  const numerator = rng.int(1, denominator - 1)
  const amount = denominator * rng.int(2, 12)
  const answer = (amount / denominator) * numerator
  const alternate = (amount / denominator) * (denominator - numerator)
  const near = [
    answer + denominator,
    answer > denominator ? answer - denominator : answer + 2,
    alternate === answer ? answer + 2 * denominator : alternate,
    answer === 1 ? 9 : answer - 1,
  ]
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'fractions', index), {
    topic: 'fractions',
    difficulty: difficultyAt(index),
    stem: `What is $\\frac{${numerator}}{${denominator}}$ of $${amount}$?`,
    options: dedupedOptions(String(answer), withoutEquivalent(String(answer), near.map(String))),
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: [String(answer)],
    explanation: `"Of" means multiply. First divide $${amount}$ into ${denominator} equal parts: $${amount} \\div ${denominator} = ${amount / denominator}$. Then take ${numerator} of those parts: $${amount / denominator} \\times ${numerator} = ${answer}$.`,
    timeTargetSeconds: 45,
  })
}

function fractionAddQuestion(rng: Rng, index: number, nonce: string): Question {
  const denominator = rng.pick([5, 6, 8, 10, 12])
  const a = rng.int(1, denominator - 2)
  const b = rng.int(1, denominator - a)
  const answer = simplify(a + b, denominator)
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'fractions', index), {
    topic: 'fractions',
    difficulty: difficultyAt(index) === 1 ? 2 : difficultyAt(index),
    stem: `Work out $\\frac{${a}}{${denominator}} + \\frac{${b}}{${denominator}}$. Give your answer in its simplest form.`,
    options: dedupedOptions(
      answer,
      withoutEquivalent(answer, [
        simplify(a + b + 1, denominator),
        simplify(a * b, denominator),
        simplify(denominator, a + b),
        simplify(a + b - 1 > 0 ? a + b - 1 : a + b + 2, denominator),
        simplify(a + b + 2, denominator),
      ]),
    ),
    correctIndex: 0,
    explanation: `The denominators already match, so add the numerators: $${a} + ${b} = ${a + b}$, giving $\\frac{${a + b}}{${denominator}}$. Simplifying by dividing top and bottom by ${gcd(a + b, denominator) || 1} gives ${answer.replace(/\$/g, '')}.`,
    timeTargetSeconds: 50,
  })
}

function shadedFractionQuestion(rng: Rng, index: number, nonce: string): Question {
  const denominator = rng.pick([4, 5, 6, 8])
  const shaded = rng.int(1, denominator - 1)
  const answer = simplify(shaded, denominator)
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'fractions', index), {
    topic: 'fractions',
    difficulty: difficultyAt(index),
    stem: `A shape is divided into ${denominator} equal parts. ${shaded} of the parts are shaded.\n\nWhat fraction of the shape is shaded?`,
    options: dedupedOptions(
      answer,
      withoutEquivalent(answer, [
        simplify(denominator - shaded, denominator),
        simplify(shaded, denominator - shaded),
        simplify(denominator, shaded),
        `$\\frac{${shaded + 1}}{${denominator}}$`,
        `$\\frac{${shaded}}{${denominator + 1}}$`,
      ]),
    ),
    correctIndex: 0,
    explanation: `There are ${denominator} equal parts altogether and ${shaded} are shaded, so the fraction is $\\frac{${shaded}}{${denominator}}$, which simplifies to ${answer.replace(/\$/g, '')}.`,
    timeTargetSeconds: 40,
  })
}

function simplifyFractionQuestion(rng: Rng, index: number, nonce: string): Question {
  const pairs: ReadonlyArray<readonly [number, number]> = [
    [8, 12],
    [9, 12],
    [10, 15],
    [12, 16],
    [14, 21],
    [15, 20],
    [16, 24],
    [18, 24],
  ]
  const [numerator, denominator] = rng.pick(pairs)
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'fractions', index), {
    topic: 'fractions',
    difficulty: 1,
    stem: `Simplify the fraction $\\frac{${numerator}}{${denominator}}$.`,
    options: dedupedOptions(simplify(numerator, denominator), [
      `$\\frac{${numerator + 1}}{${denominator + 1}}$`,
      `$\\frac{${denominator}}{${numerator}}$`,
      `$\\frac{${numerator}}{${denominator * 2}}$`,
      `$\\frac{${numerator - 1 > 0 ? numerator - 1 : 1}}{${denominator}}$`,
      `$\\frac{${numerator + 1}}{${denominator}}$`,
    ]),
    correctIndex: 0,
    explanation: `Both numbers divide by ${gcd(numerator, denominator)}. $${numerator} \\div ${gcd(numerator, denominator)} = ${numerator / gcd(numerator, denominator)}$ and $${denominator} \\div ${gcd(numerator, denominator)} = ${denominator / gcd(numerator, denominator)}$, so the fraction is ${simplify(numerator, denominator).replace(/\$/g, '')}.`,
    timeTargetSeconds: 35,
  })
}

function moneyFractionQuestion(rng: Rng, index: number, nonce: string): Question {
  const amount = rng.int(2, 15) * 5
  const denominator = rng.pick([2, 4, 5])
  const numerator = rng.int(1, denominator - 1)
  const pence = (amount * 100 * numerator) / denominator
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'fractions', index), {
    topic: 'fractions',
    difficulty: 2,
    stem: `What is $\\frac{${numerator}}{${denominator}}$ of £$${amount}$?`,
    options: dedupedOptions(`£${(pence / 100).toFixed(2)}`, [
      `£${((amount * 100 - pence) / 100).toFixed(2)}`,
      `£${((amount * (numerator === 1 ? 2 : 1)) / denominator).toFixed(2)}`,
      `£${((amount * numerator) / 1000).toFixed(2)}`,
      `£${((amount * numerator) / 100).toFixed(2)}`,
      `£${((amount * (numerator + 1)) / denominator).toFixed(2)}`,
    ]),
    correctIndex: 0,
    explanation: `£$${amount}$ is ${amount * 100} pence. A ${denominator}th of it is ${amount * 100 / denominator}p, and ${numerator} of those parts is ${pence}p — which is £${(pence / 100).toFixed(2)}.`,
    timeTargetSeconds: 50,
  })
}

function equivalentFractionQuestion(rng: Rng, index: number, nonce: string): Question {
  const pairs: ReadonlyArray<readonly [number, number]> = [
    [3, 4],
    [2, 5],
    [4, 5],
    [3, 5],
    [1, 4],
    [2, 3],
  ]
  const [n, d] = rng.pick(pairs)
  const mult = rng.int(2, 4)
  const correct = `$\\frac{${n * mult}}{${d * mult}}$`
  // Every distractor below is provably NOT equal to n/d, and the filter is a
  // second safety net so the question can never have two correct options.
  const candidates = [
    `$\\frac{${n * mult}}{${d * mult + 1}}$`,
    `$\\frac{${n * mult - 1}}{${d * mult}}$`,
    `$\\frac{${n}}{${d * mult}}$`,
    `$\\frac{${n * mult}}{${d + 1}}$`,
    `$\\frac{${n * (mult + 1)}}{${d * mult}}$`,
    `$\\frac{${n + 1}}{${d + mult}}$`,
    `$\\frac{${n * mult + 1}}{${d * mult}}$`,
  ]
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'fractions', index), {
    topic: 'fractions',
    difficulty: 2,
    stem: `Which fraction is equivalent to $\\frac{${n}}{${d}}$?`,
    options: dedupedOptions(correct, withoutEquivalent(correct, candidates)),
    correctIndex: 0,
    explanation: `Multiplying the top and bottom by ${mult} keeps the value the same: $\\frac{${n} \\times ${mult}}{${d} \\times ${mult}} = \\frac{${n * mult}}{${d * mult}}$.`,
    timeTargetSeconds: 40,
  })
}

function mixedDenominatorQuestion(rng: Rng, index: number, nonce: string): Question {
  const options = [
    ['$\\frac{3}{4}$', '3/4'],
    ['$\\frac{2}{6}$', '2/6'],
    ['$\\frac{1}{2}$', '1/2'],
    ['$\\frac{3}{6}$', '3/6'],
    ['$\\frac{2}{4}$', '2/4'],
  ] as const
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'fractions', index), {
    topic: 'fractions',
    difficulty: 3,
    stem: `Work out $\\frac{1}{2} + \\frac{1}{4}$.`,
    options: options.map(([display]) => display),
    correctIndex: 0,
    explanation: `Half is the same as $\\frac{2}{4}$, so $\\frac{2}{4} + \\frac{1}{4} = \\frac{3}{4}$. Convert to the same denominator before adding.`,
    timeTargetSeconds: 55,
  })
}

function fractionQuestion(rng: Rng, index: number, nonce: string): Question {
  const kind = index % 6
  if (kind === 0) return fractionOfQuestion(rng, index, nonce)
  if (kind === 1) return fractionAddQuestion(rng, index, nonce)
  if (kind === 2) return shadedFractionQuestion(rng, index, nonce)
  if (kind === 3) return simplifyFractionQuestion(rng, index, nonce)
  if (kind === 4) return moneyFractionQuestion(rng, index, nonce)
  if (index % 12 === 5) return mixedDenominatorQuestion(rng, index, nonce)
  return equivalentFractionQuestion(rng, index, nonce)
}

function percentageConvertQuestion(rng: Rng, index: number, nonce: string): Question {
  const toPercentage = index % 2 === 0
  const value = rng.pick([0.25, 0.4, 0.45, 0.6, 0.65, 0.75, 0.8, 0.95])
  const percent = value * 100
  if (toPercentage) {
    return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'decimals_percentages', index), {
      topic: 'decimals_percentages',
      difficulty: 1,
      stem: `Write $${value}$ as a percentage.`,
      options: [`${percent}%`, `${percent / 10}%`, `${percent * 10}%`, `${percent + 5}%`, `${value}%`],
      correctIndex: 0,
      explanation: `A decimal is already "out of one hundred" once you multiply by 100: $${value} \\times 100 = ${percent}$, so the answer is ${percent}%.`,
      timeTargetSeconds: 35,
    })
  }
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'decimals_percentages', index), {
    topic: 'decimals_percentages',
    difficulty: 1,
    stem: `Write ${percent}% as a decimal.`,
    options: dedupedOptions(`$${value}$`, [
      `$${percent / 1000}$`,
      `$${(percent / 10).toFixed(1)}$`,
      `$${value * 100}$`,
      `$${(value + 0.05).toFixed(2)}$`,
      `$${(value - 0.1).toFixed(2)}$`,
    ]),
    correctIndex: 0,
    explanation: `Percent means out of 100, so divide by 100: ${percent} $\\div$ 100 = $${value}$.`,
    timeTargetSeconds: 35,
  })
}

function percentageOfMoneyQuestion(rng: Rng, index: number, nonce: string): Question {
  const percent = rng.pick([10, 20, 25, 50, 15, 75])
  const amount = rng.int(2, 20) * 4
  const pence = (amount * 100 * percent) / 100
  const answer = `£${(pence / 100).toFixed(2)}`
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'decimals_percentages', index), {
    topic: 'decimals_percentages',
    difficulty: percent === 15 ? 3 : 2,
    stem: `What is ${percent}% of £$${amount}$?`,
    options: dedupedOptions(answer, [
      `£${((amount * (percent / 2)) / 100).toFixed(2)}`,
      `£${((amount * (percent + 10)) / 100).toFixed(2)}`,
      `£${(amount / (100 / percent === 10 ? 20 : 10)).toFixed(2)}`,
      `£${((amount * (100 - percent)) / 100).toFixed(2)}`,
      `£${((amount * (percent - 5)) / 100).toFixed(2)}`,
    ]),
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: [answer, (pence / 100).toFixed(2), String(pence / 100)],
    explanation: percent === 15
      ? `10% of £$${amount}$ is £${(amount / 10).toFixed(2)} and 5% is half of that (£${(amount / 20).toFixed(2)}). Adding them gives ${answer}.`
      : `${percent}% means ${percent} out of every £100. £$${amount} \\times ${percent / 100} = ${answer}$.`,
    timeTargetSeconds: 45,
  })
}

function discountQuestion(rng: Rng, index: number, nonce: string): Question {
  const percent = rng.pick([10, 20, 25, 50])
  const original = rng.int(2, 15) * 10
  const reduced = roundTo((original * (100 - percent)) / 100, 2)
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'decimals_percentages', index), {
    topic: 'decimals_percentages',
    difficulty: 3,
    stem: `A coat costs £$${original}$. The price is reduced by ${percent}%.\n\nWhat is the new price?`,
    options: dedupedOptions(`£${reduced.toFixed(2)}`, [
      `£${(original - percent).toFixed(2)}`,
      `£${roundTo((original * percent) / 100, 2).toFixed(2)}`,
      `£${roundTo(original + (original * percent) / 100, 2).toFixed(2)}`,
      `£${original.toFixed(2)}`,
      `£${roundTo(reduced - 5, 2).toFixed(2)}`,
    ]),
    correctIndex: 0,
    explanation: `${percent}% of £$${original}$ is £${roundTo((original * percent) / 100, 2).toFixed(2)}. Subtract the reduction: £$${original}$ − £${roundTo((original * percent) / 100, 2).toFixed(2)} = £${reduced.toFixed(2)}.`,
    timeTargetSeconds: 55,
  })
}

function decimalDivisionQuestion(rng: Rng, index: number, nonce: string): Question {
  const value = rng.pick([3.6, 4.8, 5.4, 7.2, 8.1, 6.3])
  const answer = roundTo(value / 10, 2)
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'decimals_percentages', index), {
    topic: 'decimals_percentages',
    difficulty: 1,
    stem: `Work out $${value} \\div 10$.`,
    options: [
      `$${answer}$`,
      `$${roundTo(value * 10, 2)}$`,
      `$${roundTo(value + 10, 2)}$`,
      `$${roundTo(value / 100, 3)}$`,
      `$${roundTo(value - 10 < 0 ? Math.abs(value - 10) : value - 10, 2)}$`,
    ],
    correctIndex: 0,
    explanation: `Dividing by 10 moves every digit one place to the right, so the decimal point shifts once: $${value} \\div 10 = ${answer}$.`,
    timeTargetSeconds: 30,
  })
}

function penceMoneyQuestion(rng: Rng, index: number, nonce: string): Question {
  const pounds = rng.int(1, 9)
  const pencePart = rng.pick([25, 50, 75, 40, 85])
  const totalPence = pounds * 100 + pencePart
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'decimals_percentages', index), {
    topic: 'decimals_percentages',
    difficulty: 1,
    stem: `Write £$${pounds}.${String(pencePart).padStart(2, '0')}$ in pence.`,
    options: [`${totalPence}p`, `${pounds}.${pencePart}p`, `${totalPence / 10}p`, `${pounds * 100}p`, `${totalPence + 100}p`],
    correctIndex: 0,
    explanation: `£1 = 100p, so £$${pounds}$ is ${pounds * 100}p. Adding the ${pencePart}p gives ${totalPence}p.`,
    timeTargetSeconds: 30,
  })
}

function decimalsPercentagesQuestion(rng: Rng, index: number, nonce: string): Question {
  const kind = index % 5
  if (kind === 0) return percentageConvertQuestion(rng, index, nonce)
  if (kind === 1) return percentageOfMoneyQuestion(rng, index, nonce)
  if (kind === 2) return discountQuestion(rng, index, nonce)
  if (kind === 3) return decimalDivisionQuestion(rng, index, nonce)
  return penceMoneyQuestion(rng, index, nonce)
}

function simplifyRatioQuestion(rng: Rng, index: number, nonce: string): Question {
  const factor = rng.int(2, 5)
  const a = rng.int(1, 6) * factor
  let b = rng.int(1, 6) * factor
  if (b === a) b = a + factor
  const divisor = gcd(a, b)
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'ratio_proportion', index), {
    topic: 'ratio_proportion',
    difficulty: 2,
    stem: `Simplify the ratio $${a} : ${b}$.`,
    options: dedupedOptions(`$${a / divisor} : ${b / divisor}$`, [
      `$${a} : ${b + divisor}$`,
      `$${a + divisor} : ${b}$`,
      `$${b / divisor} : ${a / divisor}$`,
      `$${(a / divisor) * 2} : ${b / divisor}$`,
      `$${a / divisor} : ${(b / divisor) * 2}$`,
    ]),
    correctIndex: 0,
    explanation: `Both numbers divide by ${divisor}: $${a} \\div ${divisor} = ${a / divisor}$ and $${b} \\div ${divisor} = ${b / divisor}$. The simplest form is $${a / divisor} : ${b / divisor}$.`,
    timeTargetSeconds: 40,
  })
}

function shareMoneyQuestion(rng: Rng, index: number, nonce: string): Question {
  const a = rng.int(1, 5)
  const b = rng.int(1, 5)
  const parts = a + b
  const total = parts * rng.int(4, 12) * 5
  const shareA = (total * a) / parts
  const shareB = total - shareA
  const askA = index % 2 === 0
  const targetShare = askA ? shareA : shareB
  const otherShare = askA ? shareB : shareA
  const onePart = total / parts
  const distractors: number[] = []
  for (const candidate of [otherShare, onePart, onePart * (parts + 1), otherShare - onePart]) {
    if (Number.isInteger(candidate) && candidate > 0 && candidate !== targetShare && !distractors.includes(candidate)) {
      distractors.push(candidate)
    }
  }
  let bump = 1
  while (distractors.length < 4) {
    const candidate = targetShare + bump * onePart
    if (!distractors.includes(candidate)) distractors.push(candidate)
    bump += 1
  }
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'ratio_proportion', index), {
    topic: 'ratio_proportion',
    difficulty: 3,
    stem: `£$${total}$ is shared between Amy and Ben in the ratio $${a} : ${b}$.\n\nHow much does ${askA ? 'Amy' : 'Ben'} receive?`,
    options: [`£${targetShare}`, ...distractors.map((value) => `£${value}`)],
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: [`£${targetShare}`, String(targetShare)],
    explanation: `There are ${parts} parts in total, so one part is £${total / parts}. ${askA ? `Amy gets ${a} parts: £${total / parts} × ${a} = £${shareA}` : `Ben gets ${b} parts: £${total / parts} × ${b} = £${shareB}`}.`,
    timeTargetSeconds: 55,
  })
}

function recipeQuestion(rng: Rng, index: number, nonce: string): Question {
  const basePeople = rng.pick([4, 5, 8])
  const scaledPeople = basePeople * rng.pick([2, 3])
  const baseAmount = rng.pick([200, 300, 400, 250])
  const answer = (baseAmount / basePeople) * scaledPeople
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'ratio_proportion', index), {
    topic: 'ratio_proportion',
    difficulty: 2,
    stem: `A cake recipe uses ${baseAmount} g of flour for ${basePeople} people.\n\nHow much flour is needed for ${scaledPeople} people?`,
    options: [`${answer} g`, `${baseAmount} g`, `${answer + 100} g`, `${answer + baseAmount} g`, `${answer - 50} g`],
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: [`${answer} g`, String(answer), `${answer} grams`],
    explanation: `For one person you need $${baseAmount} \\div ${basePeople} = ${baseAmount / basePeople}$ g. For ${scaledPeople} people: $${baseAmount / basePeople} \\times ${scaledPeople} = ${answer}$ g.`,
    timeTargetSeconds: 45,
  })
}

function counterRatioQuestion(rng: Rng, index: number, nonce: string): Question {
  const red = rng.int(1, 4)
  const blue = rng.int(2, 5)
  const total = (red + blue) * rng.int(2, 5)
  const redCount = (total * red) / (red + blue)
  const onePart = total / (red + blue)
  const distractors: number[] = []
  for (const candidate of [total - redCount, red, redCount + (red + blue), onePart, redCount + red]) {
    if (distractors.length === 4) break
    if (candidate !== redCount && !distractors.includes(candidate)) distractors.push(candidate)
  }
  let bump = 1
  while (distractors.length < 4) {
    const candidate = redCount + bump
    if (!distractors.includes(candidate)) distractors.push(candidate)
    bump += 1
  }
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'ratio_proportion', index), {
    topic: 'ratio_proportion',
    difficulty: 2,
    stem: `In a bag, the ratio of red counters to blue counters is $${red} : ${blue}$. There are ${total} counters altogether.\n\nHow many red counters are in the bag?`,
    options: [String(redCount), ...distractors.map(String)],
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: [String(redCount)],
    explanation: `There are ${red + blue} parts, so one part is $${total} \\div ${red + blue} = ${total / (red + blue)}$. Red has ${red} parts: ${total / (red + blue)} × ${red} = ${redCount}.`,
    timeTargetSeconds: 50,
  })
}

function ratioQuestion(rng: Rng, index: number, nonce: string): Question {
  const kind = index % 4
  if (kind === 0) return simplifyRatioQuestion(rng, index, nonce)
  if (kind === 1) return shareMoneyQuestion(rng, index, nonce)
  if (kind === 2) return recipeQuestion(rng, index, nonce)
  return counterRatioQuestion(rng, index, nonce)
}

function equationQuestion(rng: Rng, index: number, nonce: string): Question {
  const a = rng.int(2, 9)
  const b = rng.int(2, 15)
  const x = rng.int(2, 9)
  const result = a * x + b
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'algebra_sequences', index), {
    topic: 'algebra_sequences',
    difficulty: difficultyAt(index) === 1 ? 2 : difficultyAt(index),
    stem: `Work out the value of $x$.\n\n$$${a}x + ${b} = ${result}$$`,
    options: dedupedOptions(String(x), [String(x + 1), String(x - 1), String(a * x), String(result - a), String(x + 2)]),
    correctIndex: 0,
    explanation: `Subtract ${b} from both sides: $${a}x = ${a * x}$. Then divide both sides by ${a}: $x = ${x}$. Check it works: $${a} \\times ${x} + ${b} = ${result}$.`,
    timeTargetSeconds: 50,
  })
}

function nthTermQuestion(rng: Rng, index: number, nonce: string): Question {
  const step = rng.int(2, 7)
  const start = rng.int(1, 12)
  const terms = [0, 1, 2, 3].map((i) => start + i * step)
  const adjust = start - step
  const signed = (value: number): string => (value < 0 ? `- ${Math.abs(value)}` : `+ ${value}`)
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'algebra_sequences', index), {
    topic: 'algebra_sequences',
    difficulty: 2,
    stem: `A number sequence is $${terms.join(', ')}$.\n\nWhat is the nth term rule?`,
    options: dedupedOptions(`$${step}n ${signed(adjust)}$`, [
      `$${step}n ${signed(start)}$`,
      `$${start}n ${signed(step)}$`,
      `$${step}n ${signed(-start)}$`,
      `$${step + 1}n ${signed(adjust - 1)}$`,
      `$${step + 2}n ${signed(adjust - 2)}$`,
    ]),
    correctIndex: 0,
    explanation: `The terms go up by ${step} each time, so the rule starts with ${step}n. The first term of ${step}n would be ${step}, but we need ${start}, so we adjust by ${Math.abs(adjust)}: the rule is ${step}n ${signed(adjust)}.`,
    timeTargetSeconds: 55,
  })
}

function termValueQuestion(rng: Rng, index: number, nonce: string): Question {
  const step = rng.int(2, 9)
  const start = rng.int(0, 10)
  const position = rng.int(10, 25)
  const answer = step * position + start
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'algebra_sequences', index), {
    topic: 'algebra_sequences',
    difficulty: 2,
    stem: `A sequence has the nth term rule $${step}n + ${start}$.\n\nWhat is the ${position}th term?`,
    options: dedupedOptions(String(answer), [String(answer + step), String(answer - step), String(step * (position + 1)), String(answer + start), String(answer + step * 2)]),
    correctIndex: 0,
    explanation: `Replace n with ${position}: $${step} \\times ${position} + ${start} = ${answer}$.`,
    timeTargetSeconds: 45,
  })
}

function functionMachineQuestion(rng: Rng, index: number, nonce: string): Question {
  const multiply = rng.pick([2, 3, 4, 5])
  const add = rng.int(2, 12)
  const input = rng.int(2, 10)
  const answer = multiply * input + add
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'algebra_sequences', index), {
    topic: 'algebra_sequences',
    difficulty: 1,
    stem: `A function machine multiplies every number by ${multiply} and then adds ${add}.\n\nWhat comes out when ${input} goes in?`,
    options: dedupedOptions(String(answer), [String(multiply * input + add * 2), String(answer + multiply), String(input + add), String(multiply * (input + add)), String(multiply * input + add * 2 + multiply)]),
    correctIndex: 0,
    explanation: `Multiply first: $${multiply} \\times ${input} = ${multiply * input}$. Then add ${add}: ${multiply * input} + ${add} = ${answer}. Order matters — always multiply before adding.`,
    timeTargetSeconds: 40,
  })
}

function algebraQuestion(rng: Rng, index: number, nonce: string): Question {
  const kind = index % 4
  if (kind === 0) return equationQuestion(rng, index, nonce)
  if (kind === 1) return nthTermQuestion(rng, index, nonce)
  if (kind === 2) return termValueQuestion(rng, index, nonce)
  return functionMachineQuestion(rng, index, nonce)
}

const POLYGON_SHAPES: ReadonlyArray<{ shape: NvrShape; sides: number; name: string }> = [
  { shape: 'triangle', sides: 3, name: 'equilateral triangle' },
  { shape: 'square', sides: 4, name: 'square' },
  { shape: 'pentagon', sides: 5, name: 'regular pentagon' },
  { shape: 'hexagon', sides: 6, name: 'regular hexagon' },
]

function interiorAngleQuestion(rng: Rng, index: number, nonce: string): Question {
  const polygon = rng.pick(POLYGON_SHAPES.slice(2))
  const total = (polygon.sides - 2) * 180
  const angle = total / polygon.sides
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'geometry', index), {
    topic: 'geometry',
    difficulty: 3,
    stem: `The diagram shows a regular ${polygon.name}.\n\nWhat is the size of each interior angle?`,
    options: [`${angle}°`, `${angle + 10}°`, `${angle - 10}°`, `${total}°`, `${180 - angle}°`],
    correctIndex: 0,
    explanation: `Interior angles add up to $180 \\times (${polygon.sides} - 2) = ${total}°$. A regular ${polygon.name} has ${polygon.sides} equal angles, so each one is $${total} \\div ${polygon.sides} = ${angle}°$.`,
    timeTargetSeconds: 60,
    svgConfig: {
      layout: 'sequence',
      cells: [{ shape: polygon.shape, fill: 'empty', size: 'large' }],
    },
  })
}

function areaPerimeterQuestion(rng: Rng, index: number, nonce: string): Question {
  const length = rng.int(4, 15)
  const width = rng.int(3, 12)
  const askArea = index % 2 === 0
  if (askArea) {
    const area = length * width
    return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'geometry', index), {
      topic: 'geometry',
      difficulty: 2,
      stem: `A rectangle is $${length}$ cm long and $${width}$ cm wide.\n\nWhat is its area?`,
      options: [`${area} cm²`, `${2 * (length + width)} cm`, `${area} cm`, `${length + width} cm²`, `${area + length} cm²`],
      correctIndex: 0,
      answerType: 'short_text',
      acceptedAnswers: [`${area} cm²`, String(area), `${area} cm2`],
      explanation: `Area of a rectangle is length × width: $${length} \\times ${width} = ${area}$ cm². Area always uses square units, so watch the units in the options.`,
      timeTargetSeconds: 50,
    })
  }
  const perimeter = 2 * (length + width)
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'geometry', index), {
    topic: 'geometry',
    difficulty: 1,
    stem: `A rectangle is $${length}$ cm long and $${width}$ cm wide.\n\nWhat is its perimeter?`,
    options: [`${perimeter} cm`, `${length * width} cm`, `${perimeter} cm²`, `${length * width} cm²`, `${perimeter + 2} cm`],
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: [`${perimeter} cm`, String(perimeter)],
    explanation: `Perimeter is the distance all the way around: $2 \\times (${length} + ${width}) = ${perimeter}$ cm. Perimeter uses single units, not square units.`,
    timeTargetSeconds: 45,
  })
}

function straightLineAngleQuestion(rng: Rng, index: number, nonce: string): Question {
  const known = rng.pick([30, 45, 60, 75, 105, 120, 135, 150])
  const answer = 180 - known
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'geometry', index), {
    topic: 'geometry',
    difficulty: 2,
    stem: `Angles on a straight line add up to $180°$.\n\nOne angle on a straight line is $${known}°$. What is the other angle?`,
    options: [`${answer}°`, `${known}°`, `${360 - known}°`, `${90 - (90 - answer) / 2}°`, `${answer + 10}°`],
    correctIndex: 0,
    explanation: `Angles on a straight line make $180°$, so $180 - ${known} = ${answer}°$.`,
    timeTargetSeconds: 40,
  })
}

function anglesAroundPointQuestion(rng: Rng, index: number, nonce: string): Question {
  const a = rng.int(60, 120)
  const b = rng.int(40, 90)
  if (a + b >= 180) return anglesAroundPointQuestion(rng, index, nonce)
  const answer = 360 - a - b
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'geometry', index), {
    topic: 'geometry',
    difficulty: 3,
    stem: `Angles around a point add up to $360°$.\n\nTwo angles around a point are $${a}°$ and $${b}°$. What is the third angle?`,
    options: dedupedOptions(`${answer}°`, [`${a + b}°`, `${180 - (a + b)}°`, `${answer - 90}°`, `${a - b < 5 ? answer + 15 : a - b}°`, `${answer - 45}°`]),
    correctIndex: 0,
    explanation: `All the angles around a point total $360°$: $360 - ${a} - ${b} = ${answer}°$.`,
    timeTargetSeconds: 50,
  })
}

function volumeQuestion(rng: Rng, index: number, nonce: string): Question {
  const length = rng.int(3, 10)
  const width = rng.int(2, 8)
  const height = rng.int(2, 7)
  const volume = length * width * height
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'geometry', index), {
    topic: 'geometry',
    difficulty: 3,
    stem: `A cuboid is $${length}$ cm long, $${width}$ cm wide and $${height}$ cm high.\n\nWhat is its volume?`,
    options: [`${volume} cm³`, `${2 * (length + width + height)} cm`, `${volume} cm²`, `${length * width + width * height} cm³`, `${volume + length} cm³`],
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: [`${volume} cm³`, String(volume), `${volume} cm3`],
    explanation: `Volume of a cuboid is length × width × height: $${length} \\times ${width} \\times ${height} = ${volume}$ cm³. Volume uses cubic units.`,
    timeTargetSeconds: 55,
  })
}

function squareFromPerimeterQuestion(rng: Rng, index: number, nonce: string): Question {
  const side = rng.int(4, 15)
  const perimeter = side * 4
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'geometry', index), {
    topic: 'geometry',
    difficulty: 3,
    stem: `A square has a perimeter of $${perimeter}$ cm.\n\nWhat is its area?`,
    options: dedupedOptions(`${side * side} cm²`, [`${perimeter} cm²`, `${side} cm²`, `${perimeter * perimeter} cm²`, `${side * side + side} cm²`, `${side * side + perimeter} cm²`]),
    correctIndex: 0,
    explanation: `A square has 4 equal sides, so each side is $${perimeter} \\div 4 = ${side}$ cm. Area is $${side} \\times ${side} = ${side * side}$ cm².`,
    timeTargetSeconds: 55,
  })
}

function triangleAreaQuestion(rng: Rng, index: number, nonce: string): Question {
  const base = rng.int(4, 16) * 2
  const height = rng.int(3, 14)
  const area = (base * height) / 2
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'geometry', index), {
    topic: 'geometry',
    difficulty: 3,
    stem: `A triangle has a base of $${base}$ cm and a height of $${height}$ cm.\n\nWhat is its area?`,
    options: [`${area} cm²`, `${base * height} cm²`, `${base + height} cm²`, `${area} cm`, `${base * height * 2} cm²`],
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: [`${area} cm²`, String(area), `${area} cm2`],
    explanation: `Area of a triangle is half base × height: $\\frac{1}{2} \\times ${base} \\times ${height} = ${area}$ cm².`,
    timeTargetSeconds: 50,
  })
}

function geometryQuestion(rng: Rng, index: number, nonce: string): Question {
  const kind = index % 7
  if (kind === 0) return interiorAngleQuestion(rng, index, nonce)
  if (kind === 1) return areaPerimeterQuestion(rng, index, nonce)
  if (kind === 2) return straightLineAngleQuestion(rng, index, nonce)
  if (kind === 3) return anglesAroundPointQuestion(rng, index, nonce)
  if (kind === 4) return volumeQuestion(rng, index, nonce)
  if (kind === 5) return squareFromPerimeterQuestion(rng, index, nonce)
  return triangleAreaQuestion(rng, index, nonce)
}

function journeyDurationQuestion(rng: Rng, index: number, nonce: string): Question {
  const hour = rng.int(7, 16)
  const minute = rng.pick([0, 5, 15, 20, 25, 30, 40, 45, 50])
  const duration = rng.int(2, 9) * 5 + rng.pick([0, 5, 10, 15])
  const startTotal = hour * 60 + minute
  const endTotal = startTotal + duration
  const format = (total: number): string =>
    `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  const hours = Math.floor(duration / 60)
  const minutes = duration % 60
  const writtenAnswers = [
    `${duration} min`,
    `${duration} minutes`,
    hours > 0 ? `${hours} h ${minutes} min` : '',
    hours > 0 ? `${hours} hour${hours === 1 ? '' : 's'} ${minutes} minute${minutes === 1 ? '' : 's'}` : '',
    hours > 0 ? `${hours}h ${minutes}m` : '',
  ].filter((entry) => entry !== '')
  const hourLabel = hours === 1 ? 'hour' : 'hours'
  const minuteLabel = minutes === 1 ? 'minute' : 'minutes'
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'timetables_speed', index), {
    topic: 'timetables_speed',
    difficulty: 2,
    stem: `A train leaves Bristol at ${format(startTotal)} and arrives in Gloucester at ${format(endTotal)}.\n\nHow long does the journey take?`,
    options: dedupedOptions(
      `${hours > 0 ? `${hours} h ${minutes} min` : `${duration} min`}`,
      [`${duration + 10} min`, `${duration - 10 > 0 ? duration - 10 : 5} min`, `${duration + 30} min`, `${duration + 45} min`, `${duration + 5} min`],
    ),
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: writtenAnswers,
    explanation: `From ${format(startTotal)} to ${format(endTotal)} is ${hours} ${hourLabel} and ${minutes} ${minuteLabel} — ${duration} minutes in total.`,
    timeTargetSeconds: 60,
  })
}

function arrivalTimeQuestion(rng: Rng, index: number, nonce: string): Question {
  const hour = rng.int(6, 15)
  const minute = rng.pick([0, 10, 15, 20, 25, 30, 40, 45, 55])
  const durationHours = rng.int(0, 2)
  const durationMinutes = rng.pick([15, 20, 30, 40, 45, 50])
  const startTotal = hour * 60 + minute
  const endTotal = startTotal + durationHours * 60 + durationMinutes
  const format = (total: number): string =>
    `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'timetables_speed', index), {
    topic: 'timetables_speed',
    difficulty: 3,
    stem: `A coach leaves Cheltenham at ${format(startTotal)}. The journey takes ${
      durationHours > 0 ? `${durationHours} h ${durationMinutes} min` : `${durationMinutes} minutes`
    }.\n\nWhat time does it arrive?`,
    options: dedupedOptions(format(endTotal), [format(endTotal + 10), format(endTotal - 10), format(endTotal + 30), format(startTotal + durationMinutes), format(endTotal + 15)]),
    correctIndex: 0,
    explanation: `Add the journey time to ${format(startTotal)}: ${
      durationHours > 0 ? `${durationHours} h and ` : ''
    }${durationMinutes} minutes later it is ${format(endTotal)}.`,
    timeTargetSeconds: 60,
  })
}

function speedDistanceQuestion(rng: Rng, index: number, nonce: string): Question {
  const speed = rng.pick([40, 50, 60, 70, 80])
  const hours = rng.pick([2, 3, 4])
  const askSpeed = index % 2 === 0
  if (askSpeed) {
    const distance = speed * hours
    return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'timetables_speed', index), {
      topic: 'timetables_speed',
      difficulty: 2,
      stem: `A car travels $${distance}$ miles in $${hours}$ hour${hours === 1 ? '' : 's'}.\n\nWhat is its average speed?`,
      options: dedupedOptions(`${speed} mph`, [`${distance} mph`, `${speed * 2} mph`, `${distance / 2} mph`, `${speed + 10} mph`, `${speed - 5} mph`]),
      correctIndex: 0,
      explanation: `Speed = distance ÷ time: $${distance} \\div ${hours} = ${speed}$ mph.`,
      timeTargetSeconds: 50,
    })
  }
  const distance = speed * hours
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'timetables_speed', index), {
    topic: 'timetables_speed',
    difficulty: 2,
    stem: `A train travels at an average speed of $${speed}$ km/h for $${hours}$ hour${hours === 1 ? '' : 's'}.\n\nHow far does it travel?`,
    options: dedupedOptions(`${distance} km`, [`${speed} km`, `${speed * (hours + 1)} km`, `${distance / 2} km`, `${distance + speed} km`, `${distance + 10} km`]),
    correctIndex: 0,
    explanation: `Distance = speed × time: $${speed} \\times ${hours} = ${distance}$ km.`,
    timeTargetSeconds: 50,
  })
}

function timetableChoiceQuestion(rng: Rng, index: number, nonce: string): Question {
  const services = [
    { name: '07:35', duration: 55 },
    { name: '08:10', duration: 40 },
    { name: '09:05', duration: 65 },
    { name: '10:20', duration: 45 },
    { name: '11:15', duration: 75 },
  ]
  const fastest = services.reduce((best, service) => (service.duration < best.duration ? service : best))
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'timetables_speed', index), {
    topic: 'timetables_speed',
    difficulty: 3,
    stem: `Five trains run from Gloucester to Cardiff:\n\n${services
      .map((service) => `${service.name} — ${service.duration} minutes`)
      .join('\n')}\n\nWhich train is the fastest journey?`,
    options: services.map((service) => `The ${service.name} train`),
    correctIndex: services.indexOf(fastest),
    explanation: `Compare the journey times, not the departure times. The ${fastest.name} train takes only ${fastest.duration} minutes, which is the shortest journey.`,
    timeTargetSeconds: 55,
  })
}

function timetableQuestion(rng: Rng, index: number, nonce: string): Question {
  const kind = index % 4
  if (kind === 0) return journeyDurationQuestion(rng, index, nonce)
  if (kind === 1) return arrivalTimeQuestion(rng, index, nonce)
  if (kind === 2) return speedDistanceQuestion(rng, index, nonce)
  return timetableChoiceQuestion(rng, index, nonce)
}

function meanQuestion(rng: Rng, index: number, nonce: string): Question {
  const count = rng.pick([4, 5])
  const mean = rng.int(4, 20)
  const numbers: number[] = []
  let running = 0
  for (let i = 0; i < count - 1; i += 1) {
    const value = mean + rng.int(-3, 3)
    numbers.push(value)
    running += value
  }
  const last = mean * count - running
  numbers.push(last)
  const ordered = [...numbers].sort((a, b) => a - b)
  if (ordered[0] === last && last < 1) {
    return meanQuestion(rng, index, nonce)
  }
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'averages', index), {
    topic: 'averages',
    difficulty: difficultyAt(index) === 1 ? 2 : difficultyAt(index),
    stem: `What is the mean of these numbers?\n\n$${ordered.join(', ')}$`,
    options: [String(mean), String(mean + 1), String(mean - 1), String(mean + 2), String(mean + 3)],
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: [String(mean)],
    explanation: `Add them all: $${ordered.join(' + ')} = ${mean * count}$. Then divide by how many numbers there are: $${mean * count} \\div ${count} = ${mean}$.`,
    timeTargetSeconds: 55,
  })
}

function medianQuestion(rng: Rng, index: number, nonce: string): Question {
  const odd = index % 2 === 0
  const base = rng.int(2, 12)
  const values = odd
    ? [base, base + 3, base + 7, base + 4, base + 1]
    : [base, base + 4, base + 2, base + 8]
  const ordered = [...values].sort((a, b) => a - b)
  const median = odd
    ? ordered[2] ?? base
    : ((ordered[1] ?? base) + (ordered[2] ?? base)) / 2
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'averages', index), {
    topic: 'averages',
    difficulty: 3,
    stem: `What is the median of these numbers?\n\n$${values.join(', ')}$`,
    options: [String(median), String(ordered[0] ?? base), String(ordered[ordered.length - 1] ?? base), String(median + 1), String((ordered[0] ?? base) + (ordered[ordered.length - 1] ?? base))],
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: [String(median)],
    explanation: `First put them in order: $${ordered.join(', ')}$. ${
      odd
        ? `With 5 numbers, the middle one (3rd) is ${median}.`
        : `With 4 numbers, average the two middle values: $(${ordered[1]} + ${ordered[2]}) \\div 2 = ${median}$.`
    }`,
    timeTargetSeconds: 50,
  })
}

function modeQuestion(rng: Rng, index: number, nonce: string): Question {
  const mode = rng.int(2, 9)
  let other = rng.int(1, 4)
  while (other === mode || other + 5 === mode) other = rng.int(1, 4)
  const values = rng.shuffle([mode, mode, mode, other, other + 3, other + 5])
  const distractors: number[] = []
  for (const candidate of [other, other + 5, mode + 2, mode - 1 < 1 ? 20 : mode - 1, mode + 3]) {
    if (distractors.length === 4) break
    if (candidate !== mode && !distractors.includes(candidate)) distractors.push(candidate)
  }
  let bump = 1
  while (distractors.length < 4) {
    const candidate = mode + bump + 1
    if (!distractors.includes(candidate)) distractors.push(candidate)
    bump += 1
  }
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'averages', index), {
    topic: 'averages',
    difficulty: 1,
    stem: `What is the mode of these numbers?\n\n$${values.join(', ')}$`,
    options: [String(mode), ...distractors.map(String)],
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: [String(mode)],
    explanation: `The mode is the value that appears most often. ${mode} appears ${values.filter((v) => v === mode).length} times — more than any other number.`,
    timeTargetSeconds: 40,
  })
}

function rangeQuestion(rng: Rng, index: number, nonce: string): Question {
  const smallest = rng.int(1, 20)
  const biggest = smallest + rng.int(6, 30)
  const middle = rng.int(smallest + 1, biggest - 1)
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'averages', index), {
    topic: 'averages',
    difficulty: 1,
    stem: `What is the range of these numbers?\n\n$${smallest}, ${middle}, ${biggest}$`,
    options: [String(biggest - smallest), String(biggest), String(smallest), String(biggest + smallest), String(biggest - middle)],
    correctIndex: 0,
    answerType: 'short_text',
    acceptedAnswers: [String(biggest - smallest)],
    explanation: `Range = biggest − smallest: $${biggest} - ${smallest} = ${biggest - smallest}$.`,
    timeTargetSeconds: 35,
  })
}

function meanMoneyQuestion(rng: Rng, index: number, nonce: string): Question {
  const mean = rng.int(12, 40) * 5
  const count = 5
  const total = mean * count
  return buildQuestion(rng, 'maths', makeQuestionId(nonce, 'maths', 'averages', index), {
    topic: 'averages',
    difficulty: 3,
    stem: `The mean cost of ${count} toys is £$${(mean / 100).toFixed(2)}$.\n\nWhat do the ${count} toys cost altogether?`,
    options: dedupedOptions(`£${(total / 100).toFixed(2)}`, [
      `£${(mean / 100).toFixed(2)}`,
      `£${((total / 100) * 2).toFixed(2)}`,
      `£${((total + mean) / 100).toFixed(2)}`,
      `£${((total + 100) / 100).toFixed(2)}`,
      `£${((total - mean) / 100).toFixed(2)}`,
    ]),
    correctIndex: 0,
    explanation: `Mean = total ÷ count, so total = mean × count: $${(mean / 100).toFixed(2)} \\times ${count} = ${(total / 100).toFixed(2)}$.`,
    timeTargetSeconds: 50,
  })
}

function averagesQuestion(rng: Rng, index: number, nonce: string): Question {
  const kind = index % 5
  if (kind === 0) return meanQuestion(rng, index, nonce)
  if (kind === 1) return medianQuestion(rng, index, nonce)
  if (kind === 2) return modeQuestion(rng, index, nonce)
  if (kind === 3) return rangeQuestion(rng, index, nonce)
  return meanMoneyQuestion(rng, index, nonce)
}

export function generateMathsQuestions(nonce: string, countPerType = 10): Question[] {
  const questions: Question[] = []
  const builders: ReadonlyArray<(rng: Rng, index: number, nonce: string) => Question> = [
    fractionQuestion,
    decimalsPercentagesQuestion,
    ratioQuestion,
    algebraQuestion,
    geometryQuestion,
    timetableQuestion,
    averagesQuestion,
  ]
  const seeds = [
    'maths-frac',
    'maths-dec',
    'maths-ratio',
    'maths-alg',
    'maths-geom',
    'maths-time',
    'maths-avg',
  ]
  builders.forEach((builder, builderIndex) => {
    for (let i = 0; i < countPerType; i += 1) {
      const rng = createRng(hashSeed(BASE_SEED, seeds[builderIndex] ?? 'maths', nonce, i))
      questions.push(builder(rng, i, nonce))
    }
  })
  return questions
}
