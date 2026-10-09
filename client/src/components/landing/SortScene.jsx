import { useEffect, useRef } from 'react'
import { clamp, ease, reducedMotion, settle, span, watchScroll } from './motion'

// Scene 3: emails fall into the four sections of the Today view, where the
// app's rules would put them. Everything else is counted, not shown.
// Dates are for Saturday 10 October 2026, the day of the scene 1 email.
const BUCKETS = [
  ['urgent', 'Urgent'],
  ['action', 'Needs action'],
  ['coming', 'Coming up'],
  ['rest', 'Everything else'],
]
const MAIL = [
  { b: 'action', who: 'Kestrel Bank', what: 'Your new debit card is on its way', due: 'Due Tue 20 Oct', ours: true },
  { b: 'urgent', who: 'Northwind Accounts', what: 'New sign-in to your account', due: 'Today' },
  { b: 'action', who: 'Prof. R. Mehta', what: 'Assignment 4: Operating Systems', due: 'Due Mon 12 Oct' },
  { b: 'coming', who: 'Acme Labs Recruiting', what: 'Interview on Google Meet', due: 'Fri 16 Oct, 3 PM' },
]
const REST = 9

function SortScene() {
  const track = useRef(null)
  const restNote = useRef(null)
  const foot = useRef(null)

  useEffect(() => {
    const root = track.current
    const heads = [...root.querySelectorAll('.bucket-head')]
    const counts = Object.fromEntries([...root.querySelectorAll('.bucket')].map((el) => [el.dataset.bucket, el.querySelector('.count')]))
    // Each card's place in its column, counted in MAIL's order.
    const slots = {}
    const slotOf = MAIL.map((m) => (slots[m.b] = (slots[m.b] ?? -1) + 1))
    const cards = [...root.querySelectorAll('.mail-card')].map((el) => {
      const i = Number(el.dataset.i)
      const m = MAIL[i]
      // Ours lands first and alone, then the others, one at a time.
      return { el, m, slot: slotOf[i], start: m.ours ? 0.1 : 0.3 + (i - 1) * 0.1, tilt: i % 2 ? 3 : -3 }
    })
    const lines = [...root.querySelectorAll('.rest-line')].map((el, i) => ({ el, start: 0.32 + i * 0.045 }))
    let cardH = 70

    const layout = () => {
      cardH = Math.max(...cards.map((c) => c.el.offsetHeight)) + 12
    }
    const render = (p) => {
      const still = reducedMotion()
      heads.forEach((h, i) => {
        h.style.transform = `scaleX(${still ? 1 : ease(span(p, 0.02 + i * 0.02, 0.1 + i * 0.02))})`
      })
      const landed = { urgent: 0, action: 0, coming: 0, rest: 0 }
      for (const c of cards) {
        const t = still ? (p > c.start ? 1 : 0) : span(p, c.start, c.start + 0.08)
        const k = settle(t, 6, 2.2)
        c.el.style.transform = `translateY(${c.slot * cardH - 120 * (1 - k)}px) rotate(${c.tilt * (1 - k)}deg)`
        c.el.style.opacity = clamp(t / 0.35)
        if (t >= 0.6) landed[c.m.b] += 1
      }
      for (const l of lines) {
        const t = still ? (p > l.start ? 1 : 0) : ease(span(p, l.start, l.start + 0.04))
        l.el.style.transform = `scaleX(${t})`
        if (t >= 0.6) landed.rest += 1
      }
      for (const key of Object.keys(counts)) counts[key].textContent = landed[key]
      restNote.current.style.opacity = span(p, 0.74, 0.8)
      foot.current.style.opacity = span(p, 0.8, 0.88)
    }
    return watchScroll(root, render, layout)
  }, [])

  return (
    <div className="track3" ref={track}>
      <div className="stage3">
        <div className="sort-head">
          <h2>Then each email lands where it belongs.</h2>
          <p>Promotions and newsletters are counted, not shown.</p>
        </div>
        <div className="buckets">
          {BUCKETS.map(([key, title]) => (
            <section className="bucket" data-bucket={key} key={key}>
              <div className="bucket-head">
                <h3>{title}</h3>
                <span className="count">0</span>
              </div>
              <div className="bucket-body">
                {key === 'rest' ? (
                  <>
                    {Array.from({ length: REST }, (_, i) => (
                      <div className="rest-line" style={{ top: `${i * 10}px` }} key={i} />
                    ))}
                    <p className="rest-note" ref={restNote} style={{ top: `${REST * 10 + 8}px` }}>
                      Promotions, newsletters, receipts.
                    </p>
                  </>
                ) : (
                  MAIL.map((m, i) =>
                    m.b === key ? (
                      <article className={`mail-card${m.ours ? ' ours' : ''}`} data-i={i} key={m.what}>
                        <div className="who">{m.who}</div>
                        <div className="what">{m.what}</div>
                        {m.due && <span className="due">{m.due}</span>}
                      </article>
                    ) : null,
                  )
                )}
              </div>
            </section>
          ))}
        </div>
        <p className="sort-foot" ref={foot}>
          Example emails; the senders are made up.
        </p>
      </div>
    </div>
  )
}

export default SortScene
