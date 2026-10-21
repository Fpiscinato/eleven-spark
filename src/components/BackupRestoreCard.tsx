import { AlertTriangle, Download, Lock, Upload } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useParentGate } from '../context/ParentGateContext'
import {
  backupFilename,
  buildBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  triggerDownload,
} from '../lib/backup'
import { btnPrimaryClass, btnSecondaryClass, cardClass } from './ui'

export function BackupRestoreCard() {
  const { parentMode, requestUnlock } = useParentGate()
  const [banner, setBanner] = useState<string | null>(null)
  const [pendingBackupText, setPendingBackupText] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const handleExport = useCallback(async () => {
    setWorking(true)
    try {
      const backup = await buildBackup()
      triggerDownload(backupFilename(), serializeBackup(backup))
      setBanner('Backup downloaded. Keep the file safe — you can restore it any time.')
    } catch {
      setBanner('Could not build the backup file. Please try again.')
    } finally {
      setWorking(false)
    }
  }, [])

  const handleFileSelected = useCallback(async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseBackup(text)
      setPendingBackupText(serializeBackup(parsed))
      setBanner(
        `Backup ready: ${parsed.questions.length} questions, ${parsed.sessions.length} sessions, ${parsed.attempts.length} answers. Confirm below to replace current data.`,
      )
    } catch (error) {
      setPendingBackupText(null)
      setBanner(error instanceof Error ? error.message : 'Could not read that file.')
    }
  }, [])

  const confirmRestore = useCallback(async () => {
    if (!pendingBackupText) return
    setWorking(true)
    try {
      const parsed = parseBackup(pendingBackupText)
      await restoreBackup(parsed)
      setPendingBackupText(null)
      setBanner('Backup restored. Everything on this device now matches your backup.')
    } catch {
      setBanner('Something went wrong while restoring. Your old data was not changed.')
    } finally {
      setWorking(false)
    }
  }, [pendingBackupText])

  return (
    <section className={cardClass}>
      <h2 className="mb-2 text-base font-black text-slate-900">Backup & restore</h2>
      <p className="mb-4 text-sm font-semibold text-slate-600">
        Export everything on this device to a JSON file, or restore a previous backup. Restoring replaces all
        current data on this device.
      </p>
      {banner ? (
        <p className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-sm font-bold text-indigo-800" role="status">
          {banner}
        </p>
      ) : null}
      {parentMode ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => void handleExport()} disabled={working} className={`${btnPrimaryClass} disabled:opacity-60`}>
            <Download className="h-5 w-5" aria-hidden="true" />
            Export backup
          </button>
          <label className={`${btnSecondaryClass} cursor-pointer`}>
            <Upload className="h-5 w-5" aria-hidden="true" />
            Choose backup file
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                void handleFileSelected(file)
              }}
            />
          </label>
          {pendingBackupText ? (
            <button
              type="button"
              onClick={() => void confirmRestore()}
              disabled={working}
              className={`${btnPrimaryClass} border-2 border-rose-600 bg-rose-600 hover:bg-rose-700 disabled:opacity-60`}
            >
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              Confirm replace all data
            </button>
          ) : null}
        </div>
      ) : (
        <button type="button" onClick={() => void requestUnlock()} className={btnPrimaryClass}>
          <Lock className="mr-2 inline h-5 w-5" aria-hidden="true" />
          Enter Parent Mode
        </button>
      )}
    </section>
  )
}
