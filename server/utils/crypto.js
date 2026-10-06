import crypto from "crypto";

// AES-256-GCM with the key in ENCRYPTION_KEY (32 random bytes, base64).
// Used only for credentials: Gmail refresh tokens, and later users' API keys.
// Email text is stored redacted but not encrypted, so it can be searched.
const ALGORITHM = "aes-256-gcm";

const key = () => Buffer.from(process.env.ENCRYPTION_KEY, "base64");

// Returns "iv.tag.ciphertext". A new random IV every time, so the same token
// never encrypts to the same text; the tag makes tampering fail on decrypt.
export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

export function decrypt(payload) {
  const [iv, tag, data] = payload.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = crypto.createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
