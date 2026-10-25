import { useLocation } from 'react-router-dom'

// The demo: the same pages under /demo, showing one shared inbox of fake
// emails with no sign-in. A visitor's changes stay in their own browser and
// are sent along with each Today request, so nobody changes the inbox for
// the next visitor.
export const useDemo = () => useLocation().pathname.startsWith('/demo')

// Where a page lives in the demo or the real app: '/today' is '/demo' in the demo.
export const pagePath = (demo, path) => (demo ? `/demo${path === '/today' ? '' : path}` : path)

// The API route: '/threads/x' is '/demo/threads/x' in the demo.
export const apiPath = (demo, path) => (demo ? `/demo${path}` : path)

const KEY = 'mailmind-demo-changes'
const empty = () => ({ threads: {}, senders: {} })

// Kept in memory too, so the demo still works where storage is blocked
// (some private windows); the changes then last until the tab is closed.
let memory = null

export function loadChanges() {
  if (memory) return memory
  try {
    memory = JSON.parse(localStorage.getItem(KEY)) ?? empty()
  } catch {
    memory = empty()
  }
  return memory
}

function save(changes) {
  memory = changes
  try {
    localStorage.setItem(KEY, JSON.stringify(changes))
  } catch {
    // Storage blocked: memory only.
  }
}

// The change the real app saves on the server (PATCH /threads/:id), saved
// in this browser instead.
export function saveChange(item, change) {
  const changes = loadChanges()
  const own = { ...changes.threads[item.threadId] }
  if (change.state) {
    own.state = change.state
    delete own.snoozeUntil
  }
  if (change.snoozeUntil) {
    own.state = 'snoozed'
    own.snoozeUntil = change.snoozeUntil
  }
  if (change.category) own.category = change.category
  if (change.needsAction !== undefined) own.needsAction = change.needsAction

  const senders =
    change.category && change.applyToSender && item.sender
      ? { ...changes.senders, [item.sender]: change.category }
      : changes.senders
  save({ threads: { ...changes.threads, [item.threadId]: own }, senders })
}

export const resetChanges = () => save(empty())
