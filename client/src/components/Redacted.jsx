// Text as Mailmind stores it, with every placeholder ([CARD], [OTP],
// [LINK:bank.com]) drawn as a small piece of tape, so you can see at a
// glance what was taken out.
const PLACEHOLDER = /(\[(?:[A-Z_]{2,}|LINK:[^\]\s]+)\])/

function Redacted({ text }) {
  return text.split(PLACEHOLDER).map((part, i) =>
    i % 2 ? (
      <span
        key={i}
        title={`Hidden by Mailmind: ${part}`}
        className="tape mx-px inline-block px-1.5 py-px align-[1px] font-mono text-[0.72em] font-bold tracking-wider"
      >
        {part.slice(1, -1).replace(':', ' · ')}
      </span>
    ) : (
      part
    ),
  )
}

export default Redacted
