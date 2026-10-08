// Lets "Delete all my data" stop a user's sync and classification part-way:
// the loops check between steps and stop, so nothing is written after the
// data is deleted.
const stopping = new Set();

export class SyncStopped extends Error {}

export const requestStop = (userId) => stopping.add(String(userId));
export const clearStop = (userId) => stopping.delete(String(userId));
export const stopRequested = (userId) => stopping.has(String(userId));

export function throwIfStopped(userId) {
  if (stopRequested(userId)) throw new SyncStopped(`Stopped for user ${userId}`);
}
