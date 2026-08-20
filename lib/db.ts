/**
 * Couche de données — Neon PostgreSQL.
 * Interface publique : dbSelect / dbSelectOne / dbInsert / dbUpdate / dbDelete / dbCount / dbQuery
 * getContentSetting / setContentSetting
 *
 * Setup :
 *   1. neon.tech → New project → Settings → Connection string
 *   2. Ajouter dans .env.local : DATABASE_URL=postgresql://...
 */

import { Pool } from '@neondatabase/serverless';

// ── Connexion singleton ───────────────────────────────────────────────────────
// Le module est mis en cache entre les invocations chaudes (Next.js serverless).
// Ne jamais appeler pool.end() — le pool vit pendant toute la durée du process.

let _pool: Pool | undefined;

function getPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      '❌ DATABASE_URL manquant dans .env.local\n' +
      '   → neon.tech → projet → Settings → Connection string'
    );
  }
  _pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000, query_timeout: 10000 });
  return _pool;
}

// ── Validation d'identifiant SQL (C1 — anti-injection sur les noms de colonnes) ──
// Autorise uniquement lettres, chiffres, underscore et tiret.
// Rejette les guillemets, espaces et tout caractère spécial.

function assertIdentifier(name: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Identifiant SQL non autorisé : "${name}"`);
  }
}

function sanitizeIdentifier(name: string): string {
  assertIdentifier(name);
  return name;
}

// ── Traducteur PostgREST → SQL paramétré ─────────────────────────────────────

interface Parsed {
  fields: string;
  where: string;
  orderBy: string;
  limitSql: string;
  offsetSql: string;
  values: unknown[];
}

const DEFAULT_PAGE_LIMIT = 1000; // cap serveur pour toutes les listes
const MAX_LIMIT = 5000;

function parse(queryString: string): Parsed {
  const params = new URLSearchParams(queryString);

  const select = params.get('select') || '*';
  const order  = params.get('order');
  const rawLimit  = params.get('limit');
  const rawOffset = params.get('offset');

  params.delete('select');
  params.delete('order');
  params.delete('limit');
  params.delete('offset');

  const clauses: string[] = [];
  const values: unknown[]  = [];
  let idx = 1;

  for (const [key, raw] of params.entries()) {
    // Validation du nom de colonne
    assertIdentifier(key);

    const dot = raw.indexOf('.');
    if (dot === -1) continue;
    const op  = raw.slice(0, dot);
    const val = decodeURIComponent(raw.slice(dot + 1));

    switch (op) {
      case 'eq':
        if      (val === 'true')  clauses.push(`"${key}" = true`);
        else if (val === 'false') clauses.push(`"${key}" = false`);
        else if (val === 'null')  clauses.push(`"${key}" IS NULL`);
        else { clauses.push(`"${key}" = $${idx++}`); values.push(val); }
        break;
      case 'neq':
        clauses.push(`"${key}" != $${idx++}`); values.push(val);
        break;
      case 'ilike':
        clauses.push(`"${key}" ILIKE $${idx++}`); values.push(val);
        break;
      case 'like':
        clauses.push(`"${key}" LIKE $${idx++}`); values.push(val);
        break;
      case 'is':
        if      (val === 'null')  clauses.push(`"${key}" IS NULL`);
        else if (val === 'true')  clauses.push(`"${key}" = true`);
        else if (val === 'false') clauses.push(`"${key}" = false`);
        break;
      case 'gt':  clauses.push(`"${key}" > $${idx++}`);  values.push(val); break;
      case 'gte': clauses.push(`"${key}" >= $${idx++}`); values.push(val); break;
      case 'lt':  clauses.push(`"${key}" < $${idx++}`);  values.push(val); break;
      case 'lte': clauses.push(`"${key}" <= $${idx++}`); values.push(val); break;
      case 'in': {
        const items = val.replace(/^\(|\)$/g, '').split(',').map(v => decodeURIComponent(v.trim()));
        const ph = items.map(() => `$${idx++}`).join(', ');
        clauses.push(`"${key}" IN (${ph})`);
        values.push(...items);
        break;
      }
    }
  }

  // Champs SELECT — validation de chaque colonne nommée
  let fields: string;
  if (select === '*') {
    fields = '*';
  } else {
    fields = select.split(',').map(f => {
      const trimmed = f.trim();
      // Autoriser alias simple "col" ou "col as alias"
      const parts = trimmed.split(/\s+as\s+/i);
      assertIdentifier(parts[0].trim());
      if (parts[1]) assertIdentifier(parts[1].trim());
      return trimmed;
    }).join(', ');
  }

  // ORDER BY — validation colonne et direction
  let orderBy = '';
  if (order) {
    const orderParts = order.split(',').map(o => {
      const parts = o.split('.');
      const col = parts[0].trim();
      assertIdentifier(col);
      const dir = parts[1]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      return `"${col}" ${dir}`;
    });
    orderBy = 'ORDER BY ' + orderParts.join(', ');
  }

  // LIMIT / OFFSET — validation numérique stricte + cap
  let limitSql = `LIMIT ${DEFAULT_PAGE_LIMIT}`; // défaut sécurisé
  if (rawLimit !== null) {
    const n = parseInt(rawLimit, 10);
    if (!Number.isFinite(n) || n < 1) throw new Error(`LIMIT invalide : "${rawLimit}"`);
    limitSql = `LIMIT ${Math.min(n, MAX_LIMIT)}`;
  }

  let offsetSql = '';
  if (rawOffset !== null) {
    const n = parseInt(rawOffset, 10);
    if (!Number.isFinite(n) || n < 0) throw new Error(`OFFSET invalide : "${rawOffset}"`);
    offsetSql = `OFFSET ${n}`;
  }

  return {
    fields,
    where:    clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    orderBy,
    limitSql,
    offsetSql,
    values,
  };
}

// ── dbSelect ──────────────────────────────────────────────────────────────────

export async function dbSelect<T>(table: string, query = 'select=*'): Promise<T[]> {
  assertIdentifier(table);
  const pool = getPool();
  const { fields, where, orderBy, limitSql, offsetSql, values } = parse(query);
  const sql = [`SELECT ${fields} FROM "${table}"`, where, orderBy, limitSql, offsetSql]
    .filter(Boolean).join(' ');
  const res = await pool.query(sql, values);
  return res.rows as T[];
}

// ── dbSelectOne ───────────────────────────────────────────────────────────────

export async function dbSelectOne<T>(table: string, query: string): Promise<T | null> {
  assertIdentifier(table);
  const pool = getPool();
  const { fields, where, orderBy, values } = parse(query);
  const sql = [`SELECT ${fields} FROM "${table}"`, where, orderBy, 'LIMIT 1']
    .filter(Boolean).join(' ');
  const res = await pool.query(sql, values);
  return (res.rows[0] as T) ?? null;
}

// ── dbInsert ──────────────────────────────────────────────────────────────────

export async function dbInsert<T>(table: string, data: Partial<T>): Promise<T> {
  assertIdentifier(table);
  const pool = getPool();
  const keys = Object.keys(data as object);
  keys.forEach(k => assertIdentifier(k));
  const vals = Object.values(data as object).map(v =>
    (v !== null && typeof v === 'object') ? JSON.stringify(v) : v
  );
  const cols = keys.map(k => `"${k}"`).join(', ');
  const phs  = keys.map((_, i) => `$${i + 1}`).join(', ');
  const sql  = `INSERT INTO "${table}" (${cols}) VALUES (${phs}) RETURNING *`;
  const res  = await pool.query(sql, vals);
  return res.rows[0] as T;
}

// ── dbUpdate ──────────────────────────────────────────────────────────────────
// H2 : lève une erreur si le filtre produit une clause WHERE vide → protection contre
// la mise à jour de toute la table.

export async function dbUpdate<T>(table: string, filter: string, data: Partial<T>): Promise<T> {
  assertIdentifier(table);
  const pool = getPool();
  const payload = { ...data, updated_at: new Date().toISOString() };
  const keys = Object.keys(payload);
  keys.forEach(k => assertIdentifier(k));
  const vals = Object.values(payload).map(v =>
    (v !== null && typeof v === 'object') ? JSON.stringify(v) : v
  );

  const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  let paramIdx = keys.length + 1;

  const filterParams = new URLSearchParams(filter);
  const clauses: string[] = [];
  const filterVals: unknown[] = [];

  for (const [key, raw] of filterParams.entries()) {
    assertIdentifier(key);
    const dot = raw.indexOf('.');
    if (dot === -1) continue;
    const op  = raw.slice(0, dot);
    const val = decodeURIComponent(raw.slice(dot + 1));
    if (op === 'eq') {
      if      (val === 'true')  clauses.push(`"${key}" = true`);
      else if (val === 'false') clauses.push(`"${key}" = false`);
      else { clauses.push(`"${key}" = $${paramIdx++}`); filterVals.push(val); }
    }
  }

  // H2 — Protection contre la mise à jour sans filtre
  if (clauses.length === 0) {
    throw new Error('dbUpdate : filtre WHERE vide — opération refusée pour éviter une mise à jour globale de la table.');
  }

  const sql = `UPDATE "${table}" SET ${sets} WHERE ${clauses.join(' AND ')} RETURNING *`;
  const res = await pool.query(sql, [...vals, ...filterVals]);
  return res.rows[0] as T;
}

// ── dbDelete ──────────────────────────────────────────────────────────────────
// H2 : même protection que dbUpdate.

export async function dbDelete(table: string, filter: string): Promise<void> {
  assertIdentifier(table);
  const pool = getPool();
  const filterParams = new URLSearchParams(filter);
  const clauses: string[] = [];
  const vals: unknown[]   = [];
  let idx = 1;

  for (const [key, raw] of filterParams.entries()) {
    assertIdentifier(key);
    const dot = raw.indexOf('.');
    if (dot === -1) continue;
    const op  = raw.slice(0, dot);
    const val = decodeURIComponent(raw.slice(dot + 1));
    if (op === 'eq') {
      clauses.push(`"${key}" = $${idx++}`); vals.push(val);
    }
  }

  // H2 — Protection contre la suppression sans filtre
  if (clauses.length === 0) {
    throw new Error('dbDelete : filtre WHERE vide — opération refusée pour éviter une suppression globale de la table.');
  }

  const sql = `DELETE FROM "${table}" WHERE ${clauses.join(' AND ')}`;
  await pool.query(sql, vals);
}

// ── dbCount ───────────────────────────────────────────────────────────────────

export async function dbCount(table: string, filter?: string): Promise<number> {
  assertIdentifier(table);
  const pool = getPool();
  let where = '';
  let vals: unknown[] = [];

  if (filter) {
    const parsed = parse(filter);
    where = parsed.where;
    vals  = parsed.values;
  }

  const sql = `SELECT COUNT(*) AS count FROM "${table}" ${where}`;
  const res = await pool.query(sql, vals);
  return parseInt(res.rows[0]?.count ?? '0', 10);
}

// ── dbQuery (SQL brut paramétré) ─────────────────────────────────────────────

export async function dbQuery<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const pool = getPool();
  const res = await pool.query(sql, values);
  return res.rows as T[];
}

// ── getContentSetting / setContentSetting ────────────────────────────────────
// Stocke du contenu JSON dans la table site_settings (key/value).

export async function getContentSetting<T>(key: string): Promise<T | null> {
  const pool = getPool();
  const res = await pool.query(
    'SELECT value FROM site_settings WHERE key = $1',
    [key]
  );
  if (res.rows.length === 0) return null;
  const val = res.rows[0].value;
  try { return JSON.parse(val) as T; } catch { return val as unknown as T; }
}

export async function setContentSetting(key: string, value: unknown): Promise<void> {
  const pool = getPool();
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  await pool.query(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, json]
  );
}

// ── dbRpc (compatibilité) ─────────────────────────────────────────────────────

const ALLOWED_RPC_FNS = new Set<string>(); // Ajouter les fonctions autorisées ici

export async function dbRpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
  // Whitelist de sécurité — rejeter toute fonction non déclarée
  if (!ALLOWED_RPC_FNS.has(fn)) {
    throw new Error(`dbRpc : fonction "${fn}" non autorisée.`);
  }
  const pool = getPool();
  const keys = Object.keys(params || {});
  const vals = Object.values(params || {});
  const args = keys.map((k, i) => `${sanitizeIdentifier(k)} => $${i + 1}`).join(', ');
  const sql  = `SELECT * FROM "${sanitizeIdentifier(fn)}"(${args})`;
  const res  = await pool.query(sql, vals);
  return res.rows as unknown as T;
}
