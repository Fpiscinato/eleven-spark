import { generateQuestionBank } from '../src/generators'
import { COMPASS_TOPICS } from '../src/generators/compassGenerator'
import {
  CORE_SUBJECTS,
  OPTIONAL_SUBJECTS,
  isOptionalSubject,
  type Attempt,
} from '../src/db/schemas'
import {
  EXAM_CONFIGS,
  EXTRA_PRACTICE_MODES,
  FSCE_PAPER_MODES,
  OPTIONAL_BONUS_LABEL,
} from '../src/lib/exam'
import { computeRoadmap } from '../src/utils/roadmapCalculator'

/**
 * ElevenSpark - Gloucestershire FSCE Model Audit.
 *
 * It checks the model of the exam the child will actually sit:
 *
 * - The three official papers are Adventure (English + Maths, multiple
 *   choice), Beacon (written answers + creative writing) and Compass
 *   (Across the Curriculum).
 * - The Beacon paper really asks for typed answers, so no child can guess
 *   an A-E box instead of writing.
 * - The Compass paper covers the KS2 disciplines across the curriculum.
 * - NVR and VR are optional: they are labelled as a bonus and they can never
 *   raise or lower the progress of the three phases.
 */

interface Check {
  name: string
  ok: boolean
  detail: string
}

const checks: Check[] = []

function check(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail })
}

function attempt(
  id: string,
  subject: Attempt['subject'],
  isCorrect: boolean,
  sessionId = 'session-1',
): Attempt {
  return {
    id,
    profileId: 'audit',
    sessionId,
    questionId: `question-${id}`,
    subject,
    topic: 'audit',
    difficulty: 2,
    selectedIndex: isCorrect ? 0 : 1,
    isCorrect,
    timeSpentSeconds: 30,
    flagged: false,
    timestamp: 1_700_000_000_000,
  }
}

