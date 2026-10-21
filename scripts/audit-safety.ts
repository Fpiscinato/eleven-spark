import type { NvrFigure, Passage, Question, Subject } from '../src/db/schemas'
import { generateQuestionBank, generateFreshBatch } from '../src/generators'
import { COMPASS_TOPICS } from '../src/generators/compassGenerator'
import {
  findUnsafeCodeFragment,
  isCodeSafe,
  validatePassage,
  validateQuestion,
} from '../src/utils/childSafetyGuard'
import { visualFigureKey } from '../src/utils/nvrFigures'

interface Violation {
  id: string
  field: string
  term: string
  context: string
}

interface IntegrityIssue {
  id: string
  reason: string
}

interface Note {
  id: string
  reason: string
}

const ODD_ONE_OUT_TOPIC = 'odd_one_out'

function checkIntegrity(question: Question, issues: IntegrityIssue[], notes: Note[]): void {
  if (question.options.length !== 5) {
    issues.push({ id: question.id, reason: `has ${question.options.length} options, expected 5` })
    return
  }
  if (question.correctIndex < 0 || question.correctIndex > 4) {
    issues.push({ id: question.id, reason: `correctIndex ${question.correctIndex} out of range 0-4` })
  }

  // KaTeX only renders when the "$" delimiters are balanced, otherwise the
  // child sees the raw markup instead of a formula.
  const mathTexts: ReadonlyArray<readonly [string, string]> = [
    ['stem', question.stem],
    ['explanation', question.explanation],
    ...question.options.map((option, index): readonly [string, string] => [`option ${index}`, option]),
  ]
  for (const [field, text] of mathTexts) {
    if ((text.match(/\$/g) ?? []).length % 2 !== 0) {
      issues.push({ id: question.id, reason: `${field} has unbalanced "$" delimiters` })
    }
  }

  const optionFigures = question.svgConfig?.optionFigures ?? []
  if (optionFigures.length > 0) {
    checkNvrOptionFigures(question, optionFigures, issues)
    return
  }

  const trimmed = question.options.map((option) => option.trim())
  trimmed.forEach((option, index) => {
    if (option.length === 0) {
      issues.push({ id: question.id, reason: `option ${index} is empty` })
    }
  })

  const groups = new Map<string, number[]>()
  trimmed.forEach((option, index) => {
    const key = option.toLowerCase()
    const bucket = groups.get(key)
    if (bucket) bucket.push(index)
    else groups.set(key, [index])
  })

  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue
    const rawForms = new Set(bucket.map((index) => trimmed[index] ?? ''))
    if (rawForms.size === 1) {
      issues.push({
        id: question.id,
        reason: `options ${bucket.join(' and ')} are identical ("${trimmed[bucket[0] ?? 0]}")`,
      })
      continue
    }
    const includesCorrect = bucket.includes(question.correctIndex)
    if (question.subject === 'english' && includesCorrect) {
      notes.push({
        id: question.id,
        reason: `options ${bucket.join(' and ')} differ only by capitalisation (deliberate distractor)`,
      })
      continue
    }
    issues.push({
      id: question.id,
      reason: `options ${bucket.join(' and ')} differ only by capitalisation ("${trimmed[bucket[0] ?? 0]}")`,
    })
  }
}

function checkNvrOptionFigures(
  question: Question,
  figures: NvrFigure[],
  issues: IntegrityIssue[],
): void {
  if (figures.length !== question.options.length) {
    issues.push({
      id: question.id,
      reason: `has ${figures.length} option figures but ${question.options.length} options`,
    })
    return
  }

  if (question.topic === ODD_ONE_OUT_TOPIC) {
    checkOddOneOut(question, figures, issues)
    return
  }

  const seen = new Map<string, number>()
  figures.forEach((figure, index) => {
    const key = visualFigureKey(figure)
    const prev = seen.get(key)
    if (prev !== undefined) {
      issues.push({
        id: question.id,
        reason: `NVR options ${prev} and ${index} look identical on the page`,
      })
    } else {
      seen.set(key, index)
    }
  })
}

function checkOddOneOut(question: Question, figures: NvrFigure[], issues: IntegrityIssue[]): void {
  const odd = figures[question.correctIndex]
  if (!odd) {
    issues.push({ id: question.id, reason: `odd one out has no figure at option ${question.correctIndex}` })
    return
  }
  const oddKey = visualFigureKey(odd)
  const others = figures.filter((_, index) => index !== question.correctIndex)
  const commonShape = others[0]?.shape
  const commonFill = others[0]?.fill ?? 'empty'

  figures.forEach((figure, index) => {
    if (index === question.correctIndex) return
    if (visualFigureKey(figure) === oddKey) {
      issues.push({
        id: question.id,
        reason: `the odd one out (option ${question.correctIndex}) is identical to option ${index}`,
      })
    }
    if (figure.shape !== commonShape || (figure.fill ?? 'empty') !== commonFill) {
      issues.push({
        id: question.id,
        reason: `the four matching figures are not alike (option ${index} differs in shape or shading)`,
      })
    }
  })
}

