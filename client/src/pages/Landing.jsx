import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import '../components/landing/landing.css'
import DeleteScene from '../components/landing/DeleteScene'
import Finale from '../components/landing/Finale'
import Intro from '../components/landing/Intro'
import JevScene from '../components/landing/JevScene'
import RedactionScene from '../components/landing/RedactionScene'
import SortScene from '../components/landing/SortScene'

// three.js is large, so the map scene loads after the rest of the page.
const MapScene = lazy(() => import('../components/landing/MapScene'))

const SIGN_IN_ERRORS = {
  failed: 'Sign-in did not finish. Please try again.',
  'gmail-access': 'Mailmind needs permission to read your Gmail. Please sign in again and tick the Gmail box.',
  'not-invited': 'Mailmind is invite-only for now, and this Google account is not on the list. Nothing was saved.',
}

// The landing page tells, in one scroll, what Mailmind does with an email:
// redacts it, sends the AI only what is left, sorts it, makes it searchable,
// and deletes all of it on request.
function Landing() {
  const [params] = useSearchParams()
  const error = SIGN_IN_ERRORS[params.get('signin')]

  return (
    <div className="landing">
      <Intro />
      <header className="bar-top">
        <div className="wordmark">Mailmind</div>
        {/* A plain link, not axios: Google's sign-in page needs a full page visit. */}
        <a className="signin" href="/api/auth/google">
          Sign in with Google
        </a>
      </header>
      {error && (
        <p role="alert" className="signin-error">
          {error}
        </p>
      )}

      <RedactionScene />
      <JevScene />
      <SortScene />
      {/* Same height as the scene, so the page does not jump when it loads. */}
      <Suspense fallback={<div className="track4" />}>
        <MapScene />
      </Suspense>
      <DeleteScene />
      <Finale />
    </div>
  )
}

export default Landing
