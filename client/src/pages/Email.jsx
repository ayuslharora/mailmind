import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axiosInstance from '../axiosCalls/axios'
import { formatReceived } from '../utils/format'

// "What the AI saw": the exact context the classifier received, its answer,
// and the stored (redacted) copy. Minimal on purpose: the front end will be
// redesigned.
const percent = (p) => `${Math.round((p ?? 0) * 100)}%`
const box = 'mt-2 whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-900'
const URGENCY = ['can be ignored', 'read sometime', 'this week', 'today', 'immediately']

function HiddenBadges({ hidden }) {
  const entries = Object.entries(hidden).filter(([type]) => type !== 'LINK_TRIMMED')
  if (entries.length === 0) return <span className="text-gray-500 dark:text-gray-400">nothing hidden</span>
  return entries.map(([type, n]) => (
    <span key={type} className="mr-1 rounded-full bg-gray-200 px-2 py-0.5 dark:bg-gray-800">
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

  if (error) return <main className="mx-auto max-w-2xl px-4 py-8 text-red-700 dark:text-red-300">{error}</main>
  if (!email) return <main className="mx-auto max-w-2xl px-4 py-8 text-gray-500">Loading…</main>

  const { sentToClassifier: sent, answer } = email

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link to="/today" className="text-sm underline underline-offset-2">
        ← Today
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{email.messages[0]?.subject || '(no subject)'}</h1>

      <section className="mt-8">
        <h2 className="font-semibold">What the AI saw</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Exactly what was sent to the classifier. Secrets were replaced before this left the server.
        </p>
        {sent && (
          <div className={box}>
            {`From: ${sent.from_domain} (domain only)\nSubject: ${sent.subject}\nGmail tab: ${sent.gmail_category ?? 'none'} · Mailing tool: ${sent.bulk_sender ? 'yes' : 'no'} · Days to a date found: ${sent.deadline_in_days ?? 'none'}\n\nLatest message${sent.latest.from_me ? ' (from you)' : ''}:\n${sent.latest.text}`}
            {sent.earlier.map((m, i) => `\n\nEarlier message ${i + 1}${m.from_me ? ' (from you)' : ''}:\n${m.text}`).join('')}
          </div>
        )}
      </section>

      {answer && (
        <section className="mt-8">
          <h2 className="font-semibold">What it answered</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Model: {answer.source === 'rules' ? 'rules (no AI call)' : answer.source}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              Category:{' '}
              {Object.entries(answer.categoryProbs)
                .filter(([, p]) => p >= 0.01)
                .sort((a, b) => b[1] - a[1])
                .map(([category, p]) => `${category} ${percent(p)}`)
                .join(' · ')}
            </li>
            <li>Needs action: {percent(answer.needsActionP)}</li>
            <li>Security email: {percent(answer.securityP)}</li>
            <li>Urgency when it arrived: {URGENCY[Math.round(answer.urgency)]} ({answer.urgency?.toFixed(1)} of 4)</li>
            <li>
              Date: {answer.dateKind} ({percent(answer.dateKindP)})
            </li>
            {answer.promoCap && <li>Promotion: urgency capped (Gmail's headers agree it is a promotion)</li>}
            {email.userLabel && (
              <li>
                Your correction: {[email.userLabel.category, email.userLabel.needsAction !== undefined && `needs action: ${email.userLabel.needsAction ? 'yes' : 'no'}`].filter(Boolean).join(', ')}
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-semibold">What Mailmind stores</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          The redacted copy used for search and chat. The original is never stored.
        </p>
        {email.messages.map((m) => (
          <article key={m.gmailId} className="mt-4 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {m.from} · {formatReceived(m.date)} · {m.strict ? 'strict' : 'light'}
              </span>
              <a href={m.gmailUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Open original in Gmail
              </a>
            </div>
            <p className="mt-2 text-xs">
              Hidden: <HiddenBadges hidden={m.hidden} />
            </p>
            <div className={box}>{m.body || '(empty)'}</div>
          </article>
        ))}
      </section>
    </main>
  )
}

export default Email
