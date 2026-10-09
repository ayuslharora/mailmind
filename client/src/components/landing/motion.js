// Small helpers shared by the landing page's scroll scenes.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const ease = (t) => 1 - Math.pow(1 - t, 3)
export const easeIn = (t) => t * t
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
// Where p sits between a and b, from 0 to 1.
export const span = (p, a, b) => clamp((p - a) / (b - a))
// A needle settling: overshoots a little, swings back, rests on 1.
export const settle = (t, damping = 5.5, swing = 2.4) =>
  t >= 1 ? 1 : 1 - Math.exp(-damping * t) * Math.cos(swing * Math.PI * t)

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// A repeatable random number generator, so scrolling back retraces a path.
export function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Calls render(progress) once per frame while the page scrolls, where
// progress runs from 0 at the top of the track to 1 at its end. layout runs
// first, and again on resize and once the fonts have loaded. Returns a
// function that stops watching.
export function watchScroll(track, render, layout = () => {}) {
  let queued = false
  let alive = true
  const progress = () => {
    const total = track.offsetHeight - window.innerHeight
    return total > 0 ? clamp(-track.getBoundingClientRect().top / total) : 0
  }
  const frame = () => {
    queued = false
    if (alive) render(progress())
  }
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(frame)
  }
  const relayout = () => {
    if (!alive) return
    layout()
    render(progress())
  }
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', relayout)
  document.fonts?.ready.then(relayout)
  relayout()
  return () => {
    alive = false
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', relayout)
  }
}
