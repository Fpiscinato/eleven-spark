export const APP_VERSION = '1.7.5'
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
  'The Practice screen is now "action first": Start Practice and Quick 10 Mix sit at the top, and everything else folds away into three neat cards.',
  'The Mistake Clinic and the Mistake Bank now look exactly like Practice — same screen size, same two columns on a laptop, same buttons on a phone.',
  'Stopping a session now asks once, with two clear buttons, so a tap can never throw your work away by accident.',
  'The three Gloucestershire papers (Adventure, Beacon, Compass) stand apart from the extra mini-mock drill.',
  'Optional NVR and VR are labelled as a bonus and never move your FSCE phase progress.',
  'Every question was checked in light and dark mode: no empty stems, no invisible text.',
]
