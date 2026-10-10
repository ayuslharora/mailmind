import { useState } from 'react'
import { Link } from 'react-router-dom'
import { calendarLink, daysToMonday, formatDue, formatReceived, nineAmIst } from '../utils/format'
import Redacted from './Redacted'

const CATEGORY_LABELS = {
  academic: 'Academic',
  jobs: 'Jobs',
  finance: 'Finance',
  personal: 'Personal',
  notifications: 'Notifications',
  promos: 'Promos',
}

const button = 'rounded-sm border border-ink/70 px-2.5 py-1 font-semibold hover:border-tape hover:bg-tape hover:text-tar'
const menu = 'absolute left-0 z-10 mt-2 w-64 space-y-2 rounded-sm border border-ink bg-paper p-3 shadow-[5px_5px_0_var(--color-ink)]'

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
          <span className="text-grey">Pick a day</span>
          <span className="mt-1 flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-sm border border-ink/40 px-2 py-1"
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
          <span className="text-grey">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-sm border border-ink/40 px-2 py-1"
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

// The section a card is in, shown when cards are not grouped by section
// (the newest-first view). Same marks as the section headings.
const SECTION_BADGES = {
  urgent: ['Urgent', 'bg-tar text-tape ring-2 ring-tape'],
  needsAction: ['Needs action', 'tape'],
  comingUp: ['Coming up', 'border border-ink/70'],
  missed: ['Missed', 'text-grey line-through'],
}

// rank: the card's evidence number, for mail that needs you (Urgent and
// Needs action, in priority order). section: its section, as a badge.
function ThreadCard({ item, onAction, rank, section }) {
  const badge = SECTION_BADGES[section]
  return (
    <li className="flex gap-4 rounded-sm border border-rule bg-paper p-4 transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-16px_rgb(0_0_0/0.35)]">
      {rank && (
        <span
          aria-label={`Number ${rank}`}
          className="tent grid h-[30px] w-[26px] shrink-0 place-items-end justify-center pb-1 text-sm font-black condensed"
        >
          {rank}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <Link to={`/email/${item.threadId}`} className="text-[17px] font-bold leading-snug hover:underline">
            {item.subject || '(no subject)'}
          </Link>
          <span className="shrink-0 font-mono text-xs text-grey">{formatReceived(item.date)}</span>
        </div>
        <p className="text-sm text-grey">{item.fromMe ? 'You' : item.from}</p>
        {item.firstLine && (
          <p className="mt-1 line-clamp-2 text-sm text-ink/70">
            <Redacted text={item.firstLine} />
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
          {badge && <span className={`rounded-sm px-2 py-1 font-bold ${badge[1]}`}>{badge[0]}</span>}
          <span className="rounded-sm border border-ink/25 px-2 py-0.5 text-ink/70">
            {CATEGORY_LABELS[item.category] ?? item.category}
          </span>
          {item.dueAt &&
            (item.missed ? (
              <span className="px-1 text-grey line-through">{dueLabel(item)}</span>
            ) : (
              <span className="tape -rotate-1 px-2 py-1 font-bold">{dueLabel(item)}</span>
            ))}
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
          <a href={item.gmailUrl} target="_blank" rel="noreferrer" className="ml-auto font-semibold underline underline-offset-2">
            Open in Gmail
          </a>
        </div>
      </div>
    </li>
  )
}

export default ThreadCard
