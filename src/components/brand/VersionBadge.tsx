import { useEffect, useState } from 'react'
import { APP_VERSION, QUESTION_BANK_VERSION } from '../../config/version'

export function VersionBadge() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-extrabold text-slate-500">
      v{APP_VERSION} • Bank v{QUESTION_BANK_VERSION}
    </span>
  )
}
