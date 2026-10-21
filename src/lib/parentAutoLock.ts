import { useCallback, useEffect, useState } from 'react'

export const PARENT_LOCK_OPTIONS = [1, 2, 5] as const

export type ParentLockMinutes = (typeof PARENT_LOCK_OPTIONS)[number]

export const PARENT_LOCK_KEY = 'elevenspark.parentLockMinutes'
export const PARENT_LOCK_CHANGED_EVENT = 'elevenspark:parent-lock-changed'
export const DEFAULT_PARENT_LOCK_MINUTES: ParentLockMinutes = 5

export function getParentLockMinutes(): ParentLockMinutes {
  if (typeof window === 'undefined') return DEFAULT_PARENT_LOCK_MINUTES
  const raw = window.localStorage.getItem(PARENT_LOCK_KEY)
  const parsed = Number(raw)
  if (raw !== null && Number.isFinite(parsed) && (PARENT_LOCK_OPTIONS as readonly number[]).includes(parsed)) {
    return parsed as ParentLockMinutes
  }
  return DEFAULT_PARENT_LOCK_MINUTES
}

export function setParentLockMinutes(minutes: ParentLockMinutes): void {
  window.localStorage.setItem(PARENT_LOCK_KEY, String(minutes))
  window.dispatchEvent(new CustomEvent(PARENT_LOCK_CHANGED_EVENT, { detail: { minutes } }))
}

export function useParentLockMinutes(): [ParentLockMinutes, (minutes: ParentLockMinutes) => void] {
  const [minutes, setMinutes] = useState<ParentLockMinutes>(() => getParentLockMinutes())

  useEffect(() => {
    const onChange = () => setMinutes(getParentLockMinutes())
    window.addEventListener(PARENT_LOCK_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(PARENT_LOCK_CHANGED_EVENT, onChange)
  }, [])

  const update = useCallback((next: ParentLockMinutes) => {
    setParentLockMinutes(next)
    setMinutes(next)
  }, [])

  return [minutes, update]
}
