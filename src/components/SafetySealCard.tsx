import { ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { readSafetySeal, runSafetyCheck, type SafetySeal } from '../services/safetySeal'
import { btnSecondaryClass, cardClass } from './ui'

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SafetySealCard() {
  const [seal, setSeal] = useState<SafetySeal | null>(() => readSafetySeal())
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => setSeal(readSafetySeal())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const handleCheck = useCallback(async () => {
    setRunning(true)
    setMessage(null)
    setProgress(0)
    try {
      const result = await runSafetyCheck({
        onProgress: (done, total) => {
          setProgress(total > 0 ? Math.round((done / total) * 100) : 100)
        },
      })
      setSeal(result)
      setMessage(
        result.violations === 0
          ? `Checked ${result.questionsChecked} questions and ${result.passagesChecked} passages. Everything is child-safe.`
          : `Checked ${result.questionsChecked} questions and ${result.passagesChecked} passages. ${result.violations} item(s) flagged.`,
      )
    } catch {
      setMessage('The safety check could not finish. Please try again.')
    } finally {
      setRunning(false)
    }
  }, [])

  const certified = seal !== null && seal.violations === 0
  const pending = seal === null

  return (
    <section className={cardClass}>
      <div className="flex items-start gap-3">
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
            pending ? 'bg-slate-100 text-slate-500' : certified ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
          }`}
        >
          {pending ? (
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          ) : certified ? (
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          ) : (
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-slate-900">Child Safety Seal</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            Every question and passage stored on this device is screened for adult, violent or harmful content
            before it can reach the practice screens.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        {pending ? (
          <p className="text-sm font-bold text-slate-600">No safety check recorded on this device yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm font-bold text-slate-700">
            <li>
              Status:{' '}
              <span className={certified ? 'text-emerald-700' : 'text-rose-700'}>
                {certified ? 'Certified child-safe' : `${seal.violations} item(s) flagged`}
              </span>
            </li>
            <li>Questions checked: {seal.questionsChecked.toLocaleString()}</li>
            <li>Passages checked: {seal.passagesChecked.toLocaleString()}</li>
            <li>Last checked: {formatDate(seal.checkedAt)}</li>
            <li>Question bank: v{seal.bankVersion}</li>
            {seal.samples.length > 0 ? (
              <li className="text-rose-700">Flagged: {seal.samples.join(', ')}</li>
            ) : null}
          </ul>
        )}
      </div>

      {running ? (
        <div className="mt-4">
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-sm font-bold text-slate-600" role="status">
            Checking questions... {progress}%
          </p>
        </div>
      ) : null}

      {message ? (
        <p className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-sm font-bold text-indigo-800" role="status">
          {message}
        </p>
      ) : null}

      <button type="button" onClick={() => void handleCheck()} disabled={running} className={`${btnSecondaryClass} mt-4 disabled:opacity-60`}>
        <RefreshCw className="h-5 w-5" aria-hidden="true" />
        {running ? 'Checking...' : 'Run safety check now'}
      </button>
      <p className="mt-2 text-xs font-semibold text-slate-500">
        The check runs on this device only and never sends anything to the internet.
      </p>
    </section>
  )
}
