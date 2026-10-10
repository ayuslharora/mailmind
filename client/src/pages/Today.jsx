import { useEffect, useState } from 'react'
import axiosInstance from '../axiosCalls/axios'
import AppBar from '../components/AppBar'
import Loading from '../components/Loading'
import Digest from '../components/Digest'
import ThreadCard from '../components/ThreadCard'
import { formatAgo, formatDay } from '../utils/format'

// While mail is being fetched or sorted, the page refreshes itself.
const REFRESH_MS = 10000
const NOTICE_MS = 6000

const SECTIONS = [
  { key: 'urgent', title: 'Urgent' },
  { key: 'needsAction', title: 'Needs action' },
  { key: 'comingUp', title: 'Coming up this week' },
]
const ALL_KEYS = ['urgent', 'needsAction', 'comingUp', 'missed', 'other']

// Every open email newest first, each marked with the section it is in,
// then grouped by the day it arrived.
function byDay(today) {
  const all = ALL_KEYS.flatMap((key) => today[key].map((item) => ({ ...item, section: key }))).sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  )
  const days = []
  for (const item of all) {
    const day = formatDay(item.date)
    if (days.at(-1)?.day !== day) days.push({ day, items: [] })
    days.at(-1).items.push(item)
  }
  return days
}

// The newest-first view: a timeline of days, with each card saying which
// section it belongs to.
function Timeline({ today, onAction }) {
  return (
    <div className="relative mt-9 pl-7">
      <span aria-hidden="true" className="absolute bottom-0 left-[7px] top-2 w-px bg-rule" />
      {byDay(today).map(({ day, items }, i) => (
        <section key={day} className={i ? 'mt-9' : ''}>
          <h2 className="relative flex items-baseline gap-3">
            <span
              aria-hidden="true"
              className={`absolute -left-7 top-1 size-[15px] rounded-sm border-2 ${i === 0 ? 'hazard border-tar' : 'border-ink bg-paper'}`}
            />
            <span className="text-2xl font-black uppercase leading-none condensed">{day}</span>
            <span className="font-mono text-xs text-grey">{items.length}</span>
          </h2>
          <ul className="mt-3 space-y-2.5">
            {items.map((item) => (
              <ThreadCard key={item.threadId} item={item} onAction={onAction} section={item.section} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

// Each section's heading says how much it matters: Urgent gets barrier
// tape, Needs action a strip of tape, the rest a plain label.
function Heading({ kind, title, count }) {
  if (kind === 'urgent') {
    return (
      <h2 className="hazard flex h-8 items-center rounded-sm pl-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em]">
        <span className="bg-tar px-2.5 py-1.5 text-white">{title}</span>
        <span className="bg-tar py-1.5 pr-2 text-tape">{count}</span>
      </h2>
    )
  }
  if (kind === 'needsAction') {
    return (
      <h2 className="tape inline-block -rotate-1 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em]">
        {title} · {count}
      </h2>
    )
  }
  return (
    <h2 className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-grey">
      {title} · {count}
    </h2>
  )
}

function Section({ kind, title, items, onAction, firstRank }) {
  if (items.length === 0) return null
  return (
    <section className="mt-9">
      <Heading kind={kind} title={title} count={items.length} />
      <ul className="mt-3 space-y-2.5">
        {items.map((item, i) => (
          <ThreadCard
            key={item.threadId}
            item={item}
            onAction={onAction}
            rank={firstRank === undefined ? undefined : firstRank + i}
          />
        ))}
      </ul>
    </section>
  )
}

function Today() {
  const [today, setToday] = useState(null)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [loginNeeded, setLoginNeeded] = useState(false)
  const [showMissed, setShowMissed] = useState(false)
  const [tab, setTab] = useState('today')
  // 'priority': the sections; 'newest': all mail by time.
  const [order, setOrder] = useState('priority')
  // Bumped to fetch again on demand (after "Sync now" or an action).
  const [reloadKey, setReloadKey] = useState(0)
  // "Marked done · Undo": threadId is set when the action hid the thread.
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const busy = Boolean(status && (status.syncing || status.classifying || today?.sorting > 0))

  useEffect(() => {
    // Ignores replies that arrive after the page has moved on.
    let active = true
    const refresh = () =>
      Promise.all([axiosInstance.get('/today'), axiosInstance.get('/sync/status')])
        .then(([todayRes, statusRes]) => {
          if (!active) return
          setToday(todayRes.data)
          setStatus(statusRes.data)
          setError(null)
          setLoginNeeded(false)
        })
        .catch((err) => {
          if (!active) return
          // The server says what went wrong (an expired login, the database
          // being unreachable); a missing reply means no connection.
          setError(err.response?.data?.message ?? 'Could not reach Mailmind. Check your connection and try again.')
          setLoginNeeded(err.response?.status === 401)
        })

    refresh()
    const timer = busy ? setInterval(refresh, REFRESH_MS) : null
    return () => {
      active = false
      if (timer) clearInterval(timer)
    }
  }, [busy, reloadKey])

  const act = async (item, changes, text) => {
    try {
      await axiosInstance.patch(`/threads/${item.threadId}`, changes)
      const hidden = changes.state === 'done' || changes.snoozeUntil
      setNotice({ text, threadId: hidden ? item.threadId : null })
      setReloadKey((k) => k + 1)
    } catch {
      setError('Could not save that change. Please try again.')
    }
  }

  const undo = async () => {
    const { threadId } = notice
    setNotice(null)
    await axiosInstance.patch(`/threads/${threadId}`, { state: 'open' })
    setReloadKey((k) => k + 1)
  }

  const syncNow = async () => {
    await axiosInstance.post('/sync')
    setReloadKey((k) => k + 1)
  }

  if (!today && !error) return <Loading text="Opening your inbox…" />

  const sectionsEmpty = today && SECTIONS.every(({ key }) => today[key].length === 0)
  const restCounts = {}
  for (const item of today?.other ?? []) restCounts[item.category] = (restCounts[item.category] ?? 0) + 1
  const rest = Object.entries(restCounts)

  // Evidence numbers run on from Urgent into Needs action, in priority order.
  const firstRank = { urgent: 1, needsAction: 1 + (today?.urgent.length ?? 0) }

  return (
    <>
      <AppBar />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex gap-5" role="tablist">
            {[
              ['today', 'Today'],
              ['digest', 'Digest'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`text-[44px] font-black uppercase leading-none condensed ${tab === key ? '' : 'text-grey/50 hover:text-grey'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {status && (
            <div className="flex items-center gap-3 font-mono text-xs text-grey">
              {status.lastError === 'reconnect' ? (
                <a href="/api/auth/google" className="font-semibold text-danger underline">
                  Gmail access expired — sign in again
                </a>
              ) : (
                <span>
                  {status.syncing ? 'Fetching mail…' : `Synced ${formatAgo(status.lastSyncedAt)}`}
                  {today?.sorting > 0 && ` · sorting ${today.sorting} more`}
                </span>
              )}
              <button
                type="button"
                onClick={syncNow}
                disabled={status.syncing}
                className="rounded-sm border border-ink/70 px-3 py-1.5 font-sans text-sm font-semibold text-ink hover:border-tape hover:bg-tape hover:text-tar disabled:opacity-50"
              >
                Sync now
              </button>
            </div>
          )}
        </div>
        {/* Moving barrier tape while mail is being fetched or sorted. */}
        {busy && <div aria-hidden="true" className="hazard-crawl mt-4 h-1.5 rounded-full" />}

        {error && (
          <p role="alert" className="mt-6 flex overflow-hidden rounded-sm border border-ink/20 text-sm">
            <span aria-hidden="true" className="hazard w-2.5 shrink-0" />
            <span className="p-3">
              {error}{' '}
              {loginNeeded && (
                <a href="/api/auth/google" className="font-semibold underline underline-offset-2">
                  Sign in again
                </a>
              )}
            </span>
          </p>
        )}

        {tab === 'digest' && <Digest />}

        {tab === 'today' && today && (
          <div className="mt-6 inline-flex rounded-sm border border-ink/70 p-0.5 text-sm" role="group" aria-label="Sort by">
            {[
              ['priority', 'Priority'],
              ['newest', 'Newest'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={order === key}
                onClick={() => setOrder(key)}
                className={`rounded-[1px] px-3 py-1 font-semibold ${order === key ? 'bg-ink text-paper' : 'text-grey hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === 'today' && today && order === 'newest' && (
          <Timeline today={today} onAction={act} />
        )}

        {tab === 'today' && today && order === 'priority' && (
          <>
            {SECTIONS.map(({ key, title }) => (
              <Section key={key} kind={key} title={title} items={today[key]} onAction={act} firstRank={firstRank[key]} />
            ))}

            {sectionsEmpty && (
              <p className="mt-14 text-center text-grey">
                {status && !status.backfillDone
                  ? 'Fetching your last 30 days of mail…'
                  : today.sorting > 0
                    ? 'Sorting your mail…'
                    : 'Nothing needs you right now.'}
              </p>
            )}

            {rest.length > 0 && (
              <p className="mt-9 text-sm text-grey">
                Also in your inbox: {rest.map(([category, n]) => `${n} ${category}`).join(', ')}.{' '}
                <button type="button" onClick={() => setOrder('newest')} className="font-semibold text-ink underline underline-offset-2">
                  See all, newest first
                </button>
              </p>
            )}

            {today.missed.length > 0 && (
              <section className="mt-10 border-t border-rule pt-6">
                <button
                  type="button"
                  onClick={() => setShowMissed((s) => !s)}
                  className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-grey"
                  aria-expanded={showMissed}
                >
                  Missed · {today.missed.length} {showMissed ? '▾' : '▸'}
                </button>
                {showMissed && (
                  <ul className="mt-3 space-y-2.5 opacity-80">
                    {today.missed.map((item) => (
                      <ThreadCard key={item.threadId} item={item} onAction={act} />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}

        {notice && (
          <div
            role="status"
            className="fixed inset-x-0 bottom-5 mx-auto flex w-fit items-center gap-4 overflow-hidden rounded-sm bg-tar pr-4 text-sm text-white shadow-lg"
          >
            <span aria-hidden="true" className="hazard w-2.5 self-stretch" />
            <span className="py-2.5">{notice.text}</span>
            {notice.threadId && (
              <button type="button" onClick={undo} className="font-semibold text-tape underline underline-offset-2">
                Undo
              </button>
            )}
          </div>
        )}
      </main>
    </>
  )
}

export default Today
