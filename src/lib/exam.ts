import { SUBJECTS, type Question, type SessionMode, type Subject } from '../db/schemas'

export type ExamMode = Extract<SessionMode, 'mock_paper_1' | 'mock_paper_2' | 'mini_mock'>

export interface ExamSectionConfig {
  id: string
  title: string
  subjectLabel: string
  subjects: readonly Subject[]
  timeSeconds: number
}

export interface ExamConfig {
  mode: ExamMode
  title: string
  subtitle: string
  blurb: string
  sections: readonly ExamSectionConfig[]
  omrEligible: boolean
}

export const EXAM_MODES: readonly ExamMode[] = ['mock_paper_1', 'mock_paper_2', 'mini_mock']

const MINUTE = 60

export const EXAM_CONFIGS: Record<ExamMode, ExamConfig> = {
  mock_paper_1: {
    mode: 'mock_paper_1',
    title: 'Gloucestershire Paper 1 (50 min)',
    subtitle: 'Section A: English → Section B: Verbal Reasoning',
    blurb:
      'The real Paper 1 format: 25 minutes of English, then a strict section lock, then 25 minutes of Verbal Reasoning. Answers stay hidden until the very end.',
    omrEligible: true,
    sections: [
      {
        id: 'A',
        title: 'Section A',
        subjectLabel: 'English',
        subjects: ['english'],
        timeSeconds: 25 * MINUTE,
      },
      {
        id: 'B',
        title: 'Section B',
        subjectLabel: 'Verbal Reasoning',
        subjects: ['vr'],
        timeSeconds: 25 * MINUTE,
      },
    ],
  },
  mock_paper_2: {
    mode: 'mock_paper_2',
    title: 'Gloucestershire Paper 2 (50 min)',
    subtitle: 'Section A: Non-Verbal → Section B: Maths',
    blurb:
      'The real Paper 2 format: 20 minutes of Non-Verbal Reasoning, strict section lock, then 30 minutes of KS2 Year 6 Maths.',
    omrEligible: true,
    sections: [
      {
        id: 'A',
        title: 'Section A',
        subjectLabel: 'Non-Verbal Reasoning',
        subjects: ['nvr'],
        timeSeconds: 20 * MINUTE,
      },
      {
        id: 'B',
        title: 'Section B',
        subjectLabel: 'KS2 Maths',
        subjects: ['maths'],
        timeSeconds: 30 * MINUTE,
      },
    ],
  },
  mini_mock: {
    mode: 'mini_mock',
    title: 'Quick Mini-Mock (20 min)',
    subtitle: 'Section A (10 min) + Section B (10 min) · half the questions',
    blurb:
      'A shorter two-section run for weekdays: mixed questions split across Section A and Section B, 10 minutes each — half the length of a full paper.',
    omrEligible: false,
    sections: [
      {
        id: 'A',
        title: 'Section A',
        subjectLabel: 'Mixed — first half',
        subjects: SUBJECTS,
        timeSeconds: 10 * MINUTE,
      },
      {
        id: 'B',
        title: 'Section B',
        subjectLabel: 'Mixed — second half',
        subjects: SUBJECTS,
        timeSeconds: 10 * MINUTE,
      },
    ],
  },
}

export function shuffleQuestions(questions: Question[]): Question[] {
  const next = [...questions]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}
