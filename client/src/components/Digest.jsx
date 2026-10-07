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

  if (error) return <p className="mt-8 text-sm text-red-700 dark:text-red-300">{error}</p>
  if (!digest) return <p className="mt-8 text-gray-500 dark:text-gray-400">Writing your digest…</p>

  return (
    <section className="mt-8">
      <p className="text-lg font-medium">{digest.headline}</p>
      {digest.points.length > 0 && (
        <ul className="mt-4 space-y-3">
          {digest.points.map((point) => (
            <li key={point.threadId} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>
                {point.text}{' '}
                <a
                  href={point.gmailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-gray-500 underline underline-offset-2 dark:text-gray-400"
                >
                  Open
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}
      {digest.sorting > 0 && (
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          {digest.sorting} emails are still being sorted and are not in this digest yet.
        </p>
      )}
    </section>
  )
}

export default Digest
