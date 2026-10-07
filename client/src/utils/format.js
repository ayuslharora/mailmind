// Dates are shown in Indian time, the way the deadlines were read.
const TIME_ZONE = 'Asia/Kolkata'
const DAY_MS = 24 * 60 * 60 * 1000

const dayKey = (date) => new Date(date).toLocaleDateString('en-CA', { timeZone: TIME_ZONE })

function daysFromToday(date, now = new Date()) {
  return Math.round((new Date(dayKey(date)) - new Date(dayKey(now))) / DAY_MS)
}

// "today", "tomorrow", "Fri 9 Oct"; with the time when the email gave one.
export function formatDue(dueAt, hasTime) {
  const days = daysFromToday(dueAt)
  const day =
    days === 0
      ? 'today'
      : days === 1
        ? 'tomorrow'
        : days === -1
          ? 'yesterday'
          : new Date(dueAt).toLocaleDateString('en-IN', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' })
  if (!hasTime) return day
  const time = new Date(dueAt).toLocaleTimeString('en-IN', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' })
  return `${day}, ${time}`
}

// When an email arrived: "10:42 am" today, otherwise "6 Oct".
export function formatReceived(date) {
  if (daysFromToday(date) === 0) {
    return new Date(date).toLocaleTimeString('en-IN', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' })
  }
  return new Date(date).toLocaleDateString('en-IN', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' })
}

export function formatAgo(date) {
  if (!date) return 'never'
  const minutes = Math.round((Date.now() - new Date(date)) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`
}

// 9 am Indian time on a given day, as a Date.
export function nineAmIst(daysFromNow = 1, from = new Date()) {
  const ist = new Date(from.getTime() + 330 * 60000)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + daysFromNow, 3, 30))
}

// Days until next Monday (1–7).
export const daysToMonday = (from = new Date()) => ((8 - new Date(from.getTime() + 330 * 60000).getUTCDay()) % 7) || 7

// A pre-filled Google Calendar "add event" link: an hour at the given time, or
// an all-day event when the email gave no time.
export function calendarLink(item) {
  const stamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const due = new Date(item.dueAt)
  let dates
  if (item.dueHasTime) {
    dates = `${stamp(due)}/${stamp(new Date(due.getTime() + 60 * 60 * 1000))}`
  } else {
    const day = dayKey(due).replace(/-/g, '')
    const next = dayKey(new Date(due.getTime() + DAY_MS)).replace(/-/g, '')
    dates = `${day}/${next}`
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: item.subject || 'From Mailmind',
    dates,
    details: `Open the email: ${item.gmailUrl}`,
  })
  return `https://calendar.google.com/calendar/render?${params}`
}
