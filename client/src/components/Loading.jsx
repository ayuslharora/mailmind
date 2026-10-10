// Render's free tier sleeps; the first request after a while can take ~50s.
function Loading({ text = 'Loading…' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-grey">
      <span
        aria-hidden="true"
        className="brand-mark grid size-10 place-items-center rounded-lg pb-2 text-2xl font-black condensed"
      >
        M
      </span>
      <p>{text}</p>
      <div aria-hidden="true" className="hazard-crawl h-1.5 w-40 rounded-full" />
    </div>
  )
}

export default Loading
