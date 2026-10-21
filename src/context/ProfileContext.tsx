import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from '../db/database'
import { DEFAULT_PROFILE_ID, type Profile } from '../db/schemas'
import { PROFILES_CHANGED_EVENT } from '../lib/admin'

const ACTIVE_PROFILE_KEY = 'elevenspark.active_profile_id'

interface ProfileContextValue {
  profiles: Profile[]
  activeProfile: Profile | null
  activeProfileId: string
  ready: boolean
  switchProfile: (id: string) => Promise<void>
  updateProfile: (id: string, patch: { name: string; avatar: string; targetSchool: string }) => Promise<void>
  addProfile: (input: { name: string; avatar: string; targetSchool: string }) => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

function readStoredProfileId(): string {
  try {
    return window.localStorage.getItem(ACTIVE_PROFILE_KEY) ?? DEFAULT_PROFILE_ID
  } catch {
    return DEFAULT_PROFILE_ID
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string>(readStoredProfileId)
  const [ready, setReady] = useState(false)

  const persistActive = useCallback((id: string) => {
    setActiveProfileId(id)
    try {
      window.localStorage.setItem(ACTIVE_PROFILE_KEY, id)
    } catch {
      return
    }
  }, [])

  const refresh = useCallback(async () => {
    const rows = await db.profiles.orderBy('createdAt').toArray()
    setProfiles(rows)
    setReady(true)
    if (rows.length > 0 && !rows.some((profile) => profile.id === readStoredProfileId())) {
      persistActive(rows[0]?.id ?? DEFAULT_PROFILE_ID)
    }
    return rows
  }, [persistActive])

  useEffect(() => {
    void refresh()
    const onProfilesChanged = () => {
      void refresh()
    }
    window.addEventListener('elevenspark:profiles-changed', onProfilesChanged)
    return () => window.removeEventListener('elevenspark:profiles-changed', onProfilesChanged)
  }, [refresh])

  const switchProfile = useCallback(
    async (id: string) => {
      const rows = profiles.length > 0 ? profiles : await refresh()
      if (!rows.some((profile) => profile.id === id)) return
      persistActive(id)
    },
    [profiles, refresh, persistActive],
  )

  const updateProfile = useCallback(
    async (id: string, patch: { name: string; avatar: string; targetSchool: string }) => {
      await db.profiles.update(id, {
        name: patch.name.trim().slice(0, 40) || 'Player',
        avatar: patch.avatar,
        targetSchool: patch.targetSchool.trim().slice(0, 80),
        updatedAt: Date.now(),
      })
      window.dispatchEvent(new CustomEvent(PROFILES_CHANGED_EVENT))
      await refresh()
    },
    [refresh],
  )

  const addProfile = useCallback(
    async (input: { name: string; avatar: string; targetSchool: string }) => {
      const now = Date.now()
      const id = `profile-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      await db.profiles.add({
        id,
        name: input.name.trim().slice(0, 40) || 'Player',
        avatar: input.avatar,
        targetSchool: input.targetSchool.trim().slice(0, 80),
        isGuest: false,
        createdAt: now,
        updatedAt: now,
      })
      window.dispatchEvent(new CustomEvent(PROFILES_CHANGED_EVENT))
      await refresh()
      persistActive(id)
    },
    [refresh, persistActive],
  )

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null,
    [profiles, activeProfileId],
  )

  const value = useMemo<ProfileContextValue>(
    () => ({
      profiles,
      activeProfile,
      activeProfileId: activeProfile?.id ?? activeProfileId,
      ready,
      switchProfile,
      updateProfile,
      addProfile,
    }),
    [profiles, activeProfile, activeProfileId, ready, switchProfile, updateProfile, addProfile],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useProfile must be used inside a ProfileProvider.')
  }
  return context
}
