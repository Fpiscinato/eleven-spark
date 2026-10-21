/**
 * Independent mathematics audit for the maths generator.
 *
 * Every maths question is re-solved from its own stem (never from the
 * generator's internal arithmetic) and compared with the option that the
 * generator marked as correct. The audit also proves that no distractor shares
 * the value of the correct answer, so a question can never have two right
 * answers.
 *
 * Run with: npx tsx scripts/audit-maths.ts [sampleSize]
 */
import { generateMathsQuestions } from '../src/generators/mathsGenerator'
import type { Question } from '../src/db/schemas'

type Quantity =
  | { kind: 'number'; value: number; unit: string }
  | { kind: 'ratio'; a: number; b: number }
  | { kind: 'expression'; a: number; b: number }
  | { kind: 'time'; minutes: number }

interface Failure {
  id: string
  reason: string
  detail: string
}

const failures: Failure[] = []
const seenTypes = new Map<string, number>()
let checked = 0

function num(value: number, unit = ''): Quantity {
  return { kind: 'number', value, unit }
}

function describe(quantity: Quantity): string {
  if (quantity.kind === 'number') return `${quantity.value}${quantity.unit}`
  if (quantity.kind === 'ratio') return `${quantity.a}:${quantity.b}`
  if (quantity.kind === 'expression') return `${quantity.a}n ${quantity.b >= 0 ? '+' : '-'} ${Math.abs(quantity.b)}`
  return `${quantity.minutes} minutes`
}

function sameQuantity(left: Quantity | null, right: Quantity | null): boolean {
  if (!left || !right) return false
  if (left.kind !== right.kind) return false
  if (left.kind === 'number' && right.kind === 'number') {
    return left.unit === right.unit && Math.abs(left.value - right.value) < 1e-9
  }
  if (left.kind === 'ratio' && right.kind === 'ratio') {
    return left.a === right.a && left.b === right.b
  }
  if (left.kind === 'expression' && right.kind === 'expression') {
    return left.a === right.a && left.b === right.b
  }
  return left.minutes === right.minutes
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}

function stripMath(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('$') && trimmed.endsWith('$')) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

/** Reads the mathematical meaning of a single option. */
function parseOption(text: string): Quantity | null {
  const trimmed = text.trim()
  const train = trimmed.match(/^The (\d{1,2}):(\d{2}) train$/)
  if (train) {
    return { kind: 'time', minutes: Number(train[1]) * 60 + Number(train[2]) }
  }
  const inner = stripMath(trimmed)
  const fraction = inner.match(/^\\frac\{(-?\d+)\}\{(-?\d+)\}$/)
  if (fraction) {
    const denominator = Number(fraction[2])
    if (denominator === 0) return null
    return num(Number(fraction[1]) / denominator)
  }
  const clock = inner.match(/^(\d{1,2}):(\d{2})$/)
  if (clock) {
    return { kind: 'time', minutes: Number(clock[1]) * 60 + Number(clock[2]) }
  }
  const ratio = inner.match(/^(-?\d+)\s*:\s*(-?\d+)$/)
  if (ratio) {
    const a = Number(ratio[1])
    const b = Number(ratio[2])
    const divisor = greatestCommonDivisor(a, b) || 1
    return { kind: 'ratio', a: a / divisor, b: b / divisor }
  }
  const expression = inner.match(/^(-?\d+)n\s*([+-])\s*(-?\d+)$/)
  if (expression) {
    const constant = Number(expression[3])
    return {
      kind: 'expression',
      a: Number(expression[1]),
      b: expression[2] === '-' ? -constant : constant,
    }
  }
  const hoursAndMinutes = inner.match(/^(\d+)\s*h\s*(\d+)\s*min$/)
  if (hoursAndMinutes) {
    return num(Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2]), 'min')
  }
  const plainMinutes = inner.match(/^(\d+)\s*min$/)
  if (plainMinutes) {
    return num(Number(plainMinutes[1]), 'min')
  }
  const currency = inner.match(/^£(-?\d+(?:\.\d+)?)(.*)$/)
  if (currency) {
    return num(Number(currency[1]), `£${(currency[2] ?? '').trim()}`)
  }
  const number = inner.match(/^(-?\d+(?:\.\d+)?)(.*)$/)
  if (number) {
    return num(Number(number[1]), (number[2] ?? '').trim())
  }
  return null
}

