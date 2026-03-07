// src/db.js
import mysql from 'mysql2/promise';
import 'dotenv/config';

// Variables de entorno con defaults seguros
// Soporta tanto DB_* (convención propia) como MYSQL* (Railway plugin)
const DB_HOST            = process.env.DB_HOST     ?? process.env.MYSQLHOST     ?? '127.0.0.1';
const DB_PORT            = process.env.DB_PORT     ?? process.env.MYSQLPORT     ?? '3306';
const DB_USER            = process.env.DB_USER     ?? process.env.MYSQLUSER     ?? 'root';
const DB_PASSWORD        = process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? '';
const DB_NAME            = process.env.DB_NAME     ?? process.env.MYSQLDATABASE ?? 'fitnow';
const DB_CONNECTION_LIMIT = process.env.DB_CONNECTION_LIMIT ?? '10';

/**
 * Pool de conexiones global
 * - timezone: UTC (Z) → mantiene consistencia de timestamps
 * - namedPlaceholders: habilita consultas con :param
 * - supportBigNumbers: maneja IDs bigint correctamente
 * - waitForConnections: evita saturar conexiones concurrentes
 * - dateStrings: true → devuelve fechas legibles en JSON
 */
export const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: Number(DB_PORT),
  connectionLimit: Number(DB_CONNECTION_LIMIT),
  waitForConnections: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  namedPlaceholders: true,
  dateStrings: true,
  timezone: 'Z',
});

// Log de conexión inicial (solo en desarrollo)
if (process.env.NODE_ENV !== 'production') {
  console.log(`✅ MySQL pool conectado a ${DB_NAME}@${DB_HOST}:${DB_PORT} (${DB_USER})`);
}

export default pool;

// ─── Query helpers ────────────────────────────────────────────────────────────

/** Ejecuta un SELECT y devuelve todas las filas. */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Ejecuta un SELECT y devuelve la primera fila o null. */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/**
 * Ejecuta una función dentro de una transacción.
 * Si la función lanza, hace rollback y re-lanza el error.
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} fn
 */
export async function transaction(fn) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}