function main(): void {
  const bank = generateQuestionBank('')
  const questions = bank.questions

  // --- The three official papers ------------------------------------------------
  check(
    'The three official FSCE papers are Adventure, Beacon and Compass',
    FSCE_PAPER_MODES.length === 3 &&
      FSCE_PAPER_MODES[0] === 'mock_paper_1' &&
      FSCE_PAPER_MODES[1] === 'mock_paper_2' &&
      FSCE_PAPER_MODES[2] === 'mock_paper_3',
    FSCE_PAPER_MODES.join(', '),
  )
  check(
    'The Adventure Paper is English (Section A) then Maths (Section B), multiple choice',
    EXAM_CONFIGS.mock_paper_1.sections.length === 2 &&
      EXAM_CONFIGS.mock_paper_1.sections[0]?.subjects.join() === 'english' &&
      EXAM_CONFIGS.mock_paper_1.sections[1]?.subjects.join() === 'maths' &&
      EXAM_CONFIGS.mock_paper_1.sections.every(
        (section) => section.writtenMode !== true && section.creativeWriting !== true,
      ),
    EXAM_CONFIGS.mock_paper_1.sections
      .map((section) => `${section.title}: ${section.subjectLabel}`)
      .join(' | '),
  )

  const beaconSections = EXAM_CONFIGS.mock_paper_2.sections
  const writtenSection = beaconSections.find((section) => section.writtenMode === true)
  const creativeSection = beaconSections.find((section) => section.creativeWriting === true)
  check(
    'The Beacon Paper has a written-answers Section A and a creative writing Section B',
    Boolean(writtenSection) &&
      Boolean(creativeSection) &&
      beaconSections.length === 2 &&
      creativeSection?.subjectLabel === 'Creative Writing Task',
    beaconSections.map((section) => `${section.title}: ${section.subjectLabel}`).join(' | '),
  )

  const writtenPool = questions.filter(
    (question) =>
      question.answerType === 'short_text' &&
      (question.subject === 'english' || question.subject === 'maths'),
  ).length
  check(
    'The Beacon paper has enough written-answer questions to fill Section A (no A-E guessing)',
    writtenSection !== undefined && writtenPool >= writtenSection.questionCount,
    `${writtenPool} written questions available for ${writtenSection?.questionCount ?? 0} places`,
  )

  check(
    'The Compass Paper is a single Across the Curriculum section',
    EXAM_CONFIGS.mock_paper_3.sections.length === 1 &&
      EXAM_CONFIGS.mock_paper_3.sections[0]?.subjects.join() === 'compass' &&
      EXAM_CONFIGS.mock_paper_3.sections[0]?.writtenMode !== true,
    EXAM_CONFIGS.mock_paper_3.sections[0]?.subjectLabel ?? 'missing',
  )

  const compassTopics = new Set(
    questions.filter((question) => question.subject === 'compass').map((question) => question.topic),
  )
  check(
    'The Compass paper covers the 11 KS2 disciplines across the curriculum',
    COMPASS_TOPICS.length >= 11 && compassTopics.size >= 11,
    `${compassTopics.size} topics in the bank, ${COMPASS_TOPICS.length} expected`,
  )

  check(
    'The extra mini-mock drill is not one of the three official papers',
    EXTRA_PRACTICE_MODES.every((mode) => !FSCE_PAPER_MODES.includes(mode)),
    EXTRA_PRACTICE_MODES.join(', '),
  )

  // --- Optional NVR and VR ------------------------------------------------------
  check(
    'NVR and VR are optional subjects',
    OPTIONAL_SUBJECTS.every((subject) => isOptionalSubject(subject)) &&
      CORE_SUBJECTS.every((subject) => !isOptionalSubject(subject)),
    `core: ${CORE_SUBJECTS.join(', ')} | optional: ${OPTIONAL_SUBJECTS.join(', ')}`,
  )
  check(
    'The optional subjects are labelled as a bonus (not part of the Glos exam)',
    OPTIONAL_BONUS_LABEL.includes('Not in Glos FSCE Exam'),
    OPTIONAL_BONUS_LABEL,
  )

  // --- Optional practice can never move the phases --------------------------------
  const noAttempts = computeRoadmap({ attempts: [], sessions: [], questionTimeTargets: new Map() })
  const optionalAttempts: Attempt[] = [
    attempt('nvr-1', 'nvr', false),
    attempt('nvr-2', 'nvr', true),
    attempt('vr-1', 'vr', false),
  ]
  const optionalOnly = computeRoadmap({
    attempts: optionalAttempts,
    sessions: [],
    questionTimeTargets: new Map(),
  })
  const phasesUnchanged = noAttempts.phases.every((phase, index) => {
    const other = optionalOnly.phases[index]
    return (
      other !== undefined &&
      phase.percent === other.percent &&
      phase.goals.every((goal, goalIndex) => goal.achieved === other.goals[goalIndex]?.achieved)
    )
  })
  check(
    'NVR/VR practice never raises or lowers the phase progress',
    phasesUnchanged && optionalOnly.optionalAnswered === optionalAttempts.length,
    `phase percentages stay at ${noAttempts.phases.map((phase) => `${phase.percent}%`).join(', ')}`,
  )

  const coreAttempts: Attempt[] = [
    attempt('en-1', 'english', true),
    attempt('ma-1', 'maths', true),
    attempt('co-1', 'compass', true),
  ]
  const withCore = computeRoadmap({
    attempts: coreAttempts,
    sessions: [],
    questionTimeTargets: new Map(),
  })
  check(
    'English, Maths and Compass answers do move the phase progress',
    withCore.totalAnswered === 3 && withCore.phases[0]?.percent > noAttempts.phases[0]?.percent,
    `Phase 1 went from ${noAttempts.phases[0]?.percent}% to ${withCore.phases[0]?.percent}%`,
  )

  // --- Every paper question keeps the five options rule --------------------------
  const badOptions = questions.filter((question) => question.options.length !== 5)
  check(
    'Every question in the bank keeps exactly five options (A-E)',
    badOptions.length === 0,
    `${questions.length} questions checked`,
  )

  // --- Report --------------------------------------------------------------------
  process.stdout.write('ElevenSpark - Gloucestershire FSCE Model Audit\n')
  process.stdout.write('=================================================\n\n')
  for (const item of checks) {
    process.stdout.write(`  [${item.ok ? 'PASS' : 'FAIL'}] ${item.name}\n`)
    process.stdout.write(`         ${item.detail}\n`)
  }
  const failed = checks.filter((item) => !item.ok)
  process.stdout.write(`\nChecks: ${checks.length}, failures: ${failed.length}\n`)
  process.stdout.write(
    `\nRESULT: ${failed.length === 0 ? 'PASS - the FSCE model matches Gloucestershire' : 'FAIL - see the failures above'}\n`,
  )
  if (failed.length > 0) process.exitCode = 1
}

main()
