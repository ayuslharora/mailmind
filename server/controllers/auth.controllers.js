import crypto from "crypto";
import User from "../models/user.model.js";
import generateToken from "../utils/generateToken.js";
import { encrypt } from "../utils/crypto.js";
import { isClassifying } from "../utils/classifyThreads.js";
import { deleteAccount } from "../utils/deleteAccount.js";
import { clearStop, requestStop } from "../utils/stopSync.js";
import { isSyncing, syncUser } from "../utils/sync.js";
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
    // Not awaited: the first sync (30 days) starts straight away, and the
    // Today page shows "Fetching your mail…" until it is done.
    syncUser(user._id);
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

const STOP_WAIT_MS = 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// "Delete all my data": stops any sync or classification for the user first
// (they check between steps), waits for them to finish stopping, then
// deletes, so nothing can be written back afterwards.
export const deleteMe = async (req, res) => {
  const userId = req.user._id;
  requestStop(userId);
  try {
    const deadline = Date.now() + STOP_WAIT_MS;
    while ((isSyncing(userId) || isClassifying(userId)) && Date.now() < deadline) await sleep(250);
    if (isSyncing(userId) || isClassifying(userId)) {
      return res.status(503).json({ message: "Still stopping your sync. Please try again in a minute." });
    }
    const result = await deleteAccount(userId);
    res.clearCookie("token", cookieOptions);
    return res.status(200).json({ message: "All your data was deleted", ...result });
  } finally {
    clearStop(userId);
  }
};
