import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ParentPinModal } from '../components/ParentPinModal'
import { getParentPin } from '../lib/admin'

export const AUTO_LOCK_MS = 5 * 60 * 1000

interface ParentGateContextValue {
  parentMode: boolean
  requestUnlock: () => Promise<boolean>
  lockParentMode: () => void
}

interface ParentAutoLockContextValue {
  secondsLeft: number | null
  notice: string | null
  clearNotice: () => void
}

const ParentGateContext = createContext<ParentGateContextValue | null>(null)
const ParentAutoLockContext = createContext<ParentAutoLockContextValue | null>(null)

interface PendingUnlock {
  resolve: (value: boolean) => void
}

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'pointerdown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
  'mousemove',
]

export function ParentGateProvider({ children }: { children: ReactNode }) {
  const [parentMode, setParentMode] = useState(false)
  const [pending, setPending] = useState<PendingUnlock | null>(null)
  const pendingRef = useRef<PendingUnlock | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const lastActivityRef = useRef<number>(0)

  const requestUnlock = useCallback((): Promise<boolean> => {
    if (parentMode) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      const entry: PendingUnlock = {
        resolve: (value: boolean) => {
          pendingRef.current = null
          setPending(null)
          resolve(value)
        },
      }
      pendingRef.current = entry
      setPending(entry)
    })
  }, [parentMode])

  const handleSubmit = useCallback(
    (pin: string): boolean => {
      if (pin !== getParentPin()) return false
      setParentMode(true)
      lastActivityRef.current = Date.now()
      const entry = pendingRef.current
      entry?.resolve(true)
      return true
    },
    [],
  )

  const handleCancel = useCallback(() => {
    const entry = pendingRef.current
    entry?.resolve(false)
  }, [])

  const lockParentMode = useCallback(() => {
    setParentMode(false)
  }, [])

  const clearNotice = useCallback(() => setNotice(null), [])

  useEffect(() => {
    if (!parentMode) return
    lastActivityRef.current = Date.now()
    const markActivity = () => {
      lastActivityRef.current = Date.now()
    }
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, markActivity, { passive: true })
    }
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, AUTO_LOCK_MS - (Date.now() - lastActivityRef.current))
      setSecondsLeft(Math.ceil(remaining / 1000))
      if (remaining <= 0) {
        setParentMode(false)
        setNotice('Parent Mode locked automatically after 5 minutes of inactivity.')
      }
    }, 1000)
    return () => {
      window.clearInterval(timer)
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, markActivity)
      }
    }
  }, [parentMode])

  const value = useMemo<ParentGateContextValue>(
    () => ({ parentMode, requestUnlock, lockParentMode }),
    [parentMode, requestUnlock, lockParentMode],
  )

  const autoLockValue = useMemo<ParentAutoLockContextValue>(
    () => ({ secondsLeft: parentMode ? secondsLeft : null, notice, clearNotice }),
    [parentMode, secondsLeft, notice, clearNotice],
  )

  return (
    <ParentGateContext.Provider value={value}>
      <ParentAutoLockContext.Provider value={autoLockValue}>
        {children}
        <ParentPinModal open={pending !== null} onSubmit={handleSubmit} onCancel={handleCancel} />
      </ParentAutoLockContext.Provider>
    </ParentGateContext.Provider>
  )
}

export function useParentGate(): ParentGateContextValue {
  const context = useContext(ParentGateContext)
  if (!context) {
    throw new Error('useParentGate must be used inside a ParentGateProvider.')
  }
  return context
}

export function useParentAutoLock(): ParentAutoLockContextValue {
  const context = useContext(ParentAutoLockContext)
  if (!context) {
    throw new Error('useParentAutoLock must be used inside a ParentGateProvider.')
  }
  return context
}
