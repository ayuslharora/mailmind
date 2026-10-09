import { Link, useSearchParams } from 'react-router-dom'

const SIGN_IN_ERRORS = {
  failed: 'Sign-in did not finish. Please try again.',
  'gmail-access': 'Mailmind needs permission to read your Gmail. Please sign in again and tick the Gmail box.',
  'not-invited': 'Mailmind is invite-only for now, and this Google account is not on the list. Nothing was saved.',
}

function Landing() {
  const [params] = useSearchParams()
  const error = SIGN_IN_ERRORS[params.get('signin')]

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-12">
      <h1 className="text-4xl font-bold tracking-tight">Mailmind</h1>
      <p className="mt-3 text-lg text-gray-600 dark:text-gray-300">
        What needs you today, the deadlines buried in your inbox, and answers about your mail — without your secrets
        reaching an AI.
      </p>

      <ul className="mt-6 space-y-2 text-sm text-gray-600 dark:text-gray-400">
        <li>• OTPs, card numbers, Aadhaar, PAN and login links are removed on our server before any AI sees your mail.</li>
        <li>• Read-only access: Mailmind can never send, delete or change your email.</li>
        <li>• Your original emails are never stored. Opening one takes you to Gmail.</li>
      </ul>

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {/* A plain link, not axios: Google's sign-in page needs a full page visit. */}
      <a
        href="/api/auth/google"
        className="mt-8 inline-flex w-fit items-center rounded-lg bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
      >
        Sign in with Google
      </a>

      <p className="mt-10 text-sm text-gray-500 dark:text-gray-400">
        <Link to="/privacy" className="underline underline-offset-2">
          Privacy policy
        </Link>
        {' · '}
        <Link to="/terms" className="underline underline-offset-2">
          Terms
        </Link>
      </p>
    </main>
  )
}

export default Landing
