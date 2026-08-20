/**
 * Rate limiter backed by NeonDB (PostgreSQL).
 * State is shared across all serverless instances — safe in serverless deployments.
 * Falls back to in-memory when DATABASE_URL is absent (local dev without DB).
 */

import { Pool } from '@neondatabase/serverless';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

// ── In-memory fallback (development without DATABASE_URL) ─────────────────────

interface MemEntry {
  count: number;
  firstAttempt: number;
  blockedUntil?: number;
}

const memStore = new Map<string, MemEntry>();

function checkRateLimitMem(
  key: string,
  maxAttempts: number,
  windowMs: number,
  blockMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = memStore.get(key);

  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }

  if (!entry || now - entry.firstAttempt > windowMs) {
    memStore.set(key, { count: 1, firstAttempt: now });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  entry.count += 1;
  if (entry.count > maxAttempts) {
    entry.blockedUntil = now + blockMs;
    return { allowed: false, remaining: 0, retryAfter: Math.ceil(blockMs / 1000) };
  }

  return { allowed: true, remaining: maxAttempts - entry.count };
}

// ── Database-backed rate limiter ──────────────────────────────────────────────

let _pool: Pool | undefined;
let _tableReady = false;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  }
  return _pool;
}

async function ensureTable(): Promise<void> {
  if (_tableReady) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS _rate_limit_store (
      key        TEXT    PRIMARY KEY,
      count      INTEGER NOT NULL DEFAULT 0,
      first_ts   BIGINT  NOT NULL,
      blocked_ts BIGINT
    )
  `);
  _tableReady = true;
}

async function checkRateLimitDb(
  key: string,
  maxAttempts: number,
  windowMs: number,
  blockMs: number
): Promise<RateLimitResult> {
  await ensureTable();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{
      count: number;
      first_ts: string;
      blocked_ts: string | null;
    }>('SELECT count, first_ts, blocked_ts FROM _rate_limit_store WHERE key = $1 FOR UPDATE', [key]);

    const row = rows[0];
    const now = Date.now();

    if (row?.blocked_ts && Number(row.blocked_ts) > now) {
      await client.query('COMMIT');
      return { allowed: false, remaining: 0, retryAfter: Math.ceil((Number(row.blocked_ts) - now) / 1000) };
    }

    if (!row || now - Number(row.first_ts) > windowMs) {
      await client.query(
        `INSERT INTO _rate_limit_store (key, count, first_ts, blocked_ts) VALUES ($1, 1, $2, NULL)
         ON CONFLICT (key) DO UPDATE SET count = 1, first_ts = $2, blocked_ts = NULL`,
        [key, now]
      );
      await client.query('COMMIT');
      return { allowed: true, remaining: maxAttempts - 1 };
    }

    const newCount = row.count + 1;

    if (newCount > maxAttempts) {
      const blockedUntil = now + blockMs;
      await client.query(
        'UPDATE _rate_limit_store SET count = $2, blocked_ts = $3 WHERE key = $1',
        [key, newCount, blockedUntil]
      );
      await client.query('COMMIT');
      return { allowed: false, remaining: 0, retryAfter: Math.ceil(blockMs / 1000) };
    }

    await client.query('UPDATE _rate_limit_store SET count = $2 WHERE key = $1', [key, newCount]);
    await client.query('COMMIT');
    return { allowed: true, remaining: maxAttempts - newCount };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

const useDb = !!process.env.DATABASE_URL;

export async function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
  blockMs = 30 * 60 * 1000
): Promise<RateLimitResult> {
  if (!useDb) return checkRateLimitMem(key, maxAttempts, windowMs, blockMs);
  return checkRateLimitDb(key, maxAttempts, windowMs, blockMs);
}

export async function resetRateLimit(key: string): Promise<void> {
  if (!useDb) { memStore.delete(key); return; }
  await ensureTable();
  await getPool().query('DELETE FROM _rate_limit_store WHERE key = $1', [key]);
}
