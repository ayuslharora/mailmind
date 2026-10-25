import { useState } from 'react'
import axiosInstance from '../axiosCalls/axios'
import AppBar from '../components/AppBar'
import Redacted from '../components/Redacted'
import { formatDue } from '../utils/format'

// "Try the redaction" (demo only): the visitor writes an email with made-up
// secrets and sees exactly what Mailmind would store. No AI sees it.
const EXAMPLE = {
  subject: 'HDFC Bank: login code and card details',
  body: `Hi Aarav,

Your one-time password for netbanking login is 482913. Do not share it with anyone.

Card: 4111 1111 1111 1111, CVV 123
Account number: 50100234567891
Aadhaar: 4991 1866 5246
PAN: ABCPE1234F
If this was not you, call +91 98765 43210 or reset your password at https://netbanking.hdfcbank.example/reset?token=9f8e7d6c5b4a

Your bill of Rs 4,250 is due by Friday.`,
}

const box = 'mt-3 whitespace-pre-wrap break-words rounded-sm border border-rule p-4 font-mono text-[13px] leading-relaxed'
const label = 'font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-grey'
const button = 'rounded-sm border border-ink/70 px-3 py-1.5 text-sm font-semibold hover:border-tape hover:bg-tape hover:text-tar'

// The original with every part that was caught marked in black, so what was
// left in stands out.
function Caught({ text, spans }) {
  const parts = []
  let at = 0
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start < at) continue
    parts.push(text.slice(at, span.start))
    parts.push(
      <mark key={span.start} title={span.type} className="rounded-[2px] bg-ink px-0.5 text-paper">
        {text.slice(span.start, span.end)}
      </mark>,
    )
    at = span.end
  }
  parts.push(text.slice(at))
  return parts
}

function MissReport({ id }) {
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  const send = async () => {
    try {
      await axiosInstance.post(`/demo/redact/${id}/miss`, { note })
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not send that. Please try again.')
    }
  }

  if (sent) return <p className="mt-6 text-sm font-semibold">Thanks, it is saved for review.</p>
  return (
    <details className="mt-6">
      <summary className="cursor-pointer text-sm font-semibold underline underline-offset-2">It missed something</summary>
      <div className="mt-3 space-y-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="What was left in? (optional)"
          aria-label="What was missed"
          className="w-full rounded-sm border border-ink/40 bg-paper px-3 py-2 text-sm"
        />
        <button type="button" onClick={send} className={button}>
          Report a miss
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </details>
  )
}

function Redact() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [strict, setStrict] = useState(false)
  const [result, setResult] = useState(null)
  const [sentText, setSentText] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const redact = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { data } = await axiosInstance.post('/demo/redact', { subject, body, strict })
      setResult(data)
      setSentText({ subject, body })
    } catch (err) {
      setError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const hidden = Object.entries(result?.hidden ?? {})
  const spansOf = (field) => result.redactions.filter((r) => r.field === field)

  return (
    <>
      <AppBar />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8">
        <h1 className="text-[44px] font-black uppercase leading-none condensed">Try the redaction</h1>
        <p className="mt-3 max-w-[56ch] text-grey">
          Write an email to yourself with made-up secrets: a card number, an OTP, an Aadhaar or account number. Mailmind
          redacts it exactly as it would an email from Gmail. No AI sees it.
        </p>
        <p className="mt-5 flex overflow-hidden rounded-sm border border-ink/20 text-sm">
          <span aria-hidden="true" className="hazard w-2.5 shrink-0" />
          <span className="p-3">
            What you write here is saved, encrypted, for 90 days, so the author can study what the rules miss. Use
            made-up numbers, not your real ones.
          </span>
        </p>

        <form onSubmit={redact} className="mt-8 space-y-4">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={300}
            placeholder="Subject"
            aria-label="Subject"
            className="w-full rounded-sm border border-ink bg-paper px-4 py-3 text-[17px] outline-none placeholder:text-grey focus:border-2"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            rows={10}
            placeholder="Your email"
            aria-label="Email text"
            className="w-full rounded-sm border border-ink bg-paper px-4 py-3 font-mono text-sm outline-none placeholder:text-grey focus:border-2"
          />
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={busy || !body.trim()} className="btn-tape rounded-sm px-5 py-2.5 font-bold disabled:opacity-50">
              {busy ? 'Redacting…' : 'Redact'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSubject(EXAMPLE.subject)
                setBody(EXAMPLE.body)
              }}
              className={button}
            >
              Fill in an example
            </button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
              Strict, as for a security email (hides every code-shaped number and link)
            </label>
          </div>
        </form>

        {error && (
          <p role="alert" className="mt-6 flex overflow-hidden rounded-sm border border-ink/20 text-sm">
            <span aria-hidden="true" className="hazard w-2.5 shrink-0" />
            <span className="p-3">{error}</span>
          </p>
        )}

        {result && (
          <section className="mt-12">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h2 className="text-2xl font-black uppercase condensed">What you wrote</h2>
                <p className="mt-1 text-sm text-grey">What was caught is marked in black.</p>
                <div className={box}>
                  {sentText.subject && (
                    <>
                      <Caught text={sentText.subject} spans={spansOf('subject')} />
                      {'\n\n'}
                    </>
                  )}
                  <Caught text={sentText.body} spans={spansOf('body')} />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase condensed">What Mailmind stores</h2>
                <p className="mt-1 text-sm text-grey">The only copy any AI would see.</p>
                <div className={`${box} bg-ink/[0.03]`}>
                  {result.subject && (
                    <>
                      <Redacted text={result.subject} />
                      {'\n\n'}
                    </>
                  )}
                  <Redacted text={result.body} />
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-2 text-sm">
              <p>
                <span className={`${label} mr-2`}>Hidden</span>
                {hidden.length === 0
                  ? 'nothing'
                  : hidden.map(([type, n]) => (
                      <span key={type} className="tape mr-1.5 inline-block px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider">
                        {type} ×{n}
                      </span>
                    ))}
              </p>
              <p>
                <span className={`${label} mr-2`}>Mode</span>
                {result.strict
                  ? strict
                    ? 'strict, as you asked'
                    : 'strict: a secret was found, so every code-shaped number and link was hidden'
                  : 'light: no secret was found, so ordinary numbers stay readable'}
              </p>
              {(result.deadlineAt || result.eventAt) && (
                <p>
                  <span className={`${label} mr-2`}>Dates found</span>
                  {[
                    result.deadlineAt && `deadline ${formatDue(result.deadlineAt, result.deadlineHasTime)}`,
                    result.eventAt && `event ${formatDue(result.eventAt, result.eventHasTime)}`,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}
            </div>

            <MissReport key={result.id} id={result.id} />
          </section>
        )}
      </main>
    </>
  )
}

export default Redact
