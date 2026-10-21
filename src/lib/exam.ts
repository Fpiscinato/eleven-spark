import { CORE_SUBJECTS, type Question, type SessionMode, type Subject } from '../db/schemas'

export type ExamMode = Extract<SessionMode, 'mock_paper_1' | 'mock_paper_2' | 'mock_paper_3' | 'mini_mock'>

export interface ExamSectionConfig {
  id: string
  title: string
  subjectLabel: string
  subjects: readonly Subject[]
  timeSeconds: number
  /** How many questions the section really contains, so the paper stays realistic. */
  questionCount: number
  /** Beacon-style papers ask for written answers typed into a box. */
  writtenMode?: boolean
}

export interface ExamConfig {
  mode: ExamMode
  title: string
  subtitle: string
  blurb: string
  sections: readonly ExamSectionConfig[]
  omrEligible: boolean
}

export const EXAM_MODES: readonly ExamMode[] = ['mock_paper_1', 'mock_paper_2', 'mock_paper_3', 'mini_mock']

const MINUTE = 60

export const EXAM_CONFIGS: Record<ExamMode, ExamConfig> = {
  mock_paper_1: {
    mode: 'mock_paper_1',
    title: 'Adventure Paper (50 min)',
    subtitle: 'Section A: English → Section B: Maths',
    blurb:
      'The G7 FSCE Adventure Paper: 25 minutes of English multiple choice, then a strict section lock, then 25 minutes of Maths multiple choice. Answers stay hidden until the very end.',
    omrEligible: true,
    sections: [
      {
        id: 'A',
        title: 'Section A',
        subjectLabel: 'English',
        subjects: ['english'],
        timeSeconds: 25 * MINUTE,
        questionCount: 30,
      },
      {
        id: 'B',
        title: 'Section B',
        subjectLabel: 'Maths',
        subjects: ['maths'],
        timeSeconds: 25 * MINUTE,
        questionCount: 30,
      },
    ],
  },
  mock_paper_2: {
    mode: 'mock_paper_2',
    title: 'Beacon Paper (50 min)',
    subtitle: 'Section A: English written answers → Section B: Maths written answers',
    blurb:
      'The G7 FSCE Beacon Paper: 25 minutes of English answers written in the boxes, a strict section lock, then 25 minutes of written Maths answers. Numbers and words must be typed before the answer is revealed.',
    omrEligible: false,
    sections: [
      {
        id: 'A',
        title: 'Section A',
        subjectLabel: 'English — written answers',
        subjects: ['english'],
        timeSeconds: 25 * MINUTE,
        questionCount: 20,
        writtenMode: true,
      },
      {
        id: 'B',
        title: 'Section B',
        subjectLabel: 'Maths — written answers',
        subjects: ['maths'],
        timeSeconds: 25 * MINUTE,
        questionCount: 20,
        writtenMode: true,
      },
    ],
  },
  mock_paper_3: {
    mode: 'mock_paper_3',
    title: 'Compass Paper (30 min)',
    subtitle: 'Section A: Across the Curriculum',
    blurb:
      'The G7 FSCE Compass Paper: logical interpretation across 11 KS2 disciplines — science and experiments, history, geography, computing, arts, design, music and languages.',
    omrEligible: true,
    sections: [
      {
        id: 'A',
        title: 'Section A',
        subjectLabel: 'Compass — Across the Curriculum',
        subjects: ['compass'],
        timeSeconds: 30 * MINUTE,
        questionCount: 25,
      },
    ],
  },
  mini_mock: {
    mode: 'mini_mock',
    title: 'Quick Mini-Mock (20 min)',
    subtitle: 'Section A (10 min) + Section B (10 min) · 24 questions in total',
    blurb:
      'A short two-section run for busy weekdays: 12 mixed questions, 10 minutes, then 12 more mixed questions with another 10 minutes on the clock.',
    omrEligible: false,
    sections: [
      {
        id: 'A',
        title: 'Section A',
        subjectLabel: 'Mixed — first half',
        subjects: CORE_SUBJECTS,
        timeSeconds: 10 * MINUTE,
        questionCount: 12,
      },
      {
        id: 'B',
        title: 'Section B',
        subjectLabel: 'Mixed — second half',
        subjects: CORE_SUBJECTS,
        timeSeconds: 10 * MINUTE,
        questionCount: 12,
      },
    ],
  },
}

/**
 * Picks `count` questions spread evenly across the groups (one per group in
 * turn), so a mock paper keeps the same mix of topics/subjects as the real
 * thing instead of a block of questions from a single topic.
 */
export function pickBalancedQuestions(
  questions: Question[],
  count: number,
  groupKey: (question: Question) => string,
): Question[] {
  if (count <= 0 || questions.length === 0) return []
  const groups = new Map<string, Question[]>()
  for (const question of questions) {
    const key = groupKey(question)
    const bucket = groups.get(key)
    if (bucket) bucket.push(question)
    else groups.set(key, [question])
  }
  const buckets = Array.from(groups.values())
  const picked: Question[] = []
  let round = 0
  while (picked.length < count) {
    let added = false
    for (const bucket of buckets) {
      const question = bucket[round]
      if (!question) continue
      picked.push(question)
      added = true
      if (picked.length >= count) break
    }
    if (!added) break
    round += 1
  }
  return picked
}

export function shuffleQuestions(questions: Question[]): Question[] {
  const next = [...questions]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}
