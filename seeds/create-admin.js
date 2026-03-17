#!/usr/bin/env node
/**
 * seeds/create-admin.js
 *
 * Upserts the admin user in the database.
 * Usage: node seeds/create-admin.js
 *
 * Env vars (or .env):
 *   DATABASE_URL    — PostgreSQL connection string
 *   ADMIN_EMAIL     — defaults to admin@fitnow.com
 *   ADMIN_PASSWORD  — defaults to Admin1234!
 *   ADMIN_NAME      — defaults to Admin FitNow
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

const EMAIL    = process.env.ADMIN_EMAIL    || 'admin@fitnow.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Admin1234!';
const NAME     = process.env.ADMIN_NAME     || 'Admin FitNow';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const hash = await bcrypt.hash(PASSWORD, 12);

await pool.query(
  `INSERT INTO users (name, email, password_hash, role)
   VALUES ($1, $2, $3, 'admin')
   ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = $4`,
  [NAME, EMAIL, hash, hash]
);

console.log(`Admin upserted: ${EMAIL} / ${PASSWORD}`);
await pool.end();
