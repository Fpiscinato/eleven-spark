import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { APP_VERSION } from '../src/config/version'

/**
 * ElevenSpark - Visibility & Release Hygiene Audit.
 *
 * It proves two things that a child would notice immediately if they broke:
 *
 * 1. No question can show an empty stem, an empty explanation or a blank
 *    answer that the child is expected to read.
 * 2. No text is invisible: a colour is never used for both the background
 *    and the letters on top of it, in the light theme AND in the dark theme
 *    (where the colours are remapped in src/index.css).
 *
 * The runtime proof (real computed colours on a real screen) is done by the
 * Playwright visual audit; this script is the static gate that runs in CI.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

interface Issue {
  file: string
  reason: string
}

const issues: Issue[] = []

/** The colour families that the theme can remap. */
const COLOR_FAMILIES = [
  'white',
  'black',
  'slate',
  'indigo',
  'rose',
  'emerald',
  'amber',
  'sky',
  'orange',
  'teal',
  'violet',
  'yellow',
]

/** Normalises "bg-indigo-600/50" into "indigo-600". */
function normaliseColor(token: string, prefix: 'bg' | 'text'): string | null {
  if (!token.startsWith(`${prefix}-`)) return null
  const rest = token.slice(prefix.length + 1).split('/')[0]
  if (rest === 'white' || rest === 'black') return rest
  for (const family of COLOR_FAMILIES) {
    if (rest === family) return family
    if (rest.startsWith(`${family}-`)) {
      const shade = rest.slice(family.length + 1)
      if (/^\d{2,3}$/.test(shade)) return `${family}-${shade}`
    }
  }
  return null
}

function collectSourceFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(full))
    } else if (/\.(tsx|ts)$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

/** Reads every class string in a file and reports invisible text pairs. */
function checkFileClasses(file: string): void {
  const source = readFileSync(file, 'utf8')
  const classStrings = new Set<string>()
  const literalPattern = /className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g
  let match: RegExpExecArray | null
  while ((match = literalPattern.exec(source)) !== null) {
    classStrings.add(match[1] ?? match[2] ?? match[3] ?? '')
  }
  // Template literals built with expressions (${...}) are read as one chunk.
  const templatePattern = /`([^`]*\$\{[^`]*`)/g
  while ((match = templatePattern.exec(source)) !== null) {
    classStrings.add(match[1])
  }

  for (const classString of classStrings) {
    const tokens = classString.split(/\s+/).filter(Boolean)
    const backgrounds = new Set<string>()
    const foregrounds = new Set<string>()
    for (const token of tokens) {
      // A translucent background (bg-white/15) lets the colour underneath
      // show through, so white text on top of it is still readable.
      if (token.includes('/')) continue
      const bg = normaliseColor(token, 'bg')
      if (bg) backgrounds.add(bg)
      const text = normaliseColor(token, 'text')
      if (text) foregrounds.add(text)
    }
    for (const foreground of foregrounds) {
      if (backgrounds.has(foreground)) {
        issues.push({
          file: relative(ROOT, file),
          reason: `text is invisible: "text-${foreground}" on "bg-${foreground}"`,
        })
      }
    }
  }
}

/** Checks the dark theme overrides in src/index.css. */
function checkDarkThemeOverrides(): void {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8')
  const backgroundOverrides = new Map<string, string>()
  const colorOverrides = new Map<string, string>()
  const rulePattern = /\[data-theme='dark'\]\s+\.(bg|text)-([a-z0-9-]+)\s*\{([^}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = rulePattern.exec(css)) !== null) {
    const [, kind, color, body] = match
    const value = body.match(/(?:background-color|color)\s*:\s*([^;]+);/)
    if (!value) continue
    const map = kind === 'bg' ? backgroundOverrides : colorOverrides
    map.set(color, value[1].trim())
  }
  for (const [color, background] of backgroundOverrides) {
    const foreground = colorOverrides.get(color)
    if (foreground && foreground === background) {
      issues.push({
        file: 'src/index.css',
        reason: `dark theme makes the text invisible: .text-${color} and .bg-${color} are both ${background}`,
      })
    }
  }
}

/** Checks the version follows the base-10 digit rule. */
function checkVersion(): void {
  if (!/^\d\.\d\.\d$/.test(APP_VERSION)) {
    issues.push({
      file: 'src/config/version.ts',
      reason: `APP_VERSION "${APP_VERSION}" must be three single base-10 digits (for example 1.7.5)`,
    })
  }
}

function main(): void {
  process.stdout.write('ElevenSpark - Visibility & Release Hygiene Audit\n')
  process.stdout.write('===================================================\n\n')

  checkVersion()
  checkDarkThemeOverrides()
  for (const file of collectSourceFiles(SRC)) {
    checkFileClasses(file)
  }

  process.stdout.write(`APP_VERSION: ${APP_VERSION}\n`)
  process.stdout.write(`Files scanned: ${collectSourceFiles(SRC).length}\n`)
  process.stdout.write(`Issues found: ${issues.length}\n`)

  if (issues.length > 0) {
    process.stdout.write('\n--- ISSUES ---\n')
    for (const issue of issues) {
      process.stdout.write(`  ${issue.file}: ${issue.reason}\n`)
    }
  }

  const ok = issues.length === 0
  process.stdout.write(
    `\nRESULT: ${ok ? 'PASS - every question is readable in light and dark mode' : 'FAIL - issues found above'}\n`,
  )
  if (!ok) process.exitCode = 1
}

main()
