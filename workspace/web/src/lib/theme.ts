// Light / dark theme. The choice is stored per browser; "system" follows the OS setting.
import { useSyncExternalStore } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

const media = window.matchMedia('(prefers-color-scheme: dark)')
let pref: ThemePref = (localStorage.getItem('lab.theme') as ThemePref) ?? 'system'
const subs = new Set<() => void>()

export const resolvedTheme = (): Theme => (pref === 'system' ? (media.matches ? 'dark' : 'light') : pref)

function apply() {
  document.documentElement.dataset.theme = resolvedTheme()
  subs.forEach((f) => f())
}
media.addEventListener('change', () => pref === 'system' && apply())
apply()

export function setThemePref(p: ThemePref) {
  pref = p
  localStorage.setItem('lab.theme', p)
  apply()
}
export const toggleTheme = () => setThemePref(resolvedTheme() === 'dark' ? 'light' : 'dark')
export const getThemePref = () => pref

export function onThemeChange(f: () => void) { subs.add(f); return () => subs.delete(f) }
export function useTheme(): Theme {
  return useSyncExternalStore(onThemeChange, resolvedTheme)
}

/** Terminal colors that match each theme. */
export const terminalTheme = (t: Theme) => t === 'dark'
  ? { background: '#0f1218', foreground: '#dfe4ef', cursor: '#7aa7ff', selectionBackground: '#2a3550' }
  : { background: '#fbfbfc', foreground: '#1d2330', cursor: '#2f6bff', selectionBackground: '#cfdcff', black: '#1d2330', white: '#7a8296', brightWhite: '#3a4152' }
