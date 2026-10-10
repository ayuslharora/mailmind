import { useEffect, useRef } from 'react'
import typesafeMark from '../../assets/typesafe-mark.png'
import { clamp, ease, reducedMotion, settle, span, watchScroll } from './motion'

// Scene 2: each answer settles like a needle against the threshold where
// Mailmind acts, then resolves into words; the verdict assembles from them.
// Figures are Jev's real output (jev-1.13) for the scene 1 email; thresholds
// are the app's own (SECURITY_P, NEEDS_ACTION_P, URGENT, DATE_KIND_P).
const URGENCY = 1.64 / 4
const CATEGORIES = [
  ['Notifications', 0.55, true],
  ['Finance', 0.45],
  ['Academic', 0],
  ['Jobs', 0],
  ['Personal', 0],
  ['Promotions', 0],
]

// A bar is taped yellow where Mailmind acts on it: the winning category, or
// a score past its threshold.
function Meter({ name, p, cut, win }) {
  const acts = win || (cut !== undefined && p >= cut)
  return (
    <div className={`row${win ? ' win' : ''}${acts ? ' acts' : ''}`}>
      <span className="name">{name}</span>
      <div className="track-line">
        <div className="fill" data-p={p} />
        {cut !== undefined && <div className="cut" style={{ left: `${cut * 100}%` }} />}
      </div>
      <span className="num" data-p={p}>
        0%
      </span>
    </div>
  )
}

function Question({ title, answer, children, note }) {
  return (
    <div className="q">
      <div className="q-head">
        <h3>{title}</h3>
        <span className="verdict-word">{answer}</span>
      </div>
      {children}
      {note && <p className="note2">{note}</p>}
    </div>
  )
}

function JevScene() {
  const track = useRef(null)
  const marker = useRef(null)
  const verdict = useRef(null)
  const vAction = useRef(null)
  const vDue = useRef(null)

  useEffect(() => {
    const rows = [...track.current.querySelectorAll('.q')]
    const render = (p) => {
      const still = reducedMotion()
      let current = -1
      rows.forEach((row, i) => {
        const a = 0.06 + i * 0.13
        const show = still ? (p > a ? 1 : 0) : ease(span(p, a, a + 0.05))
        row.style.opacity = show
        row.style.transform = `translateY(${12 * (1 - show)}px)`
        const t = still ? (p > a ? 1 : 0) : span(p, a + 0.03, a + 0.12)
        const k = settle(t)
        row.querySelectorAll('.fill').forEach((f) => {
          // Clipped, not scaled, so the stripes on a taped bar keep their angle.
          f.style.clipPath = `inset(0 ${100 - clamp(Number(f.dataset.p) * k) * 100}% 0 0)`
        })
        row.querySelectorAll('.num').forEach((n) => {
          n.textContent = `${Math.round(clamp(Number(n.dataset.p) * k) * 100)}%`
        })
        row.querySelectorAll('.cut').forEach((c) => {
          c.style.opacity = span(t, 0, 0.3)
        })
        if (row.contains(marker.current)) {
          const line = marker.current.parentElement.clientWidth - marker.current.offsetWidth
          marker.current.style.left = `${line * clamp(URGENCY * k)}px`
        }
        row.querySelector('.verdict-word').style.opacity = span(t, 0.85, 1)
        if (t > 0 && t < 1) current = i
        row.dataset.done = t >= 1 ? '1' : ''
      })
      // Earlier answers step back while the current one settles.
      const last = 0.06 + (rows.length - 1) * 0.13 + 0.12
      rows.forEach((row, i) => row.classList.toggle('past', p < last && current > i))

      const stamp = still ? (p > 0.8 ? 1 : 0) : ease(span(p, 0.78, 0.86))
      verdict.current.style.opacity = stamp
      verdict.current.style.transform = `scale(${1.22 - 0.22 * stamp}) rotate(${-1.5 * (1 - stamp)}deg)`
      vAction.current.classList.toggle('on', rows[2].dataset.done === '1')
      vDue.current.classList.toggle('on', rows[4].dataset.done === '1')
    }
    return watchScroll(track.current, render)
  }, [])

  return (
    <div className="track2" id="jev" ref={track}>
      <div className="stage2">
        <div className="jev">
          <div className="jev-intro">
            <div className="jev-id">
              <img src={typesafeMark} alt="TypeSafe" />
              <strong>Jev</strong>
              <span>a decision model by TypeSafe</span>
            </div>
            <h2>Jev reads the request and answers five questions.</h2>
            <div className="sees">
              <p className="label">What Jev sees</p>
              <code>
                "Your new debit card <b>[CARD]</b> for account <b>[ACCOUNT]</b> is on its way. Activate it before 20
                Oct. Questions? Call <b>[PHONE]</b>."{'\n'}deadline_in_days: 10.6
              </code>
            </div>
            <div className="verdict-wrap">
              <div className="verdict" ref={verdict}>
                <span ref={vAction}>Needs action,</span>
                <span ref={vDue}>due Tue 20 Oct</span>
              </div>
            </div>
          </div>

          <div className="answers">
            <Question title="Is this a security email?" answer="No" note="Mailmind treats an email as security from 30%.">
              <Meter name="Security" p={0.19} cut={0.3} />
            </Question>
            <Question
              title="What kind of email is it?"
              answer="Notifications"
              note="Jev is torn between two, and says so. Mailmind takes the larger."
            >
              {CATEGORIES.map(([name, p, win]) => (
                <Meter key={name} name={name} p={p} win={win} />
              ))}
            </Question>
            <Question title="Does it need you to do something?" answer="Yes" note="Mailmind asks you to act from 60%.">
              <Meter name="Needs action" p={0.94} cut={0.6} />
            </Question>
            <Question title="How urgent is it?" answer="Not urgent" note="Jev scores 1.6 of 4. Urgent starts at 3.">
              <div className="scale">
                <div className="scale-line">
                  <div className="marker" ref={marker} />
                  <div className="cut" style={{ left: '75%' }} />
                </div>
                <div className="scale-ticks">
                  <span>Ignore</span>
                  <span>Sometime</span>
                  <span>This week</span>
                  <span>Today</span>
                  <span>Now</span>
                </div>
              </div>
            </Question>
            <Question
              title="Is there a date to act by?"
              answer="Deadline, Tue 20 Oct"
              note={'The date comes from "before 20 Oct", read on our server: 10.6 days away.'}
            >
              <Meter name="Deadline" p={1} cut={0.5} />
            </Question>
          </div>
        </div>
      </div>
    </div>
  )
}

export default JevScene