/**
 * Recomputes the answer of a question from its own stem.
 * Returns null when the question type is not covered by the audit.
 */
function expectedAnswer(question: Question): Quantity | null {
  const stem = question.stem

  // ---- fractions -----------------------------------------------------------
  let match = stem.match(/What is \$\\frac\{(\d+)\}\{(\d+)\}\$ of \$(\d+)\$/)
  if (match) {
    return num((Number(match[3]) * Number(match[1])) / Number(match[2]))
  }
  match = stem.match(/What is \$\\frac\{(\d+)\}\{(\d+)\}\$ of £\$(\d+)\$/)
  if (match) {
    return num((Number(match[3]) * Number(match[1])) / Number(match[2]), '£')
  }
  match = stem.match(/Work out \$\\frac\{(\d+)\}\{(\d+)\} \+ \\frac\{(\d+)\}\{(\d+)\}\$/)
  if (match) {
    const first = Number(match[2])
    const second = Number(match[4])
    const common = (first / greatestCommonDivisor(first, second)) * second
    const total = (Number(match[1]) * common) / first + (Number(match[3]) * common) / second
    return num(total / common)
  }
  match = stem.match(/A shape is divided into (\d+) equal parts\. (\d+) of the parts are shaded/)
  if (match) {
    return num(Number(match[2]) / Number(match[1]))
  }
  match = stem.match(/Simplify the fraction \$\\frac\{(\d+)\}\{(\d+)\}\$/)
  if (match) {
    return num(Number(match[1]) / Number(match[2]))
  }
  match = stem.match(/Which fraction is equivalent to \$\\frac\{(\d+)\}\{(\d+)\}\$/)
  if (match) {
    return num(Number(match[1]) / Number(match[2]))
  }
  if (stem.includes('Work out $\\frac{1}{2} + \\frac{1}{4}$')) {
    return num(0.75)
  }

  // ---- decimals and percentages -------------------------------------------
  match = stem.match(/Write \$(\d+(?:\.\d+)?)\$ as a percentage/)
  if (match) {
    return num(Number(match[1]) * 100, '%')
  }
  match = stem.match(/Write (\d+)% as a decimal/)
  if (match) {
    return num(Number(match[1]) / 100)
  }
  match = stem.match(/What is (\d+)% of £\$(\d+)\$/)
  if (match) {
    return num((Number(match[2]) * Number(match[1])) / 100, '£')
  }
  match = stem.match(/A coat costs £\$(\d+)\$\. The price is reduced by (\d+)%/)
  if (match) {
    return num((Number(match[1]) * (100 - Number(match[2]))) / 100, '£')
  }
  match = stem.match(/Work out \$(\d+(?:\.\d+)?) \\div 10\$/)
  if (match) {
    return num(Number(match[1]) / 10)
  }
  match = stem.match(/Write £\$(\d+)\.(\d+)\$ in pence/)
  if (match) {
    return num(Number(match[1]) * 100 + Number(match[2]), 'p')
  }

  // ---- ratio and proportion ------------------------------------------------
  match = stem.match(/Simplify the ratio \$(\d+) : (\d+)\$/)
  if (match) {
    const a = Number(match[1])
    const b = Number(match[2])
    const divisor = greatestCommonDivisor(a, b)
    return { kind: 'ratio', a: a / divisor, b: b / divisor }
  }
  match = stem.match(/£\$(\d+)\$ is shared between Amy and Ben in the ratio \$(\d+) : (\d+)\$/)
  if (match) {
    const total = Number(match[1])
    const a = Number(match[2])
    const b = Number(match[3])
    const who = stem.includes('does Amy receive') ? a : b
    return num((total * who) / (a + b), '£')
  }
  match = stem.match(/A cake recipe uses (\d+) g of flour for (\d+) people/)
  if (match) {
    const flour = Number(match[1])
    const people = Number(match[2])
    const peopleCounts = [...stem.matchAll(/for (\d+) people/g)].map((entry) => Number(entry[1]))
    const target = peopleCounts[peopleCounts.length - 1]
    if (target === undefined) return null
    return num((flour / people) * target, 'g')
  }
  match = stem.match(/In a bag, the ratio of red counters to blue counters is \$(\d+) : (\d+)\$/)
  if (match) {
    const red = Number(match[1])
    const blue = Number(match[2])
    const totalMatch = stem.match(/There are (\d+) counters altogether/)
    const total = totalMatch ? Number(totalMatch[1]) : red + blue
    return num((total * red) / (red + blue))
  }

  // ---- algebra and sequences -----------------------------------------------
  match = stem.match(/\$\$(\d+)x \+ (\d+) = (\d+)\$\$/)
  if (match) {
    const a = Number(match[1])
    const b = Number(match[2])
    const c = Number(match[3])
    return num((c - b) / a)
  }
  match = stem.match(/A number sequence is \$([\d, ]+)\$/)
  if (match) {
    const terms = match[1].split(',').map((entry) => Number(entry.trim()))
    const step = terms[1]! - terms[0]!
    return { kind: 'expression', a: step, b: terms[0]! - step }
  }
  match = stem.match(/A sequence has the nth term rule \$(\d+)n \+ (\d+)\$/)
  if (match) {
    const step = Number(match[1])
    const start = Number(match[2])
    const positionMatch = stem.match(/What is the (\d+)th term/)
    if (!positionMatch) return null
    return num(step * Number(positionMatch[1]) + start)
  }
  match = stem.match(/A function machine multiplies every number by (\d+) and then adds (\d+)/)
  if (match) {
    const multiply = Number(match[1])
    const add = Number(match[2])
    const inputMatch = stem.match(/What comes out when (\d+) goes in/)
    if (!inputMatch) return null
    return num(multiply * Number(inputMatch[1]) + add)
  }

  // ---- geometry ------------------------------------------------------------
  if (stem.includes('regular equilateral triangle')) return num(60, '°')
  if (stem.includes('regular square')) return num(90, '°')
  if (stem.includes('regular pentagon')) return num(108, '°')
  if (stem.includes('regular hexagon')) return num(120, '°')
  match = stem.match(/A rectangle is \$(\d+)\$ cm long and \$(\d+)\$ cm wide/)
  if (match) {
    const length = Number(match[1])
    const width = Number(match[2])
    if (stem.includes('area')) return num(length * width, 'cm²')
    return num(2 * (length + width), 'cm')
  }
  match = stem.match(/One angle on a straight line is \$(\d+)°\$/)
  if (match) {
    return num(180 - Number(match[1]), '°')
  }
  match = stem.match(/Two angles around a point are \$(\d+)°\$ and \$(\d+)°\$/)
  if (match) {
    return num(360 - Number(match[1]) - Number(match[2]), '°')
  }
  match = stem.match(/A cuboid is \$(\d+)\$ cm long, \$(\d+)\$ cm wide and \$(\d+)\$ cm high/)
  if (match) {
    return num(Number(match[1]) * Number(match[2]) * Number(match[3]), 'cm³')
  }
  match = stem.match(/A square has a perimeter of \$(\d+)\$ cm/)
  if (match) {
    const side = Number(match[1]) / 4
    return num(side * side, 'cm²')
  }
  match = stem.match(/A triangle has a base of \$(\d+)\$ cm and a height of \$(\d+)\$ cm/)
  if (match) {
    return num((Number(match[1]) * Number(match[2])) / 2, 'cm²')
  }

  // ---- timetables and speed ------------------------------------------------
  match = stem.match(/leaves Bristol at (\d{1,2}):(\d{2}) and arrives in Gloucester at (\d{1,2}):(\d{2})/)
  if (match) {
    const start = Number(match[1]) * 60 + Number(match[2])
    const end = Number(match[3]) * 60 + Number(match[4])
    return num((end - start + 1440) % 1440, 'min')
  }
  match = stem.match(/A coach leaves Cheltenham at (\d{1,2}):(\d{2})\. The journey takes/)
  if (match) {
    const start = Number(match[1]) * 60 + Number(match[2])
    const hoursMatch = /takes (\d+) h/.exec(stem)
    const minutesMatch = /(\d+) min/.exec(stem)
    const hours = hoursMatch ? Number(hoursMatch[1]) : 0
    const minutes = minutesMatch ? Number(minutesMatch[1]) : 0
    return { kind: 'time', minutes: (start + hours * 60 + minutes) % 1440 }
  }
  match = stem.match(/A car travels \$(\d+)\$ miles in \$(\d+)\$ hours?/)
  if (match) {
    return num(Number(match[1]) / Number(match[2]), 'mph')
  }
  match = stem.match(/A train travels at an average speed of \$(\d+)\$ km\/h for \$(\d+)\$ hours?/)
  if (match) {
    return num(Number(match[1]) * Number(match[2]), 'km')
  }
  if (stem.includes('Which train is the fastest journey?')) {
    const services = [...stem.matchAll(/(\d{2}:\d{2}) — (\d+) minutes/g)].map((entry) => ({
      time: entry[1]!,
      duration: Number(entry[2]),
    }))
    if (services.length === 0) return null
    const fastest = services.reduce((best, service) => (service.duration < best.duration ? service : best))
    const [hour, minute] = fastest.time.split(':')
    return { kind: 'time', minutes: Number(hour) * 60 + Number(minute) }
  }

  // ---- averages ------------------------------------------------------------
  match = stem.match(/What is the mean of these numbers\?\n\n\$([\d, ]+)\$/)
  if (match) {
    const values = match[1].split(',').map((entry) => Number(entry.trim()))
    const total = values.reduce((sum, value) => sum + value, 0)
    return num(total / values.length)
  }
  match = stem.match(/What is the median of these numbers\?\n\n\$([\d, ]+)\$/)
  if (match) {
    const values = match[1].split(',').map((entry) => Number(entry.trim())).sort((a, b) => a - b)
    const middle = Math.floor(values.length / 2)
    const median =
      values.length % 2 === 1 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2
    return num(median)
  }
  match = stem.match(/What is the mode of these numbers\?\n\n\$([\d, ]+)\$/)
  if (match) {
    const values = match[1].split(',').map((entry) => Number(entry.trim()))
    const counts = new Map<number, number>()
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
    let best = values[0]!
    let bestCount = 0
    for (const [value, count] of counts) {
      if (count > bestCount) {
        best = value
        bestCount = count
      }
    }
    return num(best)
  }
  match = stem.match(/What is the range of these numbers\?\n\n\$([\d, ]+)\$/)
  if (match) {
    const values = match[1].split(',').map((entry) => Number(entry.trim()))
    return num(Math.max(...values) - Math.min(...values))
  }
  match = stem.match(/The mean cost of (\d+) toys is £\$(\d+(?:\.\d+)?)\$/)
  if (match) {
    return num(Number(match[2]) * Number(match[1]), '£')
  }

  return null
}

