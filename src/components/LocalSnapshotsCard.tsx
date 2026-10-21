import { History, RotateCcw, Save, Trash2, Lock } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useParentGate } from '../context/ParentGateContext'
import { DATA_CHANGED_EVENT } from '../lib/events'
import {
  MAX_SNAPSHOTS,
  deleteSnapshot,
  listSnapshots,
  restoreSnapshot,
  saveSnapshot,
  type SnapshotEntry,
} from '../services/localSnapshots'
import { Modal } from './Modal'
import { btnPrimaryClass, btnSecondaryClass, cardClass } from './ui'

function formatDate(entry: SnapshotEntry): string {
  const parsed = new Date(`${entry.date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return entry.date
  return parsed.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function LocalSnapshotsCard() {
  const { parentMode, requestUnlock } = useParentGate()
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>(() => listSnapshots())
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingRestore, setPendingRestore] = useState<SnapshotEntry | null>(null)

  const refresh = useCallback(() => {
    setSnapshots(listSnapshots())
  }, [])

  useEffect(() => {
    const handleDataChanged = () => setSnapshots(listSnapshots())
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged)
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged)
  }, [])

  const handleCreate = useCallback(async () => {
    setWorking(true)
    setMessage(null)
    try {
      const entry = await saveSnapshot('manual')
      refresh()
      setMessage(entry ? `Snapshot saved for ${entry.date}.` : 'There was not enough space to save a snapshot.')
    } catch {
      setMessage('The snapshot could not be saved. Please try again.')
    } finally {
      setWorking(false)
    }
  }, [refresh])

  const handleRestore = useCallback(async () => {
    if (!pendingRestore) return
    setWorking(true)
    try {
      const ok = await restoreSnapshot(pendingRestore.id)
      setPendingRestore(null)
      setMessage(ok ? 'Snapshot restored. Progress is back as it was on that day.' : 'That snapshot could not be restored.')
    } catch {
      setMessage('That snapshot could not be restored.')
    } finally {
      setWorking(false)
    }
  }, [pendingRestore])

  const handleDelete = useCallback(
    (entry: SnapshotEntry) => {
      deleteSnapshot(entry.id)
      refresh()
      setMessage(`Snapshot from ${entry.date} deleted.`)
    },
    [refresh],
  )

  return (
    <section className={cardClass}>
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
          <History className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-slate-900">Automatic snapshots</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            ElevenSpark saves a copy of your progress automatically once a day and keeps the last {MAX_SNAPSHOTS}{' '}
            days. Today&apos;s snapshot is overwritten automatically, so the newest copy is always the right one.
          </p>
        </div>
      </div>

      {message ? (
        <p className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-sm font-bold text-indigo-800" role="status">
          {message}
        </p>
      ) : null}

      {snapshots.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">
          No snapshots yet. The first one is created automatically after the next practice session.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {snapshots.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900">
                  {formatDate(entry)}
                  {entry.label === 'auto' ? (
                    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wide text-slate-600">
                      Auto
                    </span>
                  ) : null}
                </p>
                <p className="text-xs font-bold text-slate-500">
                  {entry.sessions} session(s) · {entry.attempts} answer(s) · {formatBytes(entry.bytes)}
                </p>
              </div>
              {parentMode ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingRestore(entry)}
                    className={`${btnSecondaryClass} min-h-[40px] px-3 py-1.5 text-xs`}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry)}
                    className={`${btnSecondaryClass} min-h-[40px] border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:border-rose-400`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {parentMode ? (
        <button type="button" onClick={() => void handleCreate()} disabled={working} className={`${btnPrimaryClass} mt-4 disabled:opacity-60`}>
          <Save className="h-5 w-5" aria-hidden="true" />
          Save a snapshot now
        </button>
      ) : (
        <button type="button" onClick={() => void requestUnlock()} className={`${btnPrimaryClass} mt-4`}>
          <Lock className="mr-2 inline h-5 w-5" aria-hidden="true" />
          Enter Parent Mode
        </button>
      )}

      {pendingRestore ? (
        <Modal open onClose={() => setPendingRestore(null)} label="Restore snapshot">
          <div className="w-full rounded-3xl bg-white p-6 shadow-xl">
            <h2 className="mb-3 text-lg font-black text-slate-900">Restore this snapshot?</h2>
            <p className="mb-5 text-sm font-semibold leading-relaxed text-slate-600">
              The snapshot from {formatDate(pendingRestore)} will replace the current profiles, sessions and answers.
              Anything done since then will be lost.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleRestore()}
                disabled={working}
                className={`${btnPrimaryClass} flex-1 disabled:opacity-60`}
              >
                {working ? 'Restoring...' : 'Yes, restore'}
              </button>
              <button type="button" onClick={() => setPendingRestore(null)} className={`${btnSecondaryClass} flex-1`}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}
