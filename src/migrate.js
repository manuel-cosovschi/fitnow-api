// src/migrate.js
// Ejecuta los archivos SQL en orden al arrancar el servidor.

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { assertDbHostReachable } from './utils/dbConnection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR   = path.join(__dirname, '..', 'sql');

// schema.sql = esquema completo, seed.sql = datos iniciales
const FILES = ['schema.sql', 'seed.sql'];

// Códigos de error PostgreSQL ignorables (idempotencia):
//   42P07 = duplicate_table, 42701 = duplicate_column,
//   42710 = duplicate_object, 23505 = unique_violation (seeds)
//   42704 = undefined_object (DROP INDEX que no existe)
const IGNORABLE_PG_CODES = new Set(['42P07', '42701', '42710', '23505', '42704', '42P16']);

function isIgnorable(err) {
  return IGNORABLE_PG_CODES.has(err.code);
}

function splitStatements(sql) {
  const noComments = sql.replace(/--[^\n]*/g, '');
  return noComments
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export async function runMigrations() {
  await assertDbHostReachable(process.env.DATABASE_URL);

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase.co')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await client.connect();

  try {
    for (const file of FILES) {
      const filePath = path.join(SQL_DIR, file);
      if (!fs.existsSync(filePath)) {
        console.warn(`[migrate] Archivo no encontrado, saltando: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(filePath, 'utf8');
      const stmts = splitStatements(sql);

      for (const stmt of stmts) {
        try {
          await client.query(stmt);
        } catch (err) {
          if (isIgnorable(err)) continue;
          throw err;
        }
      }

      console.log(`[migrate] ✓ ${file}`);
    }

    console.log('[migrate] Migraciones completadas.');
  } finally {
    await client.end();
  }
}
