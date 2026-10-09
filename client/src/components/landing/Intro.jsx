import { useEffect, useRef, useState } from 'react'
import { introDone, introPending } from '../../utils/introGate'
import { reducedMotion } from './motion'

// The name changes typeface on black, a white bar redacts it, a panel of
// placeholders rises, and everything lifts away. Once per tab.
const FORMS = [
  { font: '800 1em Archivo', stretch: '62%' },
  { font: 'italic 400 1.15em Newsreader' },
  { font: '400 0.9em "JetBrains Mono"' },
  { font: '200 1em Archivo', stretch: '125%' },
  { font: '400 1.2em UnifrakturMaguntia' },
  { font: 'italic 600 1em Archivo', stretch: '100%' },
  { font: '500 0.85em "JetBrains Mono"', text: '[MAILMIND]' },
  { font: '800 1.05em Archivo', stretch: '75%' },
]
const STEP_MS = 170
const FACES = ['800 20px Archivo', 'italic 400 20px Newsreader', '400 20px "JetBrains Mono"', '400 20px UnifrakturMaguntia']
const PLACEHOLDERS = Array(400).fill('[OTP] [CARD] [PHONE] [AADHAAR] [PAN] [LINK]').join(' ')

function Intro() {
  const [show, setShow] = useState(() => introPending() && !reducedMotion())
  const overlay = useRef(null)
  const word = useRef(null)
  const text = useRef(null)

  useEffect(() => {
    if (!show) return undefined
    const timers = []
    const later = (ms, fn) => timers.push(setTimeout(fn, ms))
    let done = false
    document.body.classList.add('intro-on')
    window.scrollTo(0, 0)

    const finish = () => {
      if (done) return
      done = true
      timers.forEach(clearTimeout)
      introDone()
      overlay.current?.classList.add('lift')
      document.body.classList.remove('intro-on')
      timers.push(setTimeout(() => setShow(false), 800))
    }
    const showForm = (f) => {
      word.current.style.font = f.font
      word.current.style.fontStretch = f.stretch ?? '100%'
      text.current.textContent = f.text ?? 'Mailmind'
    }
    const start = () => {
      if (done) return
      FORMS.forEach((f, i) => later(i * STEP_MS, () => showForm(f)))
      const end = FORMS.length * STEP_MS + 120
      later(end, () => word.current?.classList.add('redacted'))
      later(end + 520, () => overlay.current?.classList.add('rise'))
      later(end + 1080, finish)
    }
    // Wait briefly for the faces, so no form flashes in a fallback font.
    Promise.race([
      Promise.all(FACES.map((f) => document.fonts.load(f))),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]).then(start, start)

    window.addEventListener('keydown', finish, { once: true })
    const el = overlay.current
    el.addEventListener('click', finish)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('keydown', finish)
      el.removeEventListener('click', finish)
      document.body.classList.remove('intro-on')
    }
  }, [show])

  if (!show) return null
  return (
    <div className="intro" ref={overlay} aria-hidden="true">
      <div className="intro-word" ref={word}>
        <span ref={text}>Mailmind</span>
        <span className="bar" />
      </div>
      <div className="intro-panel">{PLACEHOLDERS}</div>
    </div>
  )
}

export default Intro
