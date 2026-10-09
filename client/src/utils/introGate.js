// The landing intro plays once per browser tab, and only when the landing
// page is the first page opened in that tab. Imported at start-up, so the
// first page is recorded even when it is not the landing page. sessionStorage
// is per tab: a reload in the same tab skips the intro.
const KEY = 'mailmind:intro-seen'

let pending = false
try {
  pending = sessionStorage.getItem(KEY) !== '1' && window.location.pathname === '/'
  sessionStorage.setItem(KEY, '1')
} catch {
  // Storage blocked: never risk replaying the intro on every visit.
  pending = false
}

export const introPending = () => pending
export const introDone = () => {
  pending = false
}

export function replayIntro() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
  window.location.assign('/')
}
