import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

interface ModalProps {
  open: boolean
  onClose: () => void
  labelledBy?: string
  label?: string
  closeOnBackdrop?: boolean
  size?: ModalSize
  children: ReactNode
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({
  open,
  onClose,
  labelledBy,
  label,
  closeOnBackdrop = true,
  size = 'md',
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/60 p-4 py-6 sm:py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={label}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`my-auto w-full ${SIZE_CLASS[size]} max-h-[calc(100dvh-3rem)] overflow-y-auto overscroll-contain`}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
