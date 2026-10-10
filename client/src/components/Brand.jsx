import { Link } from 'react-router-dom'

// The mark (a black tile with a strip of tape across it) and the name.
// compact: on the narrowest phones, show only the mark.
function Brand({ to = '/', compact = false }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 text-[22px] font-black uppercase tracking-wide condensed">
      <span
        aria-hidden="true"
        className="brand-mark grid size-[30px] place-items-center rounded-md pb-1.5 text-[17px]"
      >
        M
      </span>
      <span className={compact ? 'max-[400px]:sr-only' : ''}>Mailmind</span>
    </Link>
  )
}

export default Brand
