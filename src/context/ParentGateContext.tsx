import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { ParentPinModal } from '../components/ParentPinModal'
import { getParentPin } from '../lib/admin'

interface ParentGateContextValue {
  parentMode: boolean
  requestUnlock: () => Promise<boolean>
  lockParentMode: () => void
}

const ParentGateContext = createContext<ParentGateContextValue | null>(null)

interface PendingUnlock {
  resolve: (value: boolean) => void
}

export function ParentGateProvider({ children }: { children: ReactNode }) {
  const [parentMode, setParentMode] = useState(false)
  const [pending, setPending] = useState<PendingUnlock | null>(null)
  const pendingRef = useRef<PendingUnlock | null>(null)

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
    (pin: string) => {
      const entry = pendingRef.current
      if (!entry) return
      if (pin === getParentPin()) {
        setParentMode(true)
        entry.resolve(true)
      } else {
        entry.resolve(false)
      }
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

  const value = useMemo<ParentGateContextValue>(
    () => ({ parentMode, requestUnlock, lockParentMode }),
    [parentMode, requestUnlock, lockParentMode],
  )

  return (
    <ParentGateContext.Provider value={value}>
      {children}
      <ParentPinModal
        open={pending !== null}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
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
