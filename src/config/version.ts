export const APP_VERSION = '1.7.2'
export const QUESTION_BANK_VERSION = 6
export const BUILD_TARGET = 'Gloucestershire FSCE (G7) Edition'
export const EDITION_LABEL = 'Glos FSCE Edition'
export const VERSION_SEAL = `v${APP_VERSION} • ${EDITION_LABEL}`
export const LEGAL_DISCLAIMER =
  'Independent 11+ preparation platform. Not affiliated with the exam boards.'

/**
 * What changed in this version, shown in Settings so a parent can confirm the
 * app really updated. Keep it short and written for a 9-year-old.
 */
export const RELEASE_NOTES: readonly string[] = [
  'Practice and Mock now open in a full-screen focus mode with more room for the question.',
  'Answers show in two columns and the scratchpad moved to the top bar.',
  'Mock now shows “1 of 30” instead of the full number grid, with Flag next to Cancel.',
  'Blank drawings in Non-Verbal questions are fixed.',
  'Mobile layout no longer overlaps buttons over the text.',
]
