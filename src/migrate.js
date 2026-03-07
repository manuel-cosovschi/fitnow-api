// src/migrate.js
// Ejecuta los archivos SQL en orden al arrancar el servidor.

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR   = path.join(__dirname, '..', 'sql');

// Orden de ejecución: schema primero (tablas base), luego migrations (providers + ALTERs), luego seed
const FILES = ['schema.sql', 'migrations.sql', 'seed.sql'];

// Errores ignorables en ALTER TABLE: columna ya existe, índice ya existe
const IGNORABLE_CODES = new Set(['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_DUP_ENTRY']);
const IGNORABLE_ERRNO = new Set([1060, 1061, 1062]);

function isIgnorable(err) {
  return IGNORABLE_CODES.has(err.code) || IGNORABLE_ERRNO.has(err.errno);
}

// Divide un archivo SQL en statements individuales.
// Elimina comentarios -- primero para que no interfieran con el filtrado.
function splitStatements(sql) {
  const noComments = sql.replace(/--[^\n]*/g, '');
  return noComments
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export async function runMigrations() {
  const conn = await mysql.createConnection({
    host:               process.env.DB_HOST     ?? process.env.MYSQLHOST     ?? '127.0.0.1',
    port:               Number(process.env.DB_PORT ?? process.env.MYSQLPORT ?? 3306),
    user:               process.env.DB_USER     ?? process.env.MYSQLUSER     ?? 'root',
    password:           process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? '',
    database:           process.env.DB_NAME     ?? process.env.MYSQLDATABASE ?? 'fitnow',
    multipleStatements: true,
  });

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0;');

    for (const file of FILES) {
      const filePath = path.join(SQL_DIR, file);
      if (!fs.existsSync(filePath)) {
        console.warn(`[migrate] Archivo no encontrado, saltando: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(filePath, 'utf8');

      if (file === 'migrations.sql') {
        // Ejecutar statement por statement para poder ignorar duplicados
        const stmts = splitStatements(sql);
        for (const stmt of stmts) {
          try {
            await conn.query(stmt);
          } catch (err) {
            if (isIgnorable(err)) continue;
            throw err;
          }
        }
      } else {
        await conn.query(sql);
      }

      console.log(`[migrate] ✓ ${file}`);
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('[migrate] Migraciones completadas.');
  } finally {
    await conn.end();
  }
}
