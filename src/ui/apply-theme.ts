import type { ThemeMode } from '../storage/settings'

export function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement
  if (theme === 'auto') {
    root.removeAttribute('data-theme')
    return
  }
  root.setAttribute('data-theme', theme)
}
