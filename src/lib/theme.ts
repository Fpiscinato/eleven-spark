import { BookOpen, Calculator, MessagesSquare, Shapes, type LucideIcon } from 'lucide-react'
import type { Subject } from '../db/schemas'

export interface SubjectMeta {
  label: string
  short: string
  icon: LucideIcon
  badgeClass: string
  barClass: string
  tileClass: string
}

export const SUBJECT_META: Record<Subject, SubjectMeta> = {
  english: {
    label: 'English',
    short: 'En',
    icon: BookOpen,
    badgeClass: 'border-sky-200 bg-sky-100 text-sky-800',
    barClass: 'bg-sky-500',
    tileClass: 'border-sky-200 hover:border-sky-500 hover:bg-sky-50',
  },
  vr: {
    label: 'Verbal Reasoning',
    short: 'VR',
    icon: MessagesSquare,
    badgeClass: 'border-violet-200 bg-violet-100 text-violet-800',
    barClass: 'bg-violet-500',
    tileClass: 'border-violet-200 hover:border-violet-500 hover:bg-violet-50',
  },
  maths: {
    label: 'Maths',
    short: 'Ma',
    icon: Calculator,
    badgeClass: 'border-emerald-200 bg-emerald-100 text-emerald-800',
    barClass: 'bg-emerald-500',
    tileClass: 'border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50',
  },
  nvr: {
    label: 'Non-Verbal Reasoning',
    short: 'NVR',
    icon: Shapes,
    badgeClass: 'border-amber-200 bg-amber-100 text-amber-900',
    barClass: 'bg-amber-500',
    tileClass: 'border-amber-200 hover:border-amber-500 hover:bg-amber-50',
  },
}

export const SESSION_MODE_LABELS: Record<string, string> = {
  quick_practice: 'Quick Practice',
  mistake_clinic: 'Mistake Clinic',
  mock_paper_1: 'Mock Paper 1',
  mock_paper_2: 'Mock Paper 2',
  mini_mock: 'Mini Mock',
}
