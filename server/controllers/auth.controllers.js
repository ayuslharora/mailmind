import crypto from "crypto";
import User from "../models/user.model.js";
import generateToken from "../utils/generateToken.js";
import { encrypt } from "../utils/crypto.js";
import { isClassifying } from "../utils/classifyThreads.js";
import { deleteAccount } from "../utils/deleteAccount.js";
import { isSyncing } from "../utils/sync.js";
import { createOAuthClient, GMAIL_SCOPES } from "../utils/gmail.js";

// One step: Google sign-in and read-only Gmail access on the same screen.
const SIGN_IN_SCOPES = ["openid", "email", "profile", ...GMAIL_SCOPES];

const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProduction,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Short-lived cookie that ties Google's reply to this browser (stops a
// stranger's sign-in link from logging you into their account).
const stateCookieOptions = { ...cookieOptions, maxAge: 10 * 60 * 1000 };

const backToClient = (res, query = "") => res.redirect(`${process.env.CLIENT_ORIGIN}/${query}`);

export const startGoogleSignIn = (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_state", state, stateCookieOptions);

  const url = createOAuthClient().generateAuthUrl({
    // Offline + consent: Google returns a refresh token, so sync can run
    // while the user is away.
    access_type: "offline",
    prompt: "consent",
    scope: SIGN_IN_SCOPES,
    state,
  });

  return res.redirect(url);
};

export const finishGoogleSignIn = async (req, res) => {
  const { code, state, error } = req.query;
  const expectedState = req.cookies.oauth_state;
  res.clearCookie("oauth_state");

  if (error || !code || !state || state !== expectedState) {
    return backToClient(res, "?signin=failed");
  }

  try {
    const auth = createOAuthClient();
    const { tokens } = await auth.getToken(code);

    // Google lets people untick Gmail access; Mailmind cannot work without it.
    const granted = tokens.scope?.split(" ") ?? [];
    if (!GMAIL_SCOPES.every((scope) => granted.includes(scope))) {
      return backToClient(res, "?signin=gmail-access");
    }

    const ticket = await auth.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const { sub: googleId, email, name } = ticket.getPayload();

    const update = { googleId, email, name };
    if (tokens.refresh_token) update.encryptedRefreshToken = encrypt(tokens.refresh_token);

    const user = await User.findOneAndUpdate({ googleId }, update, { upsert: true, new: true, setDefaultsOnInsert: true });

    res.cookie("token", generateToken(user._id), cookieOptions);
    return backToClient(res);
  } catch (err) {
    console.error(err);
    return backToClient(res, "?signin=failed");
  }
};

export const getMe = (req, res) => {
  const { _id, email, name, sync } = req.user;
  return res.status(200).json({
    user: { _id, email, name, backfillDone: sync?.backfillDone ?? false, lastSyncedAt: sync?.lastSyncedAt ?? null },
  });
};

export const logoutUser = (req, res) => {
  res.clearCookie("token", cookieOptions);
  return res.status(200).json({ message: "Logged out" });
};

// "Delete all my data". Refused while mail is being fetched or sorted, so
// a background job cannot write data back after it has been deleted.
export const deleteMe = async (req, res) => {
  if (isSyncing(req.user._id) || isClassifying(req.user._id)) {
    return res.status(409).json({ message: "Your mail is still being fetched or sorted. Try again in a minute." });
  }
  const result = await deleteAccount(req.user._id);
  res.clearCookie("token", cookieOptions);
  return res.status(200).json({ message: "All your data was deleted", ...result });
};
