#!/usr/bin/env node
/**
 * seeds/create-admin.js
 *
 * Crea el usuario admin en la base de datos.
 * Uso: node seeds/create-admin.js
 *
 * Variables de entorno requeridas (o en .env):
 *   DATABASE_URL  — connection string de PostgreSQL
 */

import 'dotenv/config';
import pg      from 'pg';
import bcrypt  from 'bcryptjs';

const { Pool } = pg;

const ADMIN = {
  name:     'Admin FitNow',
  email:    'admin@fitnow.com',
  password: 'Admin1234!',
  role:     'admin',
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase.co')
    ? { rejectUnauthorized: false }
    : undefined,
});

async function run() {
  const client = await pool.connect();
  try {
    // Check if user already exists
    const existing = await client.query(
      `SELECT id, email FROM users WHERE email = $1 LIMIT 1`,
      [ADMIN.email]
    );

    if (existing.rows.length > 0) {
      console.log(`✓ Usuario admin ya existe (id=${existing.rows[0].id}). Actualizando rol…`);
      await client.query(
        `UPDATE users SET role = $1, updated_at = NOW() WHERE email = $2`,
        [ADMIN.role, ADMIN.email]
      );
      console.log(`✓ Rol actualizado a '${ADMIN.role}'.`);
      return;
    }

    const hash = await bcrypt.hash(ADMIN.password, 12);
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [ADMIN.name, ADMIN.email, hash, ADMIN.role]
    );

    const user = result.rows[0];
    console.log(`✓ Usuario admin creado exitosamente:`);
    console.log(`  id:    ${user.id}`);
    console.log(`  name:  ${user.name}`);
    console.log(`  email: ${user.email}`);
    console.log(`  role:  ${user.role}`);
    console.log(`\n  Password: ${ADMIN.password}  (guardada como hash bcrypt)`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
