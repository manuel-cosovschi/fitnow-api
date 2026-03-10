// src/db.js — PostgreSQL (Supabase) via pg
import pg from 'pg';
import 'dotenv/config';

// Parse bigint (OID 20) as JS number so COUNT(*) returns a number, not a string
pg.types.setTypeParser(20, (val) => parseInt(val, 10));

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Auto-enable SSL for Supabase; skip for local pg
  ssl: process.env.DATABASE_URL?.includes('supabase.co')
    ? { rejectUnauthorized: false }
    : undefined,
});

if (process.env.NODE_ENV !== 'production') {
  import('./utils/logger.js').then(({ default: logger }) => {
    logger.info('PostgreSQL pool conectado (Supabase/pg)');
  });
}

export default pool;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte ? en $1, $2, … para PostgreSQL */
function pgify(sql, params = []) {
  let i = 0;
  return { sql: sql.replace(/\?/g, () => `$${++i}`), params };
}

/** Agrega RETURNING * a un INSERT si no lo tiene */
function withReturning(sql) {
  if (sql.trim().toUpperCase().startsWith('INSERT') && !sql.toUpperCase().includes('RETURNING')) {
    return sql.trimEnd() + ' RETURNING *';
  }
  return sql;
}

/**
 * Ejecuta una query y devuelve las filas.
 * Para INSERT, devuelve un array con propiedad .insertId (compat mysql2).
 */
export async function query(sql, params = []) {
  const { sql: pgSql, params: pgParams } = pgify(sql, params);
  const finalSql = withReturning(pgSql);
  const result = await pool.query(finalSql, pgParams);
  const rows = result.rows;
  if (sql.trim().toUpperCase().startsWith('INSERT') && rows.length > 0) {
    rows.insertId = rows[0].id;
  }
  return rows;
}

/** Devuelve la primera fila o null */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/**
 * Ejecuta fn dentro de una transacción.
 * Expone conn con la misma API que mysql2 PoolConnection (compat).
 */
export async function transaction(fn) {
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    const conn = {
      query: async (sql, params = []) => {
        const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
        const { sql: pgSql, params: pgParams } = pgify(sql, params);
        const finalSql = isInsert ? withReturning(pgSql) : pgSql;
        const result = await client.query(finalSql, pgParams);
        const rows = result.rows;
        if (isInsert && rows.length > 0) {
          // mysql2 compat: conn.query retorna [result, fields]
          // para INSERT: result.insertId contiene el ID insertado
          const mockResult = { insertId: rows[0].id, ...rows[0] };
          return [mockResult, []];
        }
        // SELECT/UPDATE/DELETE: retorna [rows, fields]
        return [rows, []];
      },
    };
    const result = await fn(conn);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
