// Who may use Mailmind: the emails in ALLOWED_EMAILS, comma-separated.
// Anyone else is turned away at sign-in, before anything is saved, and
// removing an email cuts that account off on its next request.
const allowedEmails = () =>
  new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

export const isAllowed = (email = "") => allowedEmails().has(email.toLowerCase());
