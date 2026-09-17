// Theme management — persisted in localStorage
// Dark mode is default. Light mode applies CSS class to <html>.

export type Theme = 'dark' | 'light'

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return (localStorage.getItem('dm_theme') as Theme) || 'dark'
}

export function setTheme(theme: Theme) {
  localStorage.setItem('dm_theme', theme)
  applyTheme(theme)
}

export function applyTheme(theme: Theme) {
  const html = document.documentElement
  if (theme === 'light') {
    html.setAttribute('data-theme', 'light')
  } else {
    html.removeAttribute('data-theme')
  }
}

export function toggleTheme(): Theme {
  const current = getTheme()
  const next: Theme = current === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}