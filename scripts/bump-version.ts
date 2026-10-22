import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * ElevenSpark version bump.
 *
 * The version is always `major.minor.patch` and every part is a single
 * base-10 digit (0-9). Bumping follows the decimal rule, digit by digit:
 *
 *   1.7.4 -> 1.7.5 -> ... -> 1.7.9 -> 1.8.0 -> ... -> 1.9.9 -> 2.0.0
 *
 * The last digit is increased; when it would pass 9 it rolls over to 0 and
 * carries into the digit on the left. The same rule is used every time, so
 * the number never skips a step and never grows a fourth digit.
 *
 * Usage:
 *   npm run version:bump            -> bump the patch digit
 *   npm run version:bump -- 1.8.0   -> set an explicit version
 */

const VERSION_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../src/config/version.ts')
const VERSION_PATTERN = /export const APP_VERSION = '([^']+)'/

export function parseVersion(version: string): [number, number, number] {
  const parts = version.split('.')
  if (parts.length !== 3) {
    throw new Error(`Version "${version}" must have three parts (major.minor.patch).`)
  }
  const numbers = parts.map((part) => {
    if (!/^\d$/.test(part)) {
      throw new Error(`Version "${version}" must use single base-10 digits (0-9) only.`)
    }
    return Number(part)
  })
  return numbers as [number, number, number]
}

/** 1.7.4 -> 1.7.5, 1.7.9 -> 1.8.0, 1.9.9 -> 2.0.0 */
export function bumpVersion(version: string): string {
  const digits = parseVersion(version)
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] < 9) {
      digits[index] += 1
      return digits.join('.')
    }
    digits[index] = 0
  }
  throw new Error('Cannot bump past 9.9.9 — start a new major line by hand.')
}

function main(): void {
  const source = readFileSync(VERSION_FILE, 'utf8')
  const match = source.match(VERSION_PATTERN)
  if (!match) {
    throw new Error(`Could not find APP_VERSION in ${VERSION_FILE}.`)
  }
  const current = match[1]
  const requested = process.argv[2]
  const next = requested ? requested.trim() : bumpVersion(current)
  // The explicit version still has to obey the base-10 digit rule.
  parseVersion(next)
  if (next === current) {
    console.log(`Version is already ${current}.`)
    return
  }
  writeFileSync(VERSION_FILE, source.replace(VERSION_PATTERN, `export const APP_VERSION = '${next}'`))
  console.log(`Version bumped: ${current} -> ${next}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
