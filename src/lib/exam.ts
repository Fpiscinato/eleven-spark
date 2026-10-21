import { type Question, type SessionMode, type Subject } from '../db/schemas'

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
  /** For creative writing tasks with rubric */
  creativeWriting?: boolean
}

export interface ExamConfig {
  mode: ExamMode
  title: string
  /** Short name used in the compact mock header (a phone has no room). */
  shortTitle: string
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
    title: 'Paper 1: FSCE Adventure Paper (~45 min)',
    shortTitle: 'Adventure',
    subtitle: 'Section A: English Comprehension & Vocabulary (22 min) → Section B: KS2 Maths Fluency (23 min)',
    blurb:
      'The G7 FSCE Adventure Paper: Multiple choice focused on quick fluency. Section A (English Comprehension & Vocabulary), then a strict section lock, then Section B (KS2 Maths Fluency).',
    omrEligible: true,
    sections: [
      {
        id: 'A',
        title: 'Section A',
        subjectLabel: 'English Comprehension & Vocabulary',
        subjects: ['english'],
        timeSeconds: 22 * MINUTE,
        questionCount: 30,
      },
      {
        id: 'B',
        title: 'Section B',
        subjectLabel: 'KS2 Maths Fluency',
        subjects: ['maths'],
        timeSeconds: 23 * MINUTE,
        questionCount: 30,
      },
    ],
  },
  mock_paper_2: {
    mode: 'mock_paper_2',
    title: 'Paper 2: FSCE Beacon Paper (~45 min - Written & Creative)',
    shortTitle: 'Beacon',
    subtitle: 'Section A: Written answers (25 min) → Section B: Creative Writing Task (20 min)',
    blurb:
      'The G7 FSCE Beacon Paper: Section A with written answers (type exact values/completions), strict section lock, then Section B Creative Writing Task with interactive rubric.',
    omrEligible: false,
    sections: [
      {
        id: 'A',
        title: 'Section A',
        subjectLabel: 'English & Maths — written answers',
        subjects: ['english', 'maths'],
        timeSeconds: 25 * MINUTE,
        questionCount: 20,
        writtenMode: true,
      },
      {
        id: 'B',
        title: 'Section B',
        subjectLabel: 'Creative Writing Task',
        subjects: ['english'],
        timeSeconds: 20 * MINUTE,
        questionCount: 1,
        writtenMode: true,
        creativeWriting: true,
      },
    ],
  },
  mock_paper_3: {
    mode: 'mock_paper_3',
    title: 'Paper 3: FSCE Compass Paper (~40 min - Across the Curriculum)',
    shortTitle: 'Compass',
    subtitle: 'Section A: Across the Curriculum',
    blurb:
      'The G7 FSCE Compass Paper: Multiple choice interdisciplinary questions across Science, History, Geography, Computing, Arts, Music evaluating data interpretation and academic curiosity.',
    omrEligible: true,
    sections: [
      {
        id: 'A',
        title: 'Section A',
        subjectLabel: 'Compass — Across the Curriculum',
        subjects: ['compass'],
        timeSeconds: 40 * MINUTE,
        questionCount: 25,
      },
    ],
  },
  mini_mock: {
    mode: 'mini_mock',
    title: 'Mini-Mock FSCE (20 min)',
    shortTitle: 'Mini-Mock',
    subtitle: 'Adventure + Compass mixed · 24 questions',
    blurb:
      'A short FSCE-style run for busy weekdays: combining Adventure and Compass content for quick practice.',
    omrEligible: false,
    sections: [
      {
        id: 'A',
        title: 'Section A',
        subjectLabel: 'Mixed — Adventure style',
        subjects: ['english', 'maths'],
        timeSeconds: 10 * MINUTE,
        questionCount: 12,
      },
      {
        id: 'B',
        title: 'Section B',
        subjectLabel: 'Mixed — Compass style',
        subjects: ['compass'],
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
