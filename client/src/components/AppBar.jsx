import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import axiosInstance from '../axiosCalls/axios'
import { useAuth } from '../context/AuthContext'
import { isDark, setTheme } from '../utils/theme'
import Brand from './Brand'

const NAV = [
  ['/today', 'Today'],
  ['/ask', 'Ask'],
]

// The top of every signed-in page: the mark, where you can go, your account.
function AppBar() {
  const { user, logout } = useAuth()
  const [dark, setDark] = useState(isDark)

  const switchTheme = () => {
    setTheme(dark ? 'light' : 'dark')
    setDark(!dark)
  }

  const deleteEverything = async () => {
    const sure = window.confirm(
      'Delete all your data from Mailmind and remove its access to your Gmail? Your emails in Gmail are not touched. This cannot be undone.',
    )
    if (!sure) return
    try {
      await axiosInstance.delete('/auth/me')
      window.location.assign('/')
    } catch (err) {
      window.alert(err.response?.data?.message ?? 'Could not delete your data. Please try again.')
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:gap-6">
        <Brand to="/today" compact />
        <nav className="flex gap-4 text-[15px] sm:gap-5 font-semibold">
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `relative py-1 ${isActive ? 'text-ink' : 'text-grey hover:text-ink'}`}
            >
              {({ isActive }) => (
                <>
                  {label}
                  {isActive && <span aria-hidden="true" className="hazard-thin absolute inset-x-0 -bottom-0.5 h-1.5" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        {/* Light or dark: a sun shows in dark mode, a moon in light mode. */}
        <button
          type="button"
          onClick={switchTheme}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="ml-auto grid size-[34px] place-items-center rounded-sm border border-rule hover:border-ink"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {dark ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </>
            ) : (
              <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
            )}
          </svg>
        </button>
        <details className="relative -ml-2 sm:-ml-3">
          <summary className="cursor-pointer list-none rounded-sm border border-rule px-3 py-1.5 text-sm font-medium hover:border-ink">
            Account
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-64 space-y-3 rounded-sm border border-ink bg-paper p-4 text-sm shadow-[5px_5px_0_var(--color-ink)]">
            <p className="truncate text-grey">{user.email}</p>
            <button type="button" onClick={logout} className="block font-semibold underline underline-offset-2">
              Log out
            </button>
            <button
              type="button"
              onClick={deleteEverything}
              className="block font-semibold text-danger underline underline-offset-2"
            >
              Delete all my data
            </button>
          </div>
        </details>
      </div>
    </header>
  )
}

export default AppBar
