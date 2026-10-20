import { Copy, PencilLine, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../db/database'
import type { Profile } from '../db/schemas'
import {
  TARGET_SCHOOLS,
  cloneProfile,
  createProfile,
  deleteProfile,
  resetAllProgress,
  resetMistakeBank,
  resetMocks,
  updateProfile,
  type ProfileInput,
} from '../lib/admin'
import { resetQuickPractice } from '../lib/sessionHelpers'
import { useParentGate } from '../context/ParentGateContext'
import { EmptyState, ScreenHeader, btnPrimaryClass, btnSecondaryClass, cardClass } from './ui'

const AVATAR_CHOICES = ['🌟', '🚀', '🦁', '🦋', '🐉', '🎨', '🚴', '🔬']

interface EditorState {
  mode: 'edit' | 'create'
  profileId: string | null
  input: ProfileInput
}

interface ConfirmState {
  kind: 'delete' | 'reset_all' | 'reset_practice' | 'reset_mocks' | 'reset_mistakes'
  profileId: string
  profileName: string
}

function confirmCopy(state: ConfirmState): string {
  switch (state.kind) {
    case 'delete':
      return `Delete ${state.profileName}'s profile, all sessions and all answers? This cannot be undone.`
    case 'reset_all':
      return `Reset ALL progress for ${state.profileName}? Every practice, mock and answer will be removed.`
    case 'reset_practice':
      return `Reset Quick Practice history for ${state.profileName}? Mock papers are kept.`
    case 'reset_mocks':
      return `Reset all mock papers for ${state.profileName}? Quick Practice is kept.`
    case 'reset_mistakes':
      return `Clear the Mistake Bank for ${state.profileName}? Open mistakes will stop showing in the clinic.`
  }
}

export function ProfileManager() {
  const { parentMode, requestUnlock } = useParentGate()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({})
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const refresh = useCallback(async () => {
    const rows = await db.profiles.orderBy('createdAt').toArray()
    setProfiles(rows)
    const counts: Record<string, number> = {}
    for (const profile of rows) {
      counts[profile.id] = await db.sessions.where('profileId').equals(profile.id).count()
    }
    setSessionCounts(counts)
  }, [])

  useEffect(() => {
    if (parentMode) void refresh()
  }, [parentMode, refresh])

  const requireUnlock = useCallback((): Promise<boolean> => {
    if (parentMode) return Promise.resolve(true)
    return requestUnlock()
  }, [parentMode, requestUnlock])

  const handleSaveEditor = useCallback(async () => {
    if (!editor) return
    setWorking(true)
    setNote(null)
    try {
      if (editor.mode === 'edit' && editor.profileId) {
        await updateProfile(editor.profileId, editor.input)
        setNote('Profile updated.')
      } else {
        await createProfile(editor.input)
        setNote('New profile created.')
      }
      setEditor(null)
      await refresh()
    } catch {
      setNote('Something went wrong while saving. Please try again.')
    } finally {
      setWorking(false)
    }
  }, [editor, refresh])

  const handleClone = useCallback(
    async (profile: Profile) => {
      const unlocked = await requireUnlock()
      if (!unlocked) return
      setWorking(true)
      setNote(null)
      try {
        await cloneProfile(profile.id, `${profile.name} (copy)`)
        setNote(`Cloned ${profile.name}.`)
        await refresh()
      } finally {
        setWorking(false)
      }
    },
    [requireUnlock, refresh],
  )

  const runConfirm = useCallback(async () => {
    if (!confirm) return
    setWorking(true)
    setNote(null)
    try {
      switch (confirm.kind) {
        case 'delete': {
          const result = await deleteProfile(confirm.profileId)
          if (result === 'last') setNote('This is the last profile — it cannot be deleted.')
          else setNote('Profile deleted.')
          break
        }
        case 'reset_all': {
          const result = await resetAllProgress(confirm.profileId)
          setNote(`Removed ${result.sessionsRemoved} sessions and ${result.attemptsRemoved} answers.`)
          break
        }
        case 'reset_practice': {
          const removed = await resetQuickPractice(confirm.profileId)
          setNote(`Removed ${removed} Quick Practice sessions.`)
          break
        }
        case 'reset_mocks': {
          const result = await resetMocks(confirm.profileId)
          setNote(`Removed ${result.sessionsRemoved} mock papers.`)
          break
        }
        case 'reset_mistakes':
          resetMistakeBank(confirm.profileId)
          setNote('Mistake Bank cleared.')
          break
      }
      setConfirm(null)
      await refresh()
    } finally {
      setWorking(false)
    }
  }, [confirm, refresh])

  if (!parentMode) {
    return (
      <div className={cardClass}>
        <EmptyState
          icon={RotateCcw}
          title="Parent Dashboard is locked"
          body="Enter Parent Mode to manage profiles, reset progress and change settings."
        />
        <button
          type="button"
          onClick={() => void requestUnlock()}
          className={`${btnPrimaryClass} mx-auto flex`}
        >
          Enter Parent Mode
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <ScreenHeader title="Profiles" subtitle="Create, edit, clone or remove learner profiles." />

      {note ? (
        <p className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-sm font-bold text-indigo-800" role="status">
          {note}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setEditor({ mode: 'create', profileId: null, input: { name: '', avatar: '🚀', targetSchool: '' } })}
        className={btnPrimaryClass}
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
        New profile
      </button>

      {profiles.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No profiles yet"
          body="Create a profile so progress can be tracked per learner."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {profiles.map((profile) => (
            <li key={profile.id} className={`${cardClass} flex flex-col gap-3`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-2xl leading-none">
                  {profile.avatar}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black text-slate-900">{profile.name}</p>
                  <p className="text-sm font-bold text-slate-500">
                    {profile.targetSchool || 'No target school set'} · {sessionCounts[profile.id] ?? 0} sessions
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditor({
                      mode: 'edit',
                      profileId: profile.id,
                      input: {
                        name: profile.name,
                        avatar: profile.avatar,
                        targetSchool: profile.targetSchool,
                      },
                    })
                  }
                  className={`${btnSecondaryClass} min-h-[44px] px-4 py-2 text-sm`}
                >
                  <PencilLine className="h-4 w-4" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleClone(profile)}
                  disabled={working}
                  className={`${btnSecondaryClass} min-h-[44px] px-4 py-2 text-sm disabled:opacity-50`}
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Clone
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: 'delete', profileId: profile.id, profileName: profile.name })}
                  className={`${btnSecondaryClass} min-h-[44px] border-rose-200 px-4 py-2 text-sm text-rose-700 hover:border-rose-400`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: 'reset_practice', profileId: profile.id, profileName: profile.name })}
                  className={`${btnSecondaryClass} min-h-[44px] px-4 py-2 text-sm`}
                >
                  Reset Quick Practice
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: 'reset_mocks', profileId: profile.id, profileName: profile.name })}
                  className={`${btnSecondaryClass} min-h-[44px] px-4 py-2 text-sm`}
                >
                  Reset Mocks
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: 'reset_mistakes', profileId: profile.id, profileName: profile.name })}
                  className={`${btnSecondaryClass} min-h-[44px] px-4 py-2 text-sm`}
                >
                  Clear Mistake Bank
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: 'reset_all', profileId: profile.id, profileName: profile.name })}
                  className={`${btnSecondaryClass} min-h-[44px] border-rose-200 px-4 py-2 text-sm text-rose-700 hover:border-rose-400`}
                >
                  Reset All Progress
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editor ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editor.mode === 'edit' ? 'Edit profile' : 'New profile'}
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-black text-slate-900">
              {editor.mode === 'edit' ? 'Edit profile' : 'New profile'}
            </h2>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-black text-slate-800">Name</span>
                <input
                  type="text"
                  value={editor.input.name}
                  onChange={(event) =>
                    setEditor({ ...editor, input: { ...editor.input, name: event.target.value } })
                  }
                  placeholder="e.g. Amelia"
                  maxLength={40}
                  className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 text-base font-bold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-black text-slate-800">Avatar</span>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_CHOICES.map((avatar) => (
                    <button
                      key={avatar}
                      type="button"
                      onClick={() => setEditor({ ...editor, input: { ...editor.input, avatar } })}
                      aria-pressed={editor.input.avatar === avatar}
                      className={`grid h-12 w-12 place-items-center rounded-2xl border-2 text-xl transition ${
                        editor.input.avatar === avatar
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-black text-slate-800">Target school</span>
                <select
                  value={editor.input.targetSchool}
                  onChange={(event) =>
                    setEditor({ ...editor, input: { ...editor.input, targetSchool: event.target.value } })
                  }
                  className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 text-base font-bold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                >
                  <option value="">Not sure yet</option>
                  {TARGET_SCHOOLS.map((school) => (
                    <option key={school} value={school}>
                      {school}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleSaveEditor()}
                disabled={working || editor.input.name.trim().length === 0}
                className={`${btnPrimaryClass} flex-1 disabled:opacity-60`}
              >
                {working ? 'Saving...' : 'Save profile'}
              </button>
              <button type="button" onClick={() => setEditor(null)} className={`${btnSecondaryClass} flex-1`}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-slate-900/50 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirm action"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h2 className="mb-3 text-lg font-black text-slate-900">Are you sure?</h2>
            <p className="mb-5 text-sm font-semibold leading-relaxed text-slate-600">{confirmCopy(confirm)}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void runConfirm()}
                disabled={working}
                className={`${btnPrimaryClass} flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-60`}
              >
                {working ? 'Working...' : 'Yes, continue'}
              </button>
              <button type="button" onClick={() => setConfirm(null)} className={`${btnSecondaryClass} flex-1`}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
