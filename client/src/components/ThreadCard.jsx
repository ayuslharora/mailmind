import { useState } from 'react'
import { Link } from 'react-router-dom'
import { calendarLink, daysToMonday, formatDue, formatReceived, nineAmIst } from '../utils/format'

const CATEGORY_LABELS = {
  academic: 'Academic',
  jobs: 'Jobs',
  finance: 'Finance',
  personal: 'Personal',
  notifications: 'Notifications',
  promos: 'Promos',
}

const button =
  'rounded-lg border border-gray-300 px-2.5 py-1 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900'
const menu =
  'absolute left-0 z-10 mt-1 w-64 space-y-2 rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-800 dark:bg-gray-950'

function dueLabel(item) {
  const when = formatDue(item.dueAt, item.dueHasTime)
  if (item.missed) return item.dateKind === 'event' ? `Was ${when}` : `Was due ${when}`
  return item.dateKind === 'event' ? `Event ${when}` : `Due ${when}`
}

function SnoozeMenu({ onSnooze }) {
  const [date, setDate] = useState('')
  return (
    <details className="relative">
      <summary className={`${button} cursor-pointer list-none`}>Snooze</summary>
      <div className={menu}>
        <button type="button" className="block w-full text-left hover:underline" onClick={() => onSnooze(nineAmIst(1))}>
          Tomorrow, 9 am
        </button>
        <button
          type="button"
          className="block w-full text-left hover:underline"
          onClick={() => onSnooze(nineAmIst(daysToMonday()))}
        >
          Next Monday, 9 am
        </button>
        <label className="block">
          <span className="text-gray-500 dark:text-gray-400">Pick a day</span>
          <span className="mt-1 flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
            />
            <button
              type="button"
              disabled={!date}
              className={`${button} disabled:opacity-50`}
              onClick={() => onSnooze(new Date(`${date}T09:00:00+05:30`))}
            >
              Set
            </button>
          </span>
        </label>
      </div>
    </details>
  )
}

// "Not right?": the user's correction overrides the model and becomes a label.
function FixMenu({ item, onFix }) {
  const [category, setCategory] = useState(item.category)
  const [applyToSender, setApplyToSender] = useState(false)
  const [needsAction, setNeedsAction] = useState(item.needsAction)
  return (
    <details className="relative">
      <summary className={`${button} cursor-pointer list-none`}>Not right?</summary>
      <div className={menu}>
        <label className="block">
          <span className="text-gray-500 dark:text-gray-400">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={applyToSender} onChange={(e) => setApplyToSender(e.target.checked)} />
          For all emails from {item.from}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={needsAction} onChange={(e) => setNeedsAction(e.target.checked)} />
          Needs action from me
        </label>
        <button
          type="button"
          className={button}
          onClick={() =>
            onFix({
              ...(category !== item.category && { category, applyToSender }),
              ...(needsAction !== item.needsAction && { needsAction }),
            })
          }
        >
          Save
        </button>
      </div>
    </details>
  )
}

function ThreadCard({ item, onAction }) {
  return (
    <li className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-baseline justify-between gap-3">
        <Link to={`/email/${item.threadId}`} className="font-medium hover:underline">
          {item.subject || '(no subject)'}
        </Link>
        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{formatReceived(item.date)}</span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400">{item.fromMe ? 'You' : item.from}</p>
      {item.firstLine && (
        <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{item.firstLine}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {CATEGORY_LABELS[item.category] ?? item.category}
        </span>
        {item.dueAt && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {dueLabel(item)}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className={button} onClick={() => onAction(item, { state: 'done' }, 'Marked done')}>
          Done
        </button>
        <SnoozeMenu onSnooze={(until) => onAction(item, { snoozeUntil: until.toISOString() }, 'Snoozed')} />
        <FixMenu
          item={item}
          onFix={(changes) => Object.keys(changes).length && onAction(item, changes, 'Thanks — corrected')}
        />
        {item.dueAt && !item.missed && (
          <a href={calendarLink(item)} target="_blank" rel="noreferrer" className={button}>
            Add to Calendar
          </a>
        )}
        <a
          href={item.gmailUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto font-medium text-gray-900 underline underline-offset-2 dark:text-gray-100"
        >
          Open in Gmail
        </a>
      </div>
    </li>
  )
}

export default ThreadCard
