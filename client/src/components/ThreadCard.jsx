import { formatDue, formatReceived } from '../utils/format'

const CATEGORY_LABELS = {
  academic: 'Academic',
  jobs: 'Jobs',
  finance: 'Finance',
  personal: 'Personal',
  notifications: 'Notifications',
  promos: 'Promos',
}

function dueLabel(item) {
  const when = formatDue(item.dueAt, item.dueHasTime)
  if (item.missed) return item.dateKind === 'event' ? `Was ${when}` : `Was due ${when}`
  return item.dateKind === 'event' ? `Event ${when}` : `Due ${when}`
}

function ThreadCard({ item }) {
  return (
    <li className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{item.subject || '(no subject)'}</p>
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
