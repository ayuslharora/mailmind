import { useEffect, useRef } from 'react'
import { clamp, ease, easeIn, reducedMotion, span, watchScroll } from './motion'

// Scene 5: the tape that sealed secrets in scene 1 strikes through each
// thing Mailmind stored, then shreds it. The list and its order follow
// server/utils/deleteAccount.js (and the sync stop in deleteMe).
const STORED = [
  ['Any sync that is running', 'Stopped'],
  ["Mailmind's access to your Gmail", 'Revoked with Google'],
  ['Redacted copies of your emails', 'Deleted'],
  ["Jev's answers, and your Done, Snooze and corrections", 'Deleted'],
  ['Search passages, the dots on the map', 'Deleted'],
  ['Your sender rules', 'Deleted'],
  ['Your account and its encrypted Gmail token', 'Deleted'],
]
const STRIPS = 14

function DeleteScene() {
  const track = useRef(null)
  const button = useRef(null)
  const nothing = useRef(null)

  useEffect(() => {
    const items = [...track.current.querySelectorAll('.item')].map((el, i) => {
      const text = el.querySelector('.text')
      return {
        text,
        state: el.querySelector('.state'),
        shred: el.querySelector('.shred'),
        // Each strip falls at its own speed and tilt.
        strips: [...el.querySelectorAll('.shred i')].map((strip, k) => ({
          el: strip,
          fall: 40 + ((k * 53 + i * 31) % 70),
          tilt: ((k * 29 + i * 7) % 24) - 12,
          lag: ((k * 17) % 10) / 40,
        })),
        start: 0.2 + i * 0.075,
      }
    })
    const end = items[items.length - 1].start + 0.12

    const layout = () => {
      for (const it of items) {
        const w = it.text.getBoundingClientRect().width + 8
        it.shred.style.width = `${w}px`
        it.strips.forEach((s, k) => {
          s.el.style.width = `${w / STRIPS + 0.5}px`
          // Line the stripes up across the strips, so it reads as one piece of tape.
          s.el.style.backgroundSize = `${w}px 100%`
          s.el.style.backgroundPosition = `${(-k * w) / STRIPS}px 0`
        })
      }
    }
    const render = (p) => {
      const still = reducedMotion()
      button.current.classList.toggle('pressed', p > 0.15)
      for (const it of items) {
        // Strike (the bar is drawn left to right), then shred (strips fall away).
        const strike = still ? (p > it.start ? 1 : 0) : span(p, it.start, it.start + 0.035)
        const shred = still ? (p > it.start + 0.04 ? 1 : 0) : span(p, it.start + 0.04, it.start + 0.11)
        it.strips.forEach((s, k) => {
          const on = clamp(strike * STRIPS - k)
          const t = easeIn(clamp((shred - s.lag) / (1 - s.lag)))
          s.el.style.transform = `translateY(${s.fall * t}px) rotate(${s.tilt * t}deg) scaleX(${on})`
          s.el.style.opacity = 1 - t
        })
        it.text.style.color = strike >= 1 ? 'transparent' : ''
        it.state.style.opacity = span(shred, 0.5, 1)
      }
      nothing.current.style.opacity = ease(span(p, end, end + 0.05))
    }
    return watchScroll(track.current, render, layout)
  }, [])

  return (
    <div className="track5" ref={track}>
      <div className="stage5">
        <div className="del-copy">
          <h2>Leave whenever you want. Everything goes.</h2>
          <p>
            One button stops Mailmind reading your mail, gives back its access to Gmail, and deletes everything it
            stored about you. Your emails in Gmail are never touched.
          </p>
          <span className="del-btn" ref={button}>
            Delete all my data
          </span>
        </div>
        <div>
          <div className="stored">
            {STORED.map(([text, state]) => (
              <div className="item" key={text}>
                <span className="text">
                  {text}
                  <span className="shred" aria-hidden="true">
                    {Array.from({ length: STRIPS }, (_, k) => (
                      <i key={k} />
                    ))}
                  </span>
                </span>
                <span className="state">{state}</span>
              </div>
            ))}
          </div>
          <p className="nothing" ref={nothing}>
            Nothing left.
          </p>
        </div>
      </div>
    </div>
  )
}

export default DeleteScene
