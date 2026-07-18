import { PrismaClient } from '@prisma/client'
import path from 'node:path'
import fs from 'node:fs'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Resolve the SQLite DATABASE_URL to an absolute path before instantiating
 * PrismaClient. This is critical for the ZAI publish pipeline: the .env
 * ships with a *relative* path (`file:./db/custom.db`) so the repo is
 * location-independent, but Prisma resolves relative SQLite paths relative
 * to the schema file at build time and relative to the cwd at runtime —
 * which can land the DB file in two different places. Pinning it to an
 * absolute path here guarantees the runtime connects to the exact DB that
 * `prisma db push` created during `prebuild`.
 *
 * Also defensively creates the parent directory in case the deploy env
 * doesn't have it yet.
 */
function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL
  if (!raw) {
    // Fallback: <cwd>/db/custom.db
    const dir = path.join(process.cwd(), 'db')
    fs.mkdirSync(dir, { recursive: true })
    return `file:${path.join(dir, 'custom.db')}`
  }
  if (!raw.startsWith('file:')) return raw
  const relOrAbs = raw.slice('file:'.length)
  if (relOrAbs.startsWith('/')) return raw // already absolute
  const abs = path.resolve(process.cwd(), relOrAbs)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  return `file:${abs}`
}

// Only enable query logging when explicitly requested via DEBUG_QUERIES env
// var. The previous default (`log: ['query']`) was very noisy in dev and
// could slow down request handling on hot paths (lesson from the Flashcards app).
const logQueries = process.env.DEBUG_QUERIES === '1'

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolveDatabaseUrl(),
    log: logQueries ? ['query', 'error', 'warn'] : ['error', 'warn'],
    // Increase the interactive transaction timeout to 15s (default 5s).
    // SQLite has a single writer lock, so when multi-word games submit several
    // reviews concurrently, transactions queue up and can exceed the 5s
    // default — causing P2028 "Transaction already closed" errors and 500s.
    transactionOptions: {
      timeout: 15_000,
      maxWait: 10_000,
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
