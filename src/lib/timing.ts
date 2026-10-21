/**
 * Timing safety helpers.
 *
 * A child can leave a tab open while thinking (or while a device is left on a
 * desk). That wall-clock gap is not "reasoning time", so it must never pollute
 * the "Average time" numbers shown on the dashboard and in practice reports.
 *
 * Rules:
 * - Any attempt longer than MAX_TRACKED_SECONDS is treated as an anomaly: it is
 *   capped when written to the database and ignored when averages are computed.
 * - Averages are only calculated from attempts that are genuinely usable.
 */

export const MAX_TRACKED_SECONDS = 300

export function isAnomalousTimeSpent(seconds: number): boolean {
  if (!Number.isFinite(seconds)) return true
  if (seconds < 0) return true
  return seconds > MAX_TRACKED_SECONDS
}

/** Caps a raw duration into the range that is safe to store and average. */
export function capTimeSpent(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.min(Math.round(seconds), MAX_TRACKED_SECONDS)
}

/** Returns the usable duration, or null when the value is an anomaly. */
export function usableTimeSpent(seconds: number): number | null {
  if (isAnomalousTimeSpent(seconds)) return null
  return Math.round(seconds)
}

/** Average of a list of durations, ignoring anomalous values. */
export function averageSeconds(values: readonly number[]): number {
  const usable = values.filter((value) => !isAnomalousTimeSpent(value))
  if (usable.length === 0) return 0
  const total = usable.reduce((sum, value) => sum + value, 0)
  return Math.round(total / usable.length)
}

/**
 * Median of a list of durations, ignoring anomalous values. The median is far
 * more robust than the average: one slow question can never distort it.
 */
export function medianSeconds(values: readonly number[]): number {
  const usable = values
    .filter((value) => !isAnomalousTimeSpent(value))
    .map((value) => Math.round(value))
    .sort((a, b) => a - b)
  if (usable.length === 0) return 0
  const middle = Math.floor(usable.length / 2)
  if (usable.length % 2 === 1) return usable[middle] ?? 0
  const lower = usable[middle - 1] ?? 0
  const upper = usable[middle] ?? 0
  return Math.round((lower + upper) / 2)
}

/** Sum of a list of durations, ignoring anomalous values. */
export function totalUsableSeconds(values: readonly number[]): number {
  return values
    .filter((value) => !isAnomalousTimeSpent(value))
    .reduce((sum, value) => sum + Math.round(value), 0)
}
