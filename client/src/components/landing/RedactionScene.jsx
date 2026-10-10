import { useEffect, useRef } from 'react'
import { clamp, ease, easeInOut, reducedMotion, seeded, span, watchScroll } from './motion'

// Scene 1: the email fills the screen; as you scroll, a numbered evidence
// marker lands on each secret and a strip of tape seals it off; then its letters loosen and rearrange into the exact request the
// classifier is sent. The text was checked against the real redaction:
// these values come out as [CARD], [ACCOUNT] and [PHONE], and it is not an
// OTP email, so it really does go to the AI.
const SENTENCE = [
  'Your new debit card ',
  { tag: '[CARD]', real: '4523 7811 0492 4829', n: 1 },
  ' for account ',
  { tag: '[ACCOUNT]', real: '50100234567812', n: 2 },
  ' is on its way. Activate it before 20 Oct. Questions? Call ',
  { tag: '[PHONE]', real: '+91 98204 61735', n: 3 },
  '.',
]
const JSON_BEFORE =
  '{\n  "from_domain": "kestrelbank.example",\n  "subject": "Your new debit card is on its way",\n  "latest": {\n    "from_me": false,\n    "text": "'
const JSON_AFTER =
  '"\n  },\n  "earlier": [],\n  "deadline_in_days": 10.6,\n  "gmail_category": "updates",\n  "bulk_sender": true\n}'

// One span per character, words kept unbreakable. mapped marks the JSON
// characters that the letter's own characters fly into.
function renderText(parts, secretAs, mapped, keyPrefix) {
  const out = []
  let word = null
  let n = 0
  const close = () => {
    if (word) out.push(<span className="word" key={`${keyPrefix}w${n++}`}>{word}</span>)
    word = null
  }
  for (const part of parts) {
    if (typeof part === 'string') {
      for (const ch of part) {
        if (/\s/.test(ch)) {
          close()
          out.push(ch)
          continue
        }
        word ??= []
        word.push(
          <span className="c" data-m={mapped ? '1' : undefined} key={`${keyPrefix}c${n++}`}>
            {ch}
          </span>,
        )
      }
    } else {
      word ??= []
      word.push(secretAs(part, `${keyPrefix}s${n++}`))
    }
  }
  close()
  return out
}

const letterSecret = (part, key) => (
  <span className="c secret" key={key}>
    {part.real}
    <span className="ink" aria-hidden="true">
      <span className="tape">
        <span className="tag">{part.tag}</span>
      </span>
    </span>
    <span className="tent" aria-hidden="true">
      {part.n}
    </span>
  </span>
)
const jsonSecret = (mapped) => (part, key) => (
  <b className="c" data-m={mapped ? '1' : undefined} key={key}>
    {part.tag}
  </b>
)

const LETTER = renderText(SENTENCE, letterSecret, false, 'l')
const JSON_TEXT = [
  ...renderText([JSON_BEFORE], jsonSecret(false), false, 'a'),
  ...renderText(SENTENCE, jsonSecret(true), true, 'b'),
  ...renderText([JSON_AFTER], jsonSecret(false), false, 'z'),
]

function Pitch({ className }) {
  return (
    <>
      <h1>Your inbox, sorted. Your secrets never reach the AI.</h1>
      <p>
        Mailmind reads your Gmail with read-only access, removes card numbers, account numbers, OTPs and Aadhaar on
        its own server, and only then lets AI sort what's left.
      </p>
      <div className={`actions ${className ?? ''}`}>
        <a className="signin" href="/api/auth/google">
          Sign in with Google
        </a>
        <a className="link" href="#jev">
          See how it works
        </a>
      </div>
    </>
  )
}

