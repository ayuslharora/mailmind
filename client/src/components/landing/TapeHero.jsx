import { useEffect, useRef } from 'react'
import { clamp, reducedMotion } from './motion'

// The opening: two strips of police tape are pulled across the screen and
// snap tight around the name, then hang and move in the wind. Each strip is a
// chain of points (verlet) pinned off screen at both ends; it twists so you
// see its back, and the cursor pushes it.
const STRIPS = [
  { a: [-0.05, 0.16], b: [1.05, 0.36], text: 'Mailmind  ·  Private  ·  Not for AI  ·  ', delay: 0.25, phase: 0 },
  { a: [-0.05, 0.9], b: [1.05, 0.76], text: 'Do not cross  ·  No secrets past this line  ·  ', delay: 0.7, phase: 2.1 },
]
const N = 64
const PUSH_RADIUS = 70
const backOut = (t) => 1 + 2.9 * Math.pow(t - 1, 3) + 1.9 * Math.pow(t - 1, 2)

// One repeat of the printed tape, drawn once and then sliced along the strip.
function printTape(text, h) {
  const k = Math.min(2, window.devicePixelRatio || 1)
  const c = document.createElement('canvas')
  const x = c.getContext('2d')
  const setFont = () => {
    x.font = `800 ${Math.round(h * 0.42)}px Archivo, "Arial Narrow", sans-serif`
    if ('fontStretch' in x) x.fontStretch = 'condensed'
    if ('letterSpacing' in x) x.letterSpacing = `${(h * 0.06).toFixed(1)}px`
  }
  const label = text.toUpperCase()
  setFont()
  const w = Math.ceil(x.measureText(label).width)
  c.width = w * k
  c.height = h * k
  x.scale(k, k)
  const sheen = x.createLinearGradient(0, 0, 0, h)
  sheen.addColorStop(0, '#FFE35C')
  sheen.addColorStop(0.46, '#FFD21F')
  sheen.addColorStop(1, '#EDBB00')
  x.fillStyle = sheen
  x.fillRect(0, 0, w, h)
  x.fillStyle = 'rgba(0, 0, 0, 0.12)'
  x.fillRect(0, 0, w, 1)
  x.fillRect(0, h - 1, w, 1)
  setFont()
  x.fillStyle = '#0E0E0C'
  x.textBaseline = 'middle'
  x.fillText(label, 0, h / 2 + 1)
  return { c, w, h, k }
}

