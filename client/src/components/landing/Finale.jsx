import { Link } from 'react-router-dom'
import { replayIntro } from '../../utils/introGate'

const REPO = 'https://github.com/ayuslharora/mailmind'

function Finale() {
  return (
    <section className="finale">
      <h2>Your inbox, sorted. Your secrets never reach the AI.</h2>
      <div className="actions">
        <a className="signin" href="/api/auth/google">
          Sign in with Google
        </a>
      </div>
      <p className="small">Invite-only for now. Read-only access to Gmail.</p>
      <footer>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <a href={REPO} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <span>
          The intro plays once per tab.{' '}
          <button type="button" className="replay" onClick={replayIntro}>
            Replay intro
          </button>
        </span>
      </footer>
    </section>
  )
}

export default Finale
