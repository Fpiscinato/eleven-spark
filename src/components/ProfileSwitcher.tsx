import { Check, ChevronDown, PencilLine, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useProfile } from '../context/ProfileContext'
import { useParentGate } from '../context/ParentGateContext'
import { TARGET_SCHOOLS } from '../lib/admin'
import { Modal } from './Modal'
import { btnPrimaryClass, btnSecondaryClass } from './ui'

const AVATAR_CHOICES = ['🌟', '🚀', '🦁', '🦋', '🐉', '🎨', '🚴', '🔬']

interface EditState {
  mode: 'edit' | 'create'
  name: string
  avatar: string
  targetSchool: string
}

export function ProfileSwitcher() {
  const { profiles, activeProfile, switchProfile, updateProfile, addProfile } = useProfile()
  const { parentMode, requestUnlock } = useParentGate()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [gateNote, setGateNote] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      if (editing.mode === 'edit' && activeProfile) {
        await updateProfile(activeProfile.id, {
          name: editing.name,
          avatar: editing.avatar,
          targetSchool: editing.targetSchool,
        })
      } else {
        await addProfile({
          name: editing.name,
          avatar: editing.avatar,
          targetSchool: editing.targetSchool,
        })
      }
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 max-sm:h-11 max-sm:max-w-[44px] max-sm:justify-center max-sm:gap-0 max-sm:px-0"
      >
        <span className="grid h-7 w-7 place-items-center rounded-xl bg-indigo-100 text-base leading-none">
          {activeProfile?.avatar ?? '🌟'}
        </span>
        <span className="hidden max-w-[110px] truncate sm:inline-block">{activeProfile?.name ?? 'Player'}</span>
        <ChevronDown className="hidden h-4 w-4 sm:block" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-3xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <p className="px-2 pb-2 text-xs font-black uppercase tracking-widest text-slate-400">
            Switch profile
          </p>
          <ul className="flex flex-col gap-1">
            {profiles.map((profile) => {
              const active = profile.id === activeProfile?.id
              return (
                <li key={profile.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      void switchProfile(profile.id)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                      active ? 'bg-indigo-50 text-indigo-800' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg leading-none">
                      {profile.avatar}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">{profile.name}</span>
                      <span className="block truncate text-xs font-semibold text-slate-500">
                        {profile.targetSchool || (profile.isGuest ? 'Adult test profile' : 'No target school set')}
                      </span>
                    </span>
                    {active ? <Check className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" /> : null}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                const openEditor = () => {
                  setOpen(false)
                  setEditing({
                    mode: 'edit',
                    name: activeProfile?.name ?? '',
                    avatar: activeProfile?.avatar ?? '🌟',
                    targetSchool: activeProfile?.targetSchool ?? '',
                  })
                }
                if (parentMode) {
                  openEditor()
                  return
                }
                void requestUnlock().then((unlocked) => {
                  if (unlocked) openEditor()
                  else setGateNote('Profile editing is locked — a parent must enter Parent Mode.')
                })
              }}
              className="flex min-h-[44px] items-center gap-2 rounded-2xl px-3 text-sm font-extrabold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <PencilLine className="h-4 w-4" aria-hidden="true" />
              Edit current profile
            </button>
            <button
              type="button"
              onClick={() => {
                const openEditor = () => {
                  setOpen(false)
                  setEditing({ mode: 'create', name: '', avatar: '🚀', targetSchool: '' })
                }
                if (parentMode) {
                  openEditor()
                  return
                }
                void requestUnlock().then((unlocked) => {
                  if (unlocked) openEditor()
                  else setGateNote('Creating profiles is locked — a parent must enter Parent Mode.')
                })
              }}
              className="flex min-h-[44px] items-center gap-2 rounded-2xl px-3 text-sm font-extrabold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New profile
            </button>
            {gateNote ? (
              <p className="px-3 text-xs font-bold text-amber-700" role="status">
                {gateNote}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {editing ? (
        <Modal open onClose={() => setEditing(null)} label={editing.mode === 'edit' ? 'Edit profile' : 'New profile'}>
          <div className="w-full rounded-3xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-100 text-xl leading-none">
                {editing.avatar}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  {editing.mode === 'edit' ? 'Edit profile' : 'New profile'}
                </p>
                <h2 className="text-lg font-black text-slate-900">
                  {editing.mode === 'edit' ? editing.name || 'Your profile' : 'Who is practising?'}
                </h2>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-black text-slate-800">Name</span>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
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
                      onClick={() => setEditing({ ...editing, avatar })}
                      aria-pressed={editing.avatar === avatar}
                      className={`grid h-12 w-12 place-items-center rounded-2xl border-2 text-xl transition ${
                        editing.avatar === avatar
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
                  value={editing.targetSchool}
                  onChange={(event) => setEditing({ ...editing, targetSchool: event.target.value })}
                  className="min-h-[48px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 text-base font-bold text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                >
                  <option value="">Not sure yet</option>
                  {TARGET_SCHOOLS.map((school) => (
                    <option key={school} value={school}>
                      {school}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-semibold text-slate-500">
                  Used for motivation only — you can change it any time.
                </span>
              </label>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || editing.name.trim().length === 0}
                className={`${btnPrimaryClass} flex-1 disabled:opacity-60`}
              >
                {saving ? 'Saving...' : 'Save profile'}
              </button>
              <button type="button" onClick={() => setEditing(null)} className={`${btnSecondaryClass} flex-1`}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
