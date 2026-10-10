import { Link } from 'react-router-dom'
import Brand from '../components/Brand'

function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="flex items-center justify-between gap-4 border-b border-rule pb-4">
        <Brand />
        <Link to="/" className="text-sm font-semibold underline underline-offset-2">
          Back to Mailmind
        </Link>
      </header>
      <h1 className="mt-12 text-5xl font-black uppercase leading-none condensed sm:text-6xl">Terms of service</h1>
      <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-grey">Effective 9 October 2026</p>
      <div className="mt-6 space-y-4 text-ink/80">
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