function checkBeaconWritten(question: Question, issues: IntegrityIssue[]): void {
  if (question.answerType === 'short_text') {
    const accepted = question.acceptedAnswers ?? []
    if (accepted.length === 0) {
      issues.push({ id: question.id, reason: 'written question has no acceptedAnswers' })
      return
    }
    const correctText = question.options[question.correctIndex]?.trim() ?? ''
    const normalised = accepted.map((entry) => entry.trim().toLowerCase())
    if (!normalised.includes(correctText.toLowerCase())) {
      issues.push({
        id: question.id,
        reason: `written question does not accept its own correct answer ("${correctText}")`,
      })
    }
    const seen = new Set<string>()
    for (const entry of accepted) {
      const key = entry.trim().toLowerCase()
      if (key.length === 0) {
        issues.push({ id: question.id, reason: 'written question has a blank accepted answer' })
        continue
      }
      if (seen.has(key)) {
        issues.push({ id: question.id, reason: `written question repeats the accepted answer "${entry}"` })
      }
      seen.add(key)
    }
  } else if (question.acceptedAnswers !== undefined) {
    issues.push({ id: question.id, reason: 'acceptedAnswers set without answerType short_text' })
  }
}

function checkCompassTopic(question: Question, issues: IntegrityIssue[]): void {
  if (question.subject !== 'compass') return
  if (!(COMPASS_TOPICS as readonly string[]).includes(question.topic)) {
    issues.push({ id: question.id, reason: `unknown compass topic "${question.topic}"` })
  }
  if (question.options.length !== 5) {
    issues.push({ id: question.id, reason: `compass question has ${question.options.length} options` })
  }
  if (question.explanation.trim().length === 0) {
    issues.push({ id: question.id, reason: 'compass question has no explanation' })
  }
}

function collectCodeFragments(text: string): string[] {
  const tokens = text.match(/[A-Z]{3,}/g) ?? []
  return tokens
}

function checkVrCodes(question: Question, issues: IntegrityIssue[]): void {
  if (question.subject !== 'vr') return

  const candidates: string[] = []
  for (const option of question.options) {
    const trimmed = option.trim()
    if (/^[A-Z]+$/.test(trimmed)) candidates.push(trimmed)
  }
  for (const token of collectCodeFragments(question.stem)) candidates.push(token)
  for (const token of collectCodeFragments(question.explanation)) candidates.push(token)

  const seriesLine = question.stem
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /,\s*\?$/.test(line))
  let seriesLetters = ''
  if (seriesLine) {
    const letters = seriesLine.replace(/[^A-Za-z?,\s]/g, '').replace(/[,\s?]/g, '')
    if (/^[A-Z]+$/.test(letters)) seriesLetters = letters
  }

  const seen = new Set<string>()
  for (const candidate of candidates) {
    const key = seriesLetters ? `${seriesLetters}|${candidate}` : candidate
    if (seen.has(key)) continue
    seen.add(key)
    const fragment = findUnsafeCodeFragment(seriesLetters ? `${seriesLetters}${candidate}` : candidate)
    if (fragment && fragment !== 'short-code') {
      issues.push({
        id: question.id,
        reason: `letter code "${candidate}" hides the blocked fragment "${fragment}"`,
      })
    }
  }
}

function auditBank(
  label: string,
  passages: Passage[],
  questions: Question[],
  violations: Violation[],
  integrity: IntegrityIssue[],
  notes: Note[],
  collected: Question[],
): void {
  for (const passage of passages) {
    const result = validatePassage(passage)
    for (const violation of result.violations) {
      violations.push({
        id: passage.id,
        field: `passage.${violation.field}`,
        term: violation.term,
        context: violation.context,
      })
    }
  }
  for (const question of questions) {
    checkIntegrity(question, integrity, notes)
    checkVrCodes(question, integrity)
    checkBeaconWritten(question, integrity)
    checkCompassTopic(question, integrity)
    const result = validateQuestion(question)
    for (const violation of result.violations) {
      violations.push({
        id: question.id,
        field: violation.field,
        term: violation.term,
        context: violation.context,
      })
    }
  }
  collected.push(...questions)
  process.stdout.write(`  ${label}: ${questions.length} questions, ${passages.length} passages\n`)
}

