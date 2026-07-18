import { Prisma } from "@prisma/client";

/**
 * Retry a Prisma operation on transient lock/timeout errors.
 *
 * SQLite has a single writer lock, so concurrent reviews (e.g. from
 * multi-word games submitting secondary reviews) can collide with
 * transaction timeouts, socket timeouts, or write conflicts. These are
 * transient — retrying after a short backoff usually succeeds.
 *
 * Ported from the Flashcards app, which discovered these issues in
 * production and fixed them with this exact pattern.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 4
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      // Determine if this is a transient error worth retrying.
      let isTransient = false;
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // P2028 = transaction timeout
        // P2034 = write conflict/rollback
        // P1001 = socket timeout (database didn't respond in time)
        // P1002 = socket went away
        isTransient = ["P2028", "P2034", "P1001", "P1002"].includes(e.code);
      }
      if (!isTransient || attempt === maxRetries) throw e;
      // Exponential backoff: 150ms, 300ms, 600ms, 1200ms
      await new Promise((r) => setTimeout(r, 150 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

/** Fisher-Yates shuffle — returns a new array. */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
