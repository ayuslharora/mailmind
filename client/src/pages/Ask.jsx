import { useState } from 'react'
import axiosInstance from '../axiosCalls/axios'
import AppBar from '../components/AppBar'
import Redacted from '../components/Redacted'
import { formatReceived } from '../utils/format'

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
      const { data } = await axiosInstance.post('/ask', {
        question: text,
        history,
      })
      // The reply also carries the question as rewritten for search; show and
      // remember what was actually typed.
      setTurns((all) => [...all, { ...data, question: text }])
      setQuestion('')
    } catch (err) {
      setError(err.response?.data?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setAsking(false)
    }
  }

  return (
    <>
      <AppBar />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8">
        <h1 className="text-[44px] font-black uppercase leading-none condensed">Ask your inbox</h1>
        <p className="mt-3 max-w-[52ch] text-grey">
          Answers come from your redacted emails, and each one shows the emails it used. Hidden secrets stay hidden.
        </p>

        <ol className="mt-8 space-y-8">
          {turns.map((turn, i) => (
            // Yours on the right, Mailmind's on the left, like a chat.
            <li key={i} className="space-y-3">
              <div className="flex justify-end">
                <p className="max-w-[80%] rounded-sm bg-ink px-4 py-2.5 font-semibold text-paper">{turn.question}</p>
              </div>
              <div className="max-w-[85%] rounded-sm border border-rule px-4 py-3">
                <p className="text-lg leading-relaxed">
                  <Redacted text={turn.answer} />
                </p>
                {turn.citations.length > 0 && (
                  <div className="mt-3 border-t border-rule pt-3">
                    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-grey">Sources</p>
                    <ol className="mt-2 space-y-2 text-sm">
                      {turn.citations.map((c, n) => (
                        <li key={c.gmailId} className="flex items-baseline gap-3">
                          <span
                            aria-hidden="true"
                            className="tent grid h-5 w-[18px] shrink-0 place-items-end justify-center pb-0.5 text-[11px] font-black"
                          >
                            {n + 1}
                          </span>
                          <span>
                            <a
                              href={c.gmailUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold underline underline-offset-2"
                            >
                              {c.subject || '(no subject)'}
                            </a>{' '}
                            <span className="text-grey">
                              · {c.from} · {formatReceived(c.date)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {asking && <div aria-hidden="true" className="hazard-crawl mt-8 h-1.5 rounded-full" />}

        {error && (
          <p role="alert" className="mt-6 flex overflow-hidden rounded-sm border border-ink/20 text-sm">
            <span aria-hidden="true" className="hazard w-2.5 shrink-0" />
            <span className="p-3">{error}</span>
          </p>
        )}

        <form onSubmit={ask} className="mt-8 flex gap-3">
          {/* The box sits on a strip of barrier tape, like the landing page's question. */}
          <div className="relative flex-1">
            <span aria-hidden="true" className="hazard absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-sm" />
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. When is my Kaggle deadline?"
              maxLength={500}
              aria-label="Your question"
              className="relative w-full rounded-sm border border-ink bg-paper px-4 py-3 text-[17px] outline-none placeholder:text-grey focus:border-2"
            />
          </div>
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="btn-tape rounded-sm px-5 font-bold disabled:opacity-50"
          >
            {asking ? 'Thinking…' : 'Ask'}
          </button>
        </form>
      </main>
    </>
  )
}

export default Ask