/** Detects numbers that were not rounded, e.g. 0.8099999999999999. */
function hasFloatNoise(text: string): boolean {
  const match = text.match(/(\d+\.\d{5,})/)
  if (!match) return false
  const value = Number(match[1])
  return Number(value.toFixed(4)) !== value
}

/** KaTeX only renders when the "$" delimiters are balanced. */
function hasUnbalancedMath(text: string): boolean {
  return (text.match(/\$/g) ?? []).length % 2 !== 0
}

function check(question: Question, expected: Quantity, type: string): void {
  checked += 1
  seenTypes.set(type, (seenTypes.get(type) ?? 0) + 1)
  const correct = question.options[question.correctIndex] ?? ''
  const correctValue = parseOption(correct)
  if (correctValue === null) {
    failures.push({ id: question.id, reason: 'unreadable', detail: `cannot read "${correct}"` })
    return
  }
  if (!sameQuantity(correctValue, expected)) {
    failures.push({
      id: question.id,
      reason: 'wrong-answer',
      detail: `[${type}] expected ${describe(expected)} but the marked answer is "${correct}"`,
    })
    return
  }
  question.options.forEach((option, index) => {
    if (index === question.correctIndex) return
    if (sameQuantity(parseOption(option), expected)) {
      failures.push({
        id: question.id,
        reason: 'two-correct-answers',
        detail: `[${type}] "${option}" is also mathematically correct`,
      })
    }
  })
  if (question.answerType === 'short_text') {
    const accepted = question.acceptedAnswers ?? []
    const accepts = accepted.some((entry) => sameQuantity(parseOption(entry), expected))
    if (!accepts) {
      failures.push({
        id: question.id,
        reason: 'written-answer',
        detail: `[${type}] acceptedAnswers ${JSON.stringify(accepted)} reject the correct value`,
      })
    }
  }
}

