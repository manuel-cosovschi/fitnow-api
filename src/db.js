// src/db.js
import mysql from 'mysql2/promise';
import 'dotenv/config';

// Variables de entorno con defaults seguros
const {
  DB_HOST = '127.0.0.1',
  DB_USER = 'root',
  DB_PASSWORD = 'Cedetalvo1',
  DB_NAME = 'fitnow',
  DB_PORT = '3306',
  DB_CONNECTION_LIMIT = '10',
} = process.env;

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


