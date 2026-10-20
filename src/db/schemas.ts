import { z } from 'zod'

export const SUBJECTS = ['english', 'vr', 'maths', 'nvr'] as const
export const subjectSchema = z.enum(SUBJECTS)
export type Subject = z.infer<typeof subjectSchema>

export const difficultySchema = z.union([z.literal(1), z.literal(2), z.literal(3)])
export type Difficulty = z.infer<typeof difficultySchema>

export const SESSION_MODES = [
  'quick_practice',
  'mistake_clinic',
  'mock_paper_1',
  'mock_paper_2',
  'mini_mock',
] as const
export const sessionModeSchema = z.enum(SESSION_MODES)
export type SessionMode = z.infer<typeof sessionModeSchema>

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

export const DEFAULT_PROFILE_ID = 'profile-student'
export const GUEST_PROFILE_ID = 'profile-guest'

export const profileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  avatar: z.string().min(1).max(8),
  targetSchool: z.string().max(80),
  isGuest: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type Profile = z.infer<typeof profileSchema>

export const nvrShapeSchema = z.enum([
  'triangle',
  'square',
  'pentagon',
  'hexagon',
  'circle',
  'star',
  'arrow',
  'cross',
])
export type NvrShape = z.infer<typeof nvrShapeSchema>

export const nvrFillSchema = z.enum(['solid', 'empty', 'striped', 'shaded'])
export type NvrFill = z.infer<typeof nvrFillSchema>

export const nvrSizeSchema = z.enum(['small', 'medium', 'large'])
export type NvrSize = z.infer<typeof nvrSizeSchema>

export const nvrLayoutSchema = z.enum(['single', 'sequence', 'matrix2', 'matrix3'])
export type NvrLayout = z.infer<typeof nvrLayoutSchema>

export const nvrMarkPositionSchema = z.enum([
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
])
export type NvrMarkPosition = z.infer<typeof nvrMarkPositionSchema>

export const nvrMarkSchema = z.object({
  kind: z.enum(['dot', 'symbol']),
  position: nvrMarkPositionSchema,
  symbol: z.string().max(4).optional(),
})
export type NvrMark = z.infer<typeof nvrMarkSchema>

export const nvrFigureSchema = z.object({
  shape: nvrShapeSchema,
  fill: nvrFillSchema.optional(),
  rotation: z.number().min(0).max(315).optional(),
  size: nvrSizeSchema.optional(),
  marks: z.array(nvrMarkSchema).max(6).optional(),
})
export type NvrFigure = z.infer<typeof nvrFigureSchema>

export const svgConfigSchema = z.object({
  layout: nvrLayoutSchema,
  cells: z.array(nvrFigureSchema).max(9),
  optionFigures: z.array(nvrFigureSchema).max(5).optional(),
})
export type SvgConfig = z.infer<typeof svgConfigSchema>

export const questionSchema = z.object({
  id: z.string().min(1),
  subject: subjectSchema,
  topic: z.string().min(1),
  difficulty: difficultySchema,
  passageId: z.string().optional(),
  stem: z.string().min(1),
  svgConfig: svgConfigSchema.optional(),
  options: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]),
  correctIndex: z.number().int().min(0).max(4),
  explanation: z.string().min(1),
  timeTargetSeconds: z.number().int().positive(),
})
export type Question = z.infer<typeof questionSchema>

export const passageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
})
export type Passage = z.infer<typeof passageSchema>

export const sectionBreakdownEntrySchema = z.object({
  section: z.string(),
  correct: z.number().int().min(0),
  total: z.number().int().min(0),
  timeSeconds: z.number().min(0),
})
export type SectionBreakdownEntry = z.infer<typeof sectionBreakdownEntrySchema>

export const sessionStatusSchema = z.enum(['in_progress', 'completed', 'abandoned'])
export type SessionStatus = z.infer<typeof sessionStatusSchema>

export const sessionSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1).default(DEFAULT_PROFILE_ID),
  mode: sessionModeSchema,
  status: sessionStatusSchema.default('in_progress'),
  startedAt: z.number().int(),
  completedAt: z.number().int().nullable(),
  totalTimeSeconds: z.number().min(0),
  scorePercentage: z.number().min(0).max(100),
  sectionBreakdown: z.array(sectionBreakdownEntrySchema),
})
export type Session = z.infer<typeof sessionSchema>

export const attemptSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1).default(DEFAULT_PROFILE_ID),
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  subject: subjectSchema,
  topic: z.string(),
  difficulty: difficultySchema,
  selectedIndex: z.number().int().min(0).max(4).nullable(),
  isCorrect: z.boolean(),
  timeSpentSeconds: z.number().min(0),
  flagged: z.boolean(),
  timestamp: z.number().int(),
})
export type Attempt = z.infer<typeof attemptSchema>

export const backupSchema = z.object({
  app: z.literal('ElevenSpark'),
  version: z.literal(1),
  exportedAt: z.number().int(),
  profiles: z.array(profileSchema).default([]),
  passages: z.array(passageSchema),
  questions: z.array(questionSchema),
  sessions: z.array(sessionSchema),
  attempts: z.array(attemptSchema),
})
export type Backup = z.infer<typeof backupSchema>
