import { useEffect, useState } from 'react'
import axiosInstance from '../axiosCalls/axios'

// Minimal on purpose: the front end will be redesigned.
function Digest() {
  const [digest, setDigest] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    axiosInstance
      .get('/digest')
      .then(({ data }) => active && setDigest(data))
      .catch((err) => active && setError(err.response?.data?.message ?? 'Could not load the digest.'))
    return () => {
      active = false
    }
  }, [])

  if (error) return <p className="mt-8 text-sm text-danger">{error}</p>
  if (!digest) return <p className="mt-8 text-grey">Writing your digest…</p>

  return (
    <section className="mt-8">
      <p className="text-2xl font-bold leading-snug text-balance">{digest.headline}</p>
      {digest.points.length > 0 && (
        <ol className="mt-6 space-y-4">
          {digest.points.map((point, i) => (
            <li key={point.threadId} className="flex gap-4">
              <span
                aria-hidden="true"
                className="tent grid h-[30px] w-[26px] shrink-0 place-items-end justify-center pb-1 text-sm font-black condensed"
              >
                {i + 1}
              </span>
              <span className="pt-1">
                {point.text}{' '}
                <a href={point.gmailUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-grey underline underline-offset-2">
                  Open
                </a>
              </span>
            </li>
          ))}
        </ol>
      )}
      {digest.sorting > 0 && (
        <p className="mt-6 text-sm text-grey">{digest.sorting} emails are still being sorted and are not in this digest yet.</p>
      )}
    </section>
  )
}

export default Digest
