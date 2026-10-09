import { Link } from 'react-router-dom'

const CONTACT = 'https://github.com/ayuslharora/mailmind/issues'

function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-gray-700 dark:text-gray-300">{children}</div>
    </section>
  )
}

function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link to="/" className="text-sm underline underline-offset-2">
        ← Mailmind
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Privacy policy</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Effective 9 October 2026</p>

      <p className="mt-6 text-gray-700 dark:text-gray-300">
        Mailmind is a student project that sorts your Gmail inbox and answers questions about it. It is invite-only. This
        page explains exactly what it reads, stores and shares.
      </p>

      <Section title="What Mailmind can access">
        <p>
          When you sign in with Google you grant read-only access to your Gmail (<code>gmail.readonly</code>) and your
          name and email address. Mailmind can never send, delete, move or change your email.
        </p>
        <p>
          It reads your inbox from the last 30 days when you first sign in, then new mail about every 15 minutes. It
          reads each email's sender, subject, date, Gmail labels and text. It does not read attachments, and it skips
          spam and trash.
        </p>
      </Section>

      <Section title="Secrets are removed before anything is stored">
        <p>
          On our server, before an email is saved or sent to any AI service, Mailmind replaces one-time passwords, card
          numbers, CVVs, PINs, Aadhaar and PAN numbers, bank account numbers, passwords, phone numbers, IP addresses and
          sign-in or reset links with placeholders such as [OTP] or [CARD]. Your original, unredacted emails are never
          stored. This removal is automatic and pattern-based, so unusual formats can occasionally be missed.
        </p>
      </Section>

      <Section title="What is stored">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your name, email address and Google account ID.</li>
          <li>Your Gmail access token, encrypted (AES-256-GCM).</li>
          <li>The redacted copy of each email, with sender, date, Gmail labels and any dates found in it.</li>
          <li>Search data made from the redacted text (text pieces and their numeric embeddings).</li>
          <li>How the AI sorted each email, and any corrections you make.</li>
        </ul>
        <p>Data is stored in MongoDB Atlas and kept until you delete it.</p>
      </Section>

      <Section title="Who receives your data">
        <p>Only redacted text is sent to AI services, and only to provide Mailmind's features:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Groq: sorting emails, answering your questions, the daily digest.</li>
          <li>OpenRouter (TypeSafe's decision model): sorting emails.</li>
          <li>Cloudflare Workers AI: turning redacted text into search embeddings.</li>
        </ul>
        <p>
          Mailmind is hosted on Render (server) and Vercel (website), with data in MongoDB Atlas. Each provider handles
          data under its own terms. Mailmind does not sell your data, show ads, or use your data to train AI models.
        </p>
      </Section>

      <Section title="Google API Services User Data Policy">
        <p>
          Mailmind's use and transfer of information received from Google APIs to any other app will adhere to the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          &ldquo;Delete all my data&rdquo; in the app stops any sync in progress, deletes everything Mailmind stored
          about you, and revokes its access to your Gmail. You can also remove access at any time at{' '}
          <a
            href="https://myaccount.google.com/permissions"
            className="underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            myaccount.google.com/permissions
          </a>
          ; to have stored data deleted after that, contact us.
        </p>
      </Section>

      <Section title="Security">
        <p>
          All traffic uses HTTPS. Your login is kept in a secure, HTTP-only cookie, and your Gmail access token is
          encrypted at rest.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions or deletion requests:{' '}
          <a href={CONTACT} className="underline underline-offset-2" target="_blank" rel="noreferrer">
            open an issue on the project's GitHub page
          </a>
          .
        </p>
      </Section>
    </main>
  )
}

export default Privacy