function RedactionScene() {
  const trackRef = useRef(null)
  const stageRef = useRef(null)
  const letterRef = useRef(null)
  const fromRef = useRef(null)
  const bodyRef = useRef(null)
  const hintRef = useRef(null)
  const payloadRef = useRef(null)
  const noteRef = useRef(null)
  const jsonRef = useRef(null)
  const pitchRef = useRef(null)

  useEffect(() => {
    const [track, stage, letter, from, body, hint, payload, note, json, pitch] = [trackRef, stageRef, letterRef, fromRef, bodyRef, hintRef, payloadRef, noteRef, jsonRef, pitchRef].map((r) => r.current)
    const narrow = window.matchMedia('(max-width: 860px)')

    const letterUnits = [...body.querySelectorAll('.c')]
    const secrets = [...body.querySelectorAll('.secret')].map((el) => ({
      el,
      ink: el.querySelector('.ink'),
      tag: el.querySelector('.tag'),
      tent: el.querySelector('.tent'),
    }))
    let k = 0
    const units = [...json.querySelectorAll('.c')].map((el, i) => {
      const r = seeded(i * 7919 + 13)
      return {
        el,
        from: el.dataset.m ? letterUnits[k++] : null,
        delay: r() * 0.25,
        spread: 0.25 + r() * 0.35,
        spawn: { x: r(), y: r() },
      }
    })

    function layout() {
      const stageW = stage.clientWidth
      const stageH = stage.clientHeight
      const pad = narrow.matches ? 16 : 24
      const colLeft = narrow.matches ? pad : Math.round(stageW * 0.5)
      payload.style.left = `${colLeft}px`
      payload.style.width = `${stageW - colLeft - pad}px`
      payload.style.top = `${narrow.matches ? 68 : Math.max(84, (stageH - payload.offsetHeight) / 2)}px`
      letter.style.top = `${Math.max(72, (stageH - letter.offsetHeight) / 2)}px`

      for (const el of letterUnits) el.style.transform = 'none'
      for (const u of units) u.el.style.transform = 'none'
      const area = letter.getBoundingClientRect()
      const center = { x: area.left + area.width / 2, y: area.top + area.height / 2 }
      for (const u of units) {
        const b = u.el.getBoundingClientRect()
        u.b = { x: b.left, y: b.top, h: b.height }
        if (u.from) {
          const a = u.from.getBoundingClientRect()
          u.a = { x: a.left, y: a.top, h: a.height }
        } else {
          // The JSON's own characters rise out of the letter's area.
          u.a = { x: area.left + u.spawn.x * area.width, y: area.top + u.spawn.y * area.height, h: b.height }
        }
        // The text first loosens outward from its centre, then gathers.
        u.c = {
          x: u.a.x + (u.a.x - center.x) * u.spread + (u.b.x - u.a.x) * 0.35,
          y: u.a.y + (u.a.y - center.y) * u.spread + (u.b.y - u.a.y) * 0.35,
        }
      }
    }

    function render(p) {
      const still = reducedMotion()
      const snap = (t) => (still ? (t > 0.5 ? 1 : 0) : t)

      // 1. One secret after another, 8%–52% of the scroll: its marker drops,
      // then the tape seals it.
      secrets.forEach((x, i) => {
        const a = 0.08 + i * 0.14
        const drop = snap(span(p, a - 0.05, a))
        x.tent.style.opacity = Math.min(span(drop, 0, 0.3), 1 - span(p, 0.56, 0.62))
        x.tent.style.transform = `translateY(${-1.6 * (1 - ease(drop))}em) rotate(${-14 * (1 - ease(drop))}deg)`
        const t = snap(span(p, a, a + 0.12))
        x.ink.style.transform = `scaleX(${ease(t)})`
        x.tag.style.opacity = span(t, 0.75, 1)
        x.el.classList.toggle('gone', t >= 1)
      })
      hint.style.opacity = 1 - span(p, 0.04, 0.12)
      from.style.opacity = 1 - span(p, 0.56, 0.62)

      // 2. 58%–86%: every character travels to its place in the JSON.
      const m = span(p, 0.58, 0.86)
      for (const u of units) {
        if (!u.a) continue
        const t = snap(clamp((m - u.delay) / 0.75))
        const e = easeInOut(t)
        const x = (1 - e) * (1 - e) * u.a.x + 2 * (1 - e) * e * u.c.x + e * e * u.b.x
        const y = (1 - e) * (1 - e) * u.a.y + 2 * (1 - e) * e * u.c.y + e * e * u.b.y
        if (u.from) {
          // The letter's own character travels, then hands over to the JSON one.
          const scale = 1 + (u.b.h / u.a.h - 1) * e
          u.from.style.transform = t > 0 ? `translate(${x - u.a.x}px, ${y - u.a.y}px) scale(${scale})` : 'none'
          const land = span(t, 0.9, 1)
          u.from.style.opacity = 1 - land
          u.el.style.opacity = land
        } else {
          u.el.style.transform = t < 1 ? `translate(${x - u.b.x}px, ${y - u.b.y}px)` : 'none'
          u.el.style.opacity = span(t, 0.2, 0.6)
        }
      }
      json.style.borderColor = `rgba(0, 0, 0, ${0.11 * span(p, 0.84, 0.9)})`
      note.style.opacity = span(p, 0.82, 0.9)
      pitch.style.opacity = span(p, 0.84, 0.94)
      pitch.classList.toggle('live', p > 0.88)
    }

    const stop = watchScroll(track, render, layout)
    narrow.addEventListener?.('change', layout)
    return () => {
      stop()
      narrow.removeEventListener?.('change', layout)
    }
  }, [])

  return (
    <>
      <div className="track" id="story" ref={trackRef}>
        <div className="stage" ref={stageRef}>
          <article className="letter" ref={letterRef} aria-label="Example email from a bank about a new debit card">
            <p className="from" ref={fromRef}>
              Kestrel Bank, 9:41 am
            </p>
            <p className="body" ref={bodyRef}>
              {LETTER}
            </p>
            <p className="hint" ref={hintRef}>
              Scroll, and watch the secrets disappear before any AI reads this email.
            </p>
          </article>

          <section className="payload" ref={payloadRef} aria-label="What the AI is sent">
            <p className="note" ref={noteRef}>
              The same email, as the AI receives it to sort. The real digits were dropped on our server and never
              stored.
            </p>
            <pre ref={jsonRef}>{JSON_TEXT}</pre>
          </section>

          <section className="pitch" ref={pitchRef}>
            <Pitch />
          </section>
        </div>
      </div>

      <section className="pitch-flow">
        <Pitch />
      </section>
    </>
  )
}

export default RedactionScene
