// src/migrate.js
// Ejecuta los archivos SQL en orden al arrancar el servidor.
// Todos los archivos usan IF NOT EXISTS / INSERT IGNORE → son idempotentes.

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR   = path.join(__dirname, '..', 'sql');

// Orden de ejecución: schema primero (tablas base), luego migrations (providers + ALTERs), luego seed
const FILES = ['schema.sql', 'migrations.sql', 'seed.sql'];

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
    // Desactivar FK checks para que el orden de tablas no importe
    await conn.query('SET FOREIGN_KEY_CHECKS = 0;');

    for (const file of FILES) {
      const filePath = path.join(SQL_DIR, file);
      if (!fs.existsSync(filePath)) {
        console.warn(`[migrate] Archivo no encontrado, saltando: ${file}`);
        continue;
      }
      const sql = fs.readFileSync(filePath, 'utf8');
      await conn.query(sql);
      console.log(`[migrate] ✓ ${file}`);
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('[migrate] Migraciones completadas.');
  } finally {
    await conn.end();
  }
}
