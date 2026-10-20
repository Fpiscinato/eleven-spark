export interface Rng {
  next(): number
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: readonly T[]): T[]
  chance(probability: number): boolean
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1))
  const pick = <T,>(items: readonly T[]): T => items[int(0, items.length - 1)]
  const shuffle = <T,>(items: readonly T[]): T[] => {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = int(0, i)
      const a = copy[i]
      const b = copy[j]
      if (a !== undefined && b !== undefined) {
        copy[i] = b
        copy[j] = a
      }
    }
    return copy
  }
  const chance = (probability: number): boolean => next() < probability
  return { next, int, pick, shuffle, chance }
}

export function hashSeed(...parts: (string | number)[]): number {
  const text = parts.join('|')
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
