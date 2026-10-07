// Turns the words a user typed ("ayus arora", "kaggle") into the senders in
// their mailbox those words mean, allowing small typos.

const words = (text = "") =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);

// Edits needed to turn a into b (insertions, deletions, substitutions).
function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

// "ayus" matches "ayush" (start of the word) and "arrora" matches "arora"
// (one typo in a word of five letters or more).
const close = (typed, actual) =>
  actual.startsWith(typed) || (typed.length >= 5 && editDistance(typed, actual) <= 1);

// from: a From header such as 'Ayush Arora <news@blog.ayuslh.in>'. Every
// typed word must match a word of the sender's name or address.
export function senderMatches(typed, from) {
  const wanted = words(typed);
  const available = words(from);
  return wanted.length > 0 && wanted.every((word) => available.some((candidate) => close(word, candidate)));
}
