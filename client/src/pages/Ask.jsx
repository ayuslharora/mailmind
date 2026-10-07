import { useState } from 'react'
import { Link } from 'react-router-dom'
import axiosInstance from '../axiosCalls/axios'
import { formatReceived } from '../utils/format'

// Minimal on purpose: the front end will be redesigned.
function Ask() {
  const [turns, setTurns] = useState([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState(null)

  const ask = async (e) => {
    e.preventDefault()
    const text = question.trim()
    if (!text || asking) return
    setAsking(true)
    setError(null)
    const history = turns.flatMap((t) => [
      { role: 'user', text: t.question },
      { role: 'assistant', text: t.answer },
    ])
    try {
      const { data } = await axiosInstance.post('/ask', { question: text, history })
      setTurns((all) => [...all, { question: text, ...data }])
      setQuestion('')
    } catch (err) {
      setError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setAsking(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Ask your inbox</h1>
        <Link to="/today" className="text-sm underline underline-offset-2">
          Today
        </Link>
      </header>

      <ol className="mt-6 space-y-6">
        {turns.map((turn, i) => (
          <li key={i}>
            <p className="font-medium">{turn.question}</p>
            <p className="mt-1 text-gray-700 dark:text-gray-300">{turn.answer}</p>
            {turn.citations.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {turn.citations.map((c) => (
                  <li key={c.gmailId}>
                    <a href={c.gmailUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      {c.subject || '(no subject)'}
                    </a>{' '}
                    <span className="text-gray-500 dark:text-gray-400">
                      · {c.from} · {formatReceived(c.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <form onSubmit={ask} className="mt-6 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. When is my Kaggle deadline?"
          maxLength={500}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={asking || !question.trim()}
          className="rounded-lg bg-gray-900 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
        >
          {asking ? 'Thinking…' : 'Ask'}
        </button>
      </form>
    </main>
  )
}

export default Ask
