import { Link } from 'react-router-dom'

function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link to="/" className="text-sm underline underline-offset-2">
        ← Mailmind
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Terms of service</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Effective 9 October 2026</p>
      <div className="mt-6 space-y-4 text-gray-700 dark:text-gray-300">
        <p>
          Mailmind is a free student project, offered as it is, without any warranty. It is invite-only: only people
          the author has added can use it.
        </p>
        <p>
          Mailmind's sorting, dates and answers are made by automated rules and AI models and can be wrong. Always check
          important emails in Gmail itself.
        </p>
        <p>
          Mailmind may change, stop working or shut down at any time. You can delete your data and remove its access
          whenever you like, as described in the{' '}
          <Link to="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </main>
  )
}

export default Terms
