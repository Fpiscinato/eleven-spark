import { CloudOff, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  applyServiceWorkerUpdate,
  dismissPwaState,
  getPwaState,
  subscribePwaState,
  type PwaState,
} from '../../services/pwaRegistration'

/**
 * Tells the child (and the parent) when a new version of the app has been
 * downloaded and is ready to be used. Without this the old version would keep
 * running silently and there would be no way to tell that an update landed.
 *
 * The service worker itself is registered in `src/services/pwaRegistration.ts`
 * (called from `main.tsx`) so it also works on the welcome screen, before the
 * app shell exists.
 */
export function UpdateBanner() {
  const [state, setState] = useState<PwaState>(() => getPwaState())

  useEffect(() => subscribePwaState(setState), [])

  if (state === 'none') return null

  const needsReload = state === 'update-available'

  return (
    <div
      className="update-banner sticky top-[64px] z-50 flex flex-wrap items-center gap-2 border-b-2 border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-extrabold text-indigo-900 md:top-[69px]"
      role="status"
    >
      {needsReload ? (
        <>
          <Sparkles className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            A new version of ElevenSpark is ready. Tap to update.
          </span>
          <button
            type="button"
            onClick={applyServiceWorkerUpdate}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border-2 border-indigo-600 bg-indigo-600 px-4 py-1.5 text-xs font-extrabold text-white transition hover:bg-indigo-700"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Update now
          </button>
        </>
      ) : (
        <>
          <CloudOff className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            ElevenSpark now works offline — you can practise even without Wi-Fi.
          </span>
          <button
            type="button"
            onClick={dismissPwaState}
            className="min-h-[40px] rounded-xl border-2 border-indigo-200 bg-white px-4 py-1.5 text-xs font-extrabold text-indigo-700 transition hover:bg-indigo-50"
          >
            Got it
          </button>
        </>
      )}
    </div>
  )
}
