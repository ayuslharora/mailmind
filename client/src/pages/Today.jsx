import { useEffect, useState } from 'react'
import axiosInstance from '../axiosCalls/axios'
import Loading from '../components/Loading'
import ThreadCard from '../components/ThreadCard'
import { useAuth } from '../context/AuthContext'
import { formatAgo } from '../utils/format'

// While mail is being fetched or sorted, the page refreshes itself.
const REFRESH_MS = 10000

const SECTIONS = [
  { key: 'urgent', title: 'Urgent' },
  { key: 'needsAction', title: 'Needs action' },
  { key: 'comingUp', title: 'Coming up this week' },
]

function Section({ title, items }) {
  if (items.length === 0) return null
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title} · {items.length}
      </h2>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <ThreadCard key={item.threadId} item={item} />
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
  const [showMissed, setShowMissed] = useState(false)
  // Bumped to fetch again on demand (after "Sync now").
  const [reloadKey, setReloadKey] = useState(0)

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
        })
        .catch(() => {
          if (active) setError('Could not load your inbox. Check your connection and try again.')
        })

    refresh()
    const timer = busy ? setInterval(refresh, REFRESH_MS) : null
    return () => {
      active = false
      if (timer) clearInterval(timer)
    }
  }, [busy, reloadKey])

  const syncNow = async () => {
    await axiosInstance.post('/sync')
    setReloadKey((k) => k + 1)
  }

  if (!today && !error) return <Loading text="Opening your inbox…" />

  const sectionsEmpty = today && SECTIONS.every(({ key }) => today[key].length === 0)
  const rest = today ? Object.entries(today.rest) : []

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Today</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500 dark:text-gray-400">{user.email}</span>
          <button type="button" onClick={logout} className="underline underline-offset-2">
            Log out
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
          {error}
        </p>
      )}

      {today && (
        <>
          {SECTIONS.map(({ key, title }) => (
            <Section key={key} title={title} items={today[key]} />
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
              Also in your inbox: {rest.map(([category, n]) => `${n} ${category}`).join(', ')}.
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
                    <ThreadCard key={item.threadId} item={item} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}

export default Today
