import type { Subject } from './db/schemas'

export type ScreenId = 'dashboard' | 'practice' | 'mock' | 'progress' | 'analytics' | 'guide' | 'settings'

export interface NavParams {
  subject?: Subject
  topic?: string
  clinicIds?: string[]
}