function TapeHero({ onVisible }) {
  const heroRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const hero = heroRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const still = reducedMotion()
    const strips = STRIPS.map((s) => ({ ...s }))
    let W = 0
    let H = 0
    let dpr = 1
    let pointer = null
    let born = null
    let visible = false
    let raf = 0

    const layout = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      W = hero.clientWidth
      H = hero.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      const h = W < 600 ? 26 : 36
      for (const s of strips) {
        s.A = { x: s.a[0] * W, y: s.a[1] * H }
        s.B = { x: s.b[0] * W, y: s.b[1] * H }
        s.h = h
        s.print = printTape(s.text, h)
        if (!s.p) {
          // Bunched at the left end; the pull stretches it across.
          s.p = Array.from({ length: N }, () => ({ ...s.A }))
          s.q = s.p.map((pt) => ({ ...pt }))
        }
      }
    }

    const step = (t) => {
      for (const s of strips) {
        const e = still ? 1 : backOut(clamp((t - born - s.delay) / 0.95))
        const end = { x: s.A.x + (s.B.x - s.A.x) * e, y: s.A.y + (s.B.y - s.A.y) * e }
        const rest = Math.hypot(end.x - s.A.x, end.y - s.A.y) / (N - 1)
        const { p: P, q: Q } = s
        for (let i = 1; i < N - 1; i++) {
          const mid = Math.sin((Math.PI * i) / (N - 1))
          const wind = still ? 0 : (Math.sin(t * 1.7 + i * 0.28 + s.phase) * 0.6 + Math.sin(t * 0.63 + s.phase) * 0.4) * 0.06 * mid
          const vx = (P[i].x - Q[i].x) * 0.94
          const vy = (P[i].y - Q[i].y) * 0.94
          Q[i].x = P[i].x
          Q[i].y = P[i].y
          P[i].x += vx
          P[i].y += vy + 0.03 + wind
          if (pointer) {
            const dx = P[i].x - pointer.x
            const dy = P[i].y - pointer.y
            const d = Math.hypot(dx, dy)
            if (d < PUSH_RADIUS && d > 0.01) {
              const push = ((PUSH_RADIUS - d) / d) * 0.5
              P[i].x += dx * push
              P[i].y += dy * push
            }
          }
        }
        P[0].x = s.A.x
        P[0].y = s.A.y
        P[N - 1].x = end.x
        P[N - 1].y = end.y
        for (let it = 0; it < 40; it++) {
          for (let i = 0; i < N - 1; i++) {
            const a = P[i]
            const b = P[i + 1]
            const dx = b.x - a.x
            const dy = b.y - a.y
            const d = Math.hypot(dx, dy) || 0.001
            const diff = (d - rest) / d
            // Pinned ends do not move; the free side takes the whole correction.
            const fa = i === 0 ? 0 : 1
            const fb = i + 1 === N - 1 ? 0 : 1
            const share = fa + fb || 1
            a.x += (dx * diff * fa) / share
            a.y += (dy * diff * fa) / share
            b.x -= (dx * diff * fb) / share
            b.y -= (dy * diff * fb) / share
          }
        }
      }
    }

    const draw = (s, t) => {
      const P = s.p
      const hw = s.h / 2
      const tape = s.print
      // How far each point is turned: 1 faces you, 0 is edge on, below 0 is its back.
      const turn = P.map((_, i) => {
        if (still) return 1
        const mid = Math.sin((Math.PI * i) / (N - 1))
        return Math.cos((0.62 * Math.sin(t * 1.15 + i * 0.16 + s.phase) + 0.3 * Math.sin(t * 2.6 - i * 0.29)) * mid * 0.8)
      })
      const normal = P.map((_, i) => {
        const a = P[Math.max(0, i - 1)]
        const b = P[Math.min(N - 1, i + 1)]
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1
        return { x: -(b.y - a.y) / d, y: (b.x - a.x) / d }
      })
      // Its shadow on the ground.
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
      ctx.shadowBlur = 18
      ctx.shadowOffsetY = 16
      ctx.fillStyle = '#000'
      ctx.beginPath()
      P.forEach((pt, i) => {
        const o = hw * Math.abs(turn[i])
        ctx[i ? 'lineTo' : 'moveTo'](pt.x + normal[i].x * o, pt.y + normal[i].y * o)
      })
      for (let i = N - 1; i >= 0; i--) {
        const o = hw * Math.abs(turn[i])
        ctx.lineTo(P[i].x - normal[i].x * o, P[i].y - normal[i].y * o)
      }
      ctx.fill()
      ctx.restore()
      // The tape itself, slice by slice.
      let along = 0
      for (let i = 0; i < N - 1; i++) {
        const a = P[i]
        const b = P[i + 1]
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        if (len < 0.01) continue
        const c = (turn[i] + turn[i + 1]) / 2
        ctx.save()
        ctx.translate(a.x, a.y)
        ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x))
        ctx.scale(1, Math.abs(c) < 0.02 ? 0.02 : c)
        let sx = along % tape.w
        let left = len + 0.9
        let dx = 0
        while (left > 0) {
          const w = Math.min(left, tape.w - sx)
          ctx.drawImage(tape.c, sx * tape.k, 0, w * tape.k, tape.h * tape.k, dx, -hw, w, s.h)
          left -= w
          dx += w
          sx = 0
        }
        // Darker as it turns away from you, darker still on its back.
        const shade = (1 - Math.abs(c)) * 0.45 + (c < 0 ? 0.2 : 0)
        if (shade > 0.01) {
          ctx.fillStyle = `rgba(40, 28, 0, ${shade})`
          ctx.fillRect(0, -hw, len + 0.9, s.h)
        }
        ctx.restore()
        along += len
      }
    }

    const frame = (now) => {
      raf = 0
      const t = now / 1000
      // The pull waits until the intro has lifted.
      if (born === null && !document.body.classList.contains('intro-on')) born = t
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      if (born !== null) {
        step(t)
        for (const s of strips) draw(s, t)
      }
      if (visible && !still) raf = requestAnimationFrame(frame)
    }

    const aim = (e) => {
      const r = hero.getBoundingClientRect()
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const leave = () => {
      pointer = null
    }
    hero.addEventListener('pointermove', aim)
    hero.addEventListener('pointerdown', aim)
    hero.addEventListener('pointerleave', leave)

    layout()
    if (still) {
      born = 0
      for (let i = 0; i < 400; i++) step(10)
      frame(0)
    }
    const resized = new ResizeObserver(() => {
      layout()
      if (still) frame(0)
    })
    resized.observe(hero)
    document.fonts?.ready.then(() => {
      for (const s of strips) s.print = printTape(s.text, s.h)
      if (still) frame(0)
    })
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      onVisible?.(visible)
      if (visible && !still && !raf) raf = requestAnimationFrame(frame)
    })
    seen.observe(hero)

    return () => {
      cancelAnimationFrame(raf)
      visible = false
      resized.disconnect()
      seen.disconnect()
      hero.removeEventListener('pointermove', aim)
      hero.removeEventListener('pointerdown', aim)
      hero.removeEventListener('pointerleave', leave)
    }
  }, [onVisible])

  return (
    <section className="hero" ref={heroRef}>
      <div className="glow red" aria-hidden="true" />
      <div className="glow amber" aria-hidden="true" />
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="hero-in">
        <p className="kicker">Gmail assistant · invite-only</p>
        <h1 className="hero-name">Mailmind</h1>
        <p className="tagline">Sorts your Gmail with AI, and keeps your card numbers, OTPs and Aadhaar out of it.</p>
        <div className="ctas">
          <a className="signin" href="/api/auth/google">
            Sign in with Google
          </a>
          <a className="ghost" href="#story">
            See how it works
          </a>
        </div>
      </div>
      <p className="hint">Push the tape with your cursor</p>
    </section>
  )
}

export default TapeHero
