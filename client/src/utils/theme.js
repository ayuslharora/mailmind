// Light or dark. With no choice saved, the page follows the device's
// setting; a choice is kept in this browser.
const KEY = 'mailmind:theme'

export function savedTheme() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme
  else delete document.documentElement.dataset.theme
}

export function isDark() {
  const theme = document.documentElement.dataset.theme
  return theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Private windows can refuse storage; the choice then lasts this visit.
  }
  applyTheme(theme)
}
