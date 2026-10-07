// Render's free tier sleeps; the first request after a while can take ~50s.
function Loading({ text = 'Loading…' }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-gray-500 dark:text-gray-400">
      <p>{text}</p>
    </div>
  )
}

export default Loading
