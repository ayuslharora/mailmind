import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axiosInstance from '../axiosCalls/axios'
import Loading from '../components/Loading'
import Digest from '../components/Digest'
import ThreadCard from '../components/ThreadCard'
import { useAuth } from '../context/AuthContext'
import { formatAgo } from '../utils/format'

// While mail is being fetched or sorted, the page refreshes itself.
const REFRESH_MS = 10000
const NOTICE_MS = 6000

const SECTIONS = [
  { key: 'urgent', title: 'Urgent' },
  { key: 'needsAction', title: 'Needs action' },
  { key: 'comingUp', title: 'Coming up this week' },
]
const ALL_KEYS = ['urgent', 'needsAction', 'comingUp', 'missed', 'other']

// Every open email in one list, newest first.
const newestFirst = (today) =>
  ALL_KEYS.flatMap((key) => today[key]).sort((a, b) => new Date(b.date) - new Date(a.date))

function Section({ title, items, onAction }) {
  if (items.length === 0) return null
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title} · {items.length}
      </h2>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <ThreadCard key={item.threadId} item={item} onAction={onAction} />
        ))}
      </ul>
    </section>
  )
}

function Today() {
  const { user, logout } = useAuth()
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

  const deleteEverything = async () => {
    const sure = window.confirm(
      'Delete all your data from Mailmind and remove its access to your Gmail? Your emails in Gmail are not touched. This cannot be undone.',
    )
    if (!sure) return
    try {
      await axiosInstance.delete('/auth/me')
      window.location.assign('/')
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not delete your data. Please try again.')
    }
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4" role="tablist">
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
              className={`text-2xl font-bold tracking-tight ${tab === key ? '' : 'text-gray-400 dark:text-gray-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link to="/ask" className="font-medium underline underline-offset-2">
            Ask your inbox
          </Link>
          <span className="text-gray-500 dark:text-gray-400">{user.email}</span>
          <button type="button" onClick={logout} className="underline underline-offset-2">
            Log out
          </button>
          <button type="button" onClick={deleteEverything} className="text-red-700 underline underline-offset-2 dark:text-red-300">
            Delete all my data
          </button>
        </div>
      </header>

      {status && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          {status.lastError === 'reconnect' ? (
            <a href="/api/auth/google" className="font-medium text-red-700 underline dark:text-red-300">
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
            className="rounded-lg border border-gray-300 px-3 py-1 font-medium disabled:opacity-50 dark:border-gray-700"
          >
            Sync now
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}{' '}
          {loginNeeded && (
            <a href="/api/auth/google" className="font-semibold underline underline-offset-2">
              Sign in again
            </a>
          )}
        </p>
      )}

      {tab === 'digest' && <Digest />}

      {tab === 'today' && today && (
        <div className="mt-6 flex gap-2 text-sm" role="group" aria-label="Sort by">
          {[
            ['priority', 'Priority'],
            ['newest', 'Newest'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={order === key}
              onClick={() => setOrder(key)}
              className={`rounded-lg border px-3 py-1 font-medium ${
                order === key
                  ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'today' && today && order === 'newest' && (
        <Section title="All mail" items={newestFirst(today)} onAction={act} />
      )}

      {tab === 'today' && today && order === 'priority' && (
        <>
          {SECTIONS.map(({ key, title }) => (
            <Section key={key} title={title} items={today[key]} onAction={act} />
          ))}

          {sectionsEmpty && (
            <p className="mt-10 text-center text-gray-500 dark:text-gray-400">
              {status && !status.backfillDone
                ? 'Fetching your last 30 days of mail…'
                : today.sorting > 0
                  ? 'Sorting your mail…'
                  : 'Nothing needs you right now.'}
            </p>
          )}

          {rest.length > 0 && (
            <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
              Also in your inbox: {rest.map(([category, n]) => `${n} ${category}`).join(', ')}.{' '}
              <button type="button" onClick={() => setOrder('newest')} className="underline underline-offset-2">
                See all, newest first
              </button>
            </p>
          )}

          {today.missed.length > 0 && (
            <section className="mt-10 border-t border-gray-200 pt-6 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setShowMissed((s) => !s)}
                className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                aria-expanded={showMissed}
              >
                Missed · {today.missed.length} {showMissed ? '▾' : '▸'}
              </button>
              {showMissed && (
                <ul className="mt-3 space-y-3 opacity-80">
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
          className="fixed inset-x-0 bottom-4 mx-auto flex w-fit items-center gap-4 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-gray-100 dark:text-gray-900"
        >
          {notice.text}
          {notice.threadId && (
            <button type="button" onClick={undo} className="font-semibold underline underline-offset-2">
              Undo
            </button>
          )}
        </div>
      )}
    </main>
  )
}

export default Today
