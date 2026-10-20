import { CloudAlert, CloudCheck, Download, Lock, RefreshCw, Upload } from 'lucide-react'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { useParentGate } from '../context/ParentGateContext'
import {
  exportSyncFile,
  getSyncConfig,
  getSyncStatus,
  importSyncFile,
  saveSyncConfig,
  subscribeSync,
  syncNow,
} from '../services/gistSync'
import { btnPrimaryClass, btnSecondaryClass } from './ui'

function relativeTime(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return `${Math.floor(hours / 24)} d ago`
}

function useSyncStatus() {
  return useSyncExternalStore(subscribeSync, getSyncStatus, getSyncStatus)
}

export function SyncStatusBadge() {
  const status = useSyncStatus()
  const { parentMode, requestUnlock } = useParentGate()
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState(() => getSyncConfig().token)
  const [gistId, setGistId] = useState(() => getSyncConfig().gistId)
  const [note, setNote] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const offline = !status.online
  const visual: 'ok' | 'syncing' | 'alert' = offline
    ? 'alert'
    : status.state === 'syncing'
      ? 'syncing'
      : status.state === 'ok'
        ? 'ok'
        : 'alert'

  const title = offline
    ? 'Offline — sync will resume when you reconnect'
    : status.state === 'syncing'
      ? 'Syncing now...'
      : status.state === 'ok' && status.lastSyncAt
        ? `Synced ${relativeTime(status.lastSyncAt)}`
        : status.error ?? 'Cloud sync is not configured yet'

  const handleSaveAndSync = useCallback(() => {
    saveSyncConfig({ token, gistId })
    setNote('Settings saved. Syncing...')
  }, [token, gistId])

  const handleSyncNow = useCallback(() => {
    saveSyncConfig({ token, gistId })
    setWorking(true)
    setNote(null)
    void syncNow().finally(() => setWorking(false))
  }, [token, gistId])

  const handleFile = useCallback((file: File | undefined) => {
    if (!file) return
    void file
      .text()
      .then((text) => importSyncFile(text))
      .then((count) => setNote(`Imported and merged ${count} answers. Sync scheduled.`))
      .catch((error: unknown) =>
        setNote(error instanceof Error ? error.message : 'Could not read that file.'),
      )
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={title}
        aria-label={`Cloud sync: ${title}`}
        className={`inline-flex min-h-[44px] items-center gap-2 rounded-2xl border-2 px-3 text-sm font-extrabold transition ${
          visual === 'ok'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400'
            : visual === 'syncing'
              ? 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-400'
              : 'border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-400'
        }`}
      >
        {visual === 'ok' ? (
          <CloudCheck className="h-5 w-5" aria-hidden="true" />
        ) : visual === 'syncing' ? (
          <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <CloudAlert className="h-5 w-5" aria-hidden="true" />
        )}
        <span className="hidden lg:inline">
          {visual === 'ok' && status.lastSyncAt
            ? `Synced ${relativeTime(status.lastSyncAt)}`
            : visual === 'syncing'
              ? 'Syncing...'
              : offline
                ? 'Offline'
                : 'Sync off'}
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cloud sync settings"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Cloud sync</p>
                <h2 className="text-lg font-black text-slate-900">GitHub private Gist</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`${btnSecondaryClass} min-h-[40px] px-3 py-1.5 text-sm`}
              >
                Close
              </button>
            </div>

            <div
              className={`mb-4 rounded-2xl border-2 px-3 py-2.5 text-sm font-bold ${
                visual === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : visual === 'syncing'
                    ? 'border-sky-200 bg-sky-50 text-sky-800'
                    : 'border-orange-200 bg-orange-50 text-orange-800'
              }`}
              role="status"
            >
              <span className="inline-flex items-center gap-2">
                {visual === 'ok' ? (
                  <CloudCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
                ) : visual === 'syncing' ? (
                  <RefreshCw className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
                ) : (
                  <CloudAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
                )}
                {title}
              </span>
              {status.lastSyncAt ? (
                <p className="mt-1 text-xs font-semibold opacity-80">
                  Last full sync: {relativeTime(status.lastSyncAt)}
                </p>
              ) : null}
            </div>

            {status.error && !offline ? (
              <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold leading-relaxed text-rose-700">
                {status.error}
              </p>
            ) : null}

            {!parentMode ? (
              <div className="flex flex-col gap-3">
                <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-relaxed text-slate-600">
                  <Lock className="mr-1 inline h-4 w-4" aria-hidden="true" />
                  Cloud sync settings are locked. Ask a parent to enter Parent Mode to change the token or
                  Gist.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void requestUnlock().then((unlocked) => {
                      if (unlocked) {
                        setToken(getSyncConfig().token)
                        setGistId(getSyncConfig().gistId)
                      }
                    })
                  }}
                  className={btnPrimaryClass}
                >
                  <Lock className="mr-2 inline h-5 w-5" aria-hidden="true" />
                  Enter Parent Mode
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-black text-slate-800">GitHub Personal Access Token</span>
                  <input
                    type="password"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="ghp_... or github_pat_..."
                    autoComplete="off"
                    spellCheck={false}
                    className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
                  <span className="text-xs font-semibold text-slate-500">
                    Needs the <strong>gist</strong> scope. Stored only on this device.
                  </span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-black text-slate-800">Gist ID (optional)</span>
                  <input
                    type="text"
                    value={gistId}
                    onChange={(event) => setGistId(event.target.value)}
                    placeholder="Leave empty to create one automatically"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
                  <span className="text-xs font-semibold text-slate-500">
                    Only profiles, sessions and answers are synced — never the question bank.
                  </span>
                </label>
              </div>
            )}

            {note ? (
              <p className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-sm font-bold text-indigo-800">
                {note}
              </p>
            ) : null}

            {parentMode ? (
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={handleSaveAndSync} className={btnPrimaryClass}>
                  Save settings
                </button>
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={working}
                  className={`${btnSecondaryClass} disabled:opacity-60`}
                >
                  <RefreshCw className={`mr-2 inline h-5 w-5 ${working ? 'animate-spin' : ''}`} aria-hidden="true" />
                  Sync now
                </button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={exportSyncFile} className={`${btnSecondaryClass} flex-1`}>
                    <Download className="mr-2 inline h-5 w-5" aria-hidden="true" />
                    Download JSON
                  </button>
                  <label className={`${btnSecondaryClass} flex-1 cursor-pointer`}>
                    <Upload className="mr-2 inline h-5 w-5" aria-hidden="true" />
                    Upload JSON
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        handleFile(file)
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
