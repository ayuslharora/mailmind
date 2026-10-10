import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axiosInstance from '../axiosCalls/axios'
import AppBar from '../components/AppBar'
import Redacted from '../components/Redacted'
import { formatReceived } from '../utils/format'

// "What the AI saw": the exact context the classifier received, its answer,
// and the stored (redacted) copy.
const percent = (p) => `${Math.round((p ?? 0) * 100)}%`
const box = 'mt-3 whitespace-pre-wrap break-words rounded-sm border border-rule bg-ink/[0.03] p-4 font-mono text-[13px] leading-relaxed'
const label = 'font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-grey'
const URGENCY = ['can be ignored', 'read sometime', 'this week', 'today', 'immediately']
// Where Mailmind acts on an answer (the server's SECURITY_P, NEEDS_ACTION_P
// and DATE_KIND_P).
const SECURITY_P = 0.3
const NEEDS_ACTION_P = 0.6
const DATE_KIND_P = 0.5

// A score as a bar. Past its threshold (the dashed line) Mailmind acts on it,
// and the bar turns to barrier tape.
function Meter({ name, p, cut, acts = cut !== undefined && p >= cut }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
      <span className={acts ? 'font-semibold' : 'text-grey'}>{name}</span>
      <div className="relative h-3 border-b border-rule">
        <div className={`absolute inset-y-0 bottom-[3px] left-0 ${acts ? 'hazard' : 'bg-ink'}`} style={{ width: percent(p) }} />
        {cut !== undefined && (
          <div className="absolute -bottom-1 -top-1 border-l border-dashed border-ink" style={{ left: percent(cut) }} />
        )}
      </div>
      <span className="text-right font-mono text-[13px] tabular-nums">{percent(p)}</span>
    </div>
  )
}

function HiddenBadges({ hidden }) {
  const entries = Object.entries(hidden).filter(([type]) => type !== 'LINK_TRIMMED')
  if (entries.length === 0) return <span className="text-grey">nothing hidden</span>
  return entries.map(([type, n]) => (
    <span key={type} className="tape mr-1.5 inline-block px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider">
      {type} ×{n}
    </span>
  ))
}

function Email() {
  const { threadId } = useParams()
  const [email, setEmail] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    axiosInstance
      .get(`/threads/${threadId}`)
      .then(({ data }) => active && setEmail(data))
      .catch((err) => active && setError(err.response?.data?.message ?? 'Could not load this email.'))
    return () => {
      active = false
    }
  }, [threadId])

  if (error)
    return (
      <>
        <AppBar />
        <main className="mx-auto max-w-3xl px-4 py-8 text-danger">{error}</main>
      </>
    )
  if (!email)
    return (
      <>
        <AppBar />
        <main className="mx-auto max-w-3xl px-4 py-8 text-grey">Loading…</main>
      </>
    )

  const { sentToClassifier: sent, answer } = email
  const categories = answer
    ? Object.entries(answer.categoryProbs)
        .filter(([, p]) => p >= 0.01)
        .sort((a, b) => b[1] - a[1])
    : []

  return (
    <>
      <AppBar />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8">
        <Link to="/today" className="text-sm font-semibold underline underline-offset-2">
          ← Today
        </Link>
        <h1 className="mt-4 text-3xl font-bold leading-tight text-balance">{email.messages[0]?.subject || '(no subject)'}</h1>

        <section className="mt-10">
          <h2 className="text-2xl font-black uppercase condensed">What the AI saw</h2>
          <p className="mt-1 text-sm text-grey">
            Exactly what was sent to the classifier. Secrets were replaced before this left the server.
          </p>
          {sent && (
            <div className={box}>
              <Redacted
                text={`From: ${sent.from_domain} (domain only)\nSubject: ${sent.subject}\nGmail tab: ${sent.gmail_category ?? 'none'} · Mailing tool: ${sent.bulk_sender ? 'yes' : 'no'} · Days to a date found: ${sent.deadline_in_days ?? 'none'}\n\nLatest message${sent.latest.from_me ? ' (from you)' : ''}:\n${sent.latest.text}${sent.earlier.map((m, i) => `\n\nEarlier message ${i + 1}${m.from_me ? ' (from you)' : ''}:\n${m.text}`).join('')}`}
              />
            </div>
          )}
        </section>

        {answer && (
          <section className="mt-10">
            <h2 className="text-2xl font-black uppercase condensed">What it answered</h2>
            <p className="mt-1 text-sm text-grey">Model: {answer.source === 'rules' ? 'rules (no AI call)' : answer.source}</p>
            <div className="mt-5 space-y-5">
              <div className="space-y-1.5">
                <p className={label}>Category</p>
                {categories.map(([category, p], i) => (
                  <Meter key={category} name={category} p={p} acts={i === 0} />
                ))}
              </div>
              <div className="space-y-1.5">
                <p className={label}>Needs you, is security, has a date</p>
                <Meter name="Needs action" p={answer.needsActionP} cut={NEEDS_ACTION_P} />
                <Meter name="Security" p={answer.securityP} cut={SECURITY_P} />
                <Meter name={`Date: ${answer.dateKind}`} p={answer.dateKindP} cut={DATE_KIND_P} />
              </div>
              <div className="space-y-1.5">
                <p className={label}>Urgency when it arrived</p>
                <Meter name={URGENCY[Math.round(answer.urgency)]} p={(answer.urgency ?? 0) / 4} cut={0.75} />
                <p className="text-sm text-grey">{answer.urgency?.toFixed(1)} of 4. Urgent starts at 3.</p>
              </div>
            </div>
            {(answer.promoCap || email.userLabel) && (
              <ul className="mt-4 space-y-1 text-sm">
                {answer.promoCap && <li>Promotion: urgency capped (Gmail's headers agree it is a promotion)</li>}
                {email.userLabel && (
                  <li>
                    Your correction:{' '}
                    {[
                      email.userLabel.category,
                      email.userLabel.needsAction !== undefined && `needs action: ${email.userLabel.needsAction ? 'yes' : 'no'}`,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </li>
                )}
              </ul>
            )}
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-2xl font-black uppercase condensed">What Mailmind stores</h2>
          <p className="mt-1 text-sm text-grey">The redacted copy used for search and chat. The original is never stored.</p>
          {email.messages.map((m) => (
            <article key={m.gmailId} className="mt-4 rounded-sm border border-rule p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {m.from} · <span className="font-mono text-xs">{formatReceived(m.date)}</span> · {m.strict ? 'strict' : 'light'}
                </span>
                <a href={m.gmailUrl} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                  Open original in Gmail
                </a>
              </div>
              <p className="mt-3 text-xs">
                <span className={`${label} mr-2`}>Hidden</span>
                <HiddenBadges hidden={m.hidden} />
              </p>
              <div className={box}>{m.body ? <Redacted text={m.body} /> : '(empty)'}</div>
            </article>
          ))}
        </section>
      </main>
    </>
  )
}

export default Email
