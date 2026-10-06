import { google } from "googleapis";
import { convert } from "html-to-text";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export const createOAuthClient = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

const decode = (data) => Buffer.from(data, "base64url").toString("utf8");

const header = (payload, name) =>
  payload.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

function findPart(part, mimeType) {
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

// Prefers the plain-text part; falls back to the HTML part converted to text.
// Links stay in the text as "label [url]" so redaction can see them.
function bodyText(payload) {
  const plain = findPart(payload, "text/plain");
  if (plain) return decode(plain.body.data);
  const html = findPart(payload, "text/html");
  if (!html) return "";
  return convert(decode(html.body.data), {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      { selector: "img", format: "skip" },
    ],
  });
}

export async function listMessageIds(auth, { query, max }) {
  const gmail = google.gmail({ version: "v1", auth });
  const ids = [];
  let pageToken;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: Math.min(500, max - ids.length),
      pageToken,
    });
    ids.push(...(res.data.messages ?? []).map((m) => m.id));
    pageToken = res.data.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids;
}

export async function getMessage(auth, id) {
  const gmail = google.gmail({ version: "v1", auth });
  const { data } = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  return {
    id: data.id,
    threadId: data.threadId,
    labelIds: data.labelIds ?? [],
    from: header(data.payload, "From"),
    date: new Date(Number(data.internalDate)),
    subject: header(data.payload, "Subject"),
    body: bodyText(data.payload),
  };
}