function main(): void {
  const violations: Violation[] = []
  const integrity: IntegrityIssue[] = []
  const notes: Note[] = []
  const allQuestions: Question[] = []
  let totalQuestions = 0
  let totalPassages = 0

  process.stdout.write('ElevenSpark - UK KS2 Child Safety & Content Audit\n')
  process.stdout.write('==================================================\n\n')
  process.stdout.write('Static bank (nonce ""):\n')
  const staticBank = generateQuestionBank('')
  auditBank('static', staticBank.passages, staticBank.questions, violations, integrity, notes, allQuestions)
  totalQuestions += staticBank.questions.length
  totalPassages += staticBank.passages.length

  const ITERATIONS = 1000
  process.stdout.write(`\nDynamic generators (${ITERATIONS} iterations):\n`)
  for (let i = 0; i < ITERATIONS; i += 1) {
    const bank = generateFreshBatch(60)
    auditBank(`run ${i + 1}`, bank.passages, bank.questions, violations, integrity, notes, allQuestions)
    totalQuestions += bank.questions.length
    totalPassages += bank.passages.length
  }

  process.stdout.write('\nSafety spot-checks (must be false):\n')
  for (const code of ['FUCK', 'SEX', 'DIE', 'ASS', 'WAR', 'SHIT', 'PENIS', 'DRUG']) {
    process.stdout.write(`  isCodeSafe("${code}") = ${isCodeSafe(code)}\n`)
  }

  const bySubject = new Map<Subject, number>()
  for (const question of allQuestions) {
    bySubject.set(question.subject, (bySubject.get(question.subject) ?? 0) + 1)
  }
  process.stdout.write('\nQuestions per subject:\n')
  for (const [subject, count] of [...bySubject.entries()].sort()) {
    process.stdout.write(`  ${subject.padEnd(9)} ${count}\n`)
  }
  const compassQuestions = allQuestions.filter((question) => question.subject === 'compass')
  const compassByTopic = new Map<string, number>()
  for (const question of compassQuestions) {
    compassByTopic.set(question.topic, (compassByTopic.get(question.topic) ?? 0) + 1)
  }
  process.stdout.write('\nCompass questions per topic:\n')
  for (const [topic, count] of [...compassByTopic.entries()].sort()) {
    process.stdout.write(`  ${topic.padEnd(24)} ${count}\n`)
  }

  process.stdout.write('\n==================================================\n')
  process.stdout.write(`Questions audited: ${totalQuestions}\n`)
  process.stdout.write(`Passages audited: ${totalPassages}\n`)
  process.stdout.write(`Vocabulary violations: ${violations.length}\n`)
  process.stdout.write(`Integrity issues (shape/duplicates/empty): ${integrity.length}\n`)
  process.stdout.write(`Allowed capitalisation distractors: ${notes.length}\n`)

  if (violations.length > 0) {
    const byTerm = new Map<string, number>()
    for (const violation of violations) {
      byTerm.set(violation.term, (byTerm.get(violation.term) ?? 0) + 1)
    }
    process.stdout.write('\n--- VOCABULARY VIOLATIONS BY TERM ---\n')
    for (const [term, count] of [...byTerm.entries()].sort((a, b) => b[1] - a[1])) {
      process.stdout.write(`  ${count.toString().padStart(6)}  ${term}\n`)
    }
    process.stdout.write('\n--- FIRST 20 SAMPLES ---\n')
    for (const violation of violations.slice(0, 20)) {
      process.stdout.write(`  [${violation.term}] ${violation.id} ${violation.field}: "${violation.context}"\n`)
    }
  }

  if (integrity.length > 0) {
    const byKind = new Map<string, number>()
    const byTopic = new Map<string, number>()
    for (const issue of integrity) {
      const kind = issue.reason.replace(/\d+/g, 'N').replace(/"[^"]*"/g, 'X')
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1)
      const topic = issue.id.replace(/[0-9]+$/, '').replace(/^[a-z0-9]+-q-/, 'q-')
      byTopic.set(topic, (byTopic.get(topic) ?? 0) + 1)
    }
    process.stdout.write('\n--- INTEGRITY ISSUES BY KIND ---\n')
    for (const [kind, count] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
      process.stdout.write(`  ${count.toString().padStart(6)}  ${kind}\n`)
    }
    process.stdout.write('\n--- INTEGRITY ISSUES BY TOPIC ---\n')
    for (const [topic, count] of [...byTopic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
      process.stdout.write(`  ${count.toString().padStart(6)}  ${topic}\n`)
    }
    process.stdout.write('\n--- FIRST 20 SAMPLES ---\n')
    for (const issue of integrity.slice(0, 20)) {
      process.stdout.write(`  ${issue.id}: ${issue.reason}\n`)
    }
  }

  const ok = violations.length === 0 && integrity.length === 0
  process.stdout.write(
    `\nRESULT: ${ok ? 'PASS - child-safe and structurally valid' : 'FAIL - issues found above'}\n`,
  )
  if (!ok) process.exitCode = 1
}

main()