const sampleCount = Number(process.argv[2] ?? 40)
let total = 0
for (let sample = 0; sample < sampleCount; sample += 1) {
  const questions = generateMathsQuestions(`audit-${sample}`, 30)
  total += questions.length
  for (const question of questions) {
    if (question.options.length !== 5) {
      failures.push({
        id: question.id,
        reason: 'shape',
        detail: `expected 5 options, found ${question.options.length}`,
      })
      continue
    }
    if (question.correctIndex < 0 || question.correctIndex > 4) {
      failures.push({
        id: question.id,
        reason: 'shape',
        detail: `correctIndex ${question.correctIndex} is out of range`,
      })
      continue
    }
    for (const option of question.options) {
      if (hasFloatNoise(option)) {
        failures.push({
          id: question.id,
          reason: 'float',
          detail: `option shows floating point noise: "${option}"`,
        })
      }
    }
    if (hasUnbalancedMath(question.explanation)) {
      failures.push({
        id: question.id,
        reason: 'katex',
        detail: `the explanation has unbalanced "$" delimiters: "${question.explanation}"`,
      })
    }
    if (hasUnbalancedMath(question.stem)) {
      failures.push({
        id: question.id,
        reason: 'katex',
        detail: `the stem has unbalanced "$" delimiters: "${question.stem}"`,
      })
    }
    const expected = expectedAnswer(question)
    if (expected === null) {
      failures.push({
        id: question.id,
        reason: 'coverage',
        detail: `no audit rule for this stem: "${question.stem.slice(0, 70)}"`,
      })
      continue
    }
    check(question, expected, question.topic)
  }
}

console.log('='.repeat(56))
console.log('MATHEMATICAL AUDIT (independent re-solve of every question)')
console.log('='.repeat(56))
console.log(`Questions checked: ${total}`)
console.log(`Question types seen: ${seenTypes.size}`)
for (const [type, count] of [...seenTypes.entries()].sort()) {
  console.log(`  ${type.padEnd(24)} ${count}`)
}
console.log('-'.repeat(56))
console.log(`Problems found: ${failures.length}`)
for (const failure of failures.slice(0, 30)) {
  console.log(`  [${failure.reason}] ${failure.id}`)
  console.log(`      ${failure.detail}`)
}
if (failures.length > 30) console.log(`  ... and ${failures.length - 30} more`)

if (failures.length > 0) {
  console.log('\nRESULT: FAIL - the maths bank is not trustworthy yet.')
  process.exit(1)
}
console.log('\nRESULT: PASS - every maths answer is correct and unique.')
