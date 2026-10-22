import { registerSW } from 'virtual:pwa-register'

/**
 * Registo do service worker.
 *
 * O registo vive aqui (e não dentro do `UpdateBanner`) por uma razão concreta:
 * o `UpdateBanner` é desenhado dentro do `AppShell`, e o `AppShell` só existe
 * **depois** do ecrã de boas-vindas. Se o registo ficasse no banner, um
 * utilizador novo ficaria sem service worker — portanto sem modo offline e sem
 * possibilidade de instalar a app — até acabar o onboarding.
 *
 * O `main.tsx` chama `registerServiceWorker()` logo no arranque, por isso o
 * estado do PWA é sempre registado, em qualquer ecrã.
 */

export type PwaState = 'none' | 'offline-ready' | 'update-available'

let currentState: PwaState = 'none'
const listeners = new Set<(state: PwaState) => void>()

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null
let registered = false

function setState(next: PwaState): void {
  currentState = next
  for (const listener of listeners) listener(next)
}

export function getPwaState(): PwaState {
  return currentState
}

export function subscribePwaState(listener: (state: PwaState) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Fecha o aviso ("Got it") sem voltar a mostrar. */
export function dismissPwaState(): void {
  setState('none')
}

/** Regista o service worker. Seguro de chamar várias vezes. */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  if (registered) return
  registered = true

  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh: () => setState('update-available'),
    onOfflineReady: () => setState('offline-ready'),
    onRegisterError: () => {
      // Uma falha de registo nunca pode partir a app.
    },
  })
}

/** Activa a versão nova do service worker e recarrega. */
export function applyServiceWorkerUpdate(): void {
  void applyUpdate?.(true)
  window.setTimeout(() => window.location.reload(), 300)
}
