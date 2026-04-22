// src/server.js
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

import { validateEnv } from './utils/env.js';
import logger from './utils/logger.js';

// Validate required env vars before loading anything else
validateEnv();

import app from './app.js';
import { pool } from './db.js';
import { runMigrations } from './migrate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

app.set('db', pool);

import express from 'express';
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

async function bootstrap() {
  try {
    await pool.query('SELECT 1 + 1 AS ok');
    logger.info('PostgreSQL pool conectado.');

    await runMigrations();

    const ip = getLocalIp();
    const server = app.listen(PORT, HOST, () => {
      logger.info(`FitNow API escuchando en http://${HOST}:${PORT}`);
      logger.info(`Acceso LAN: http://${ip}:${PORT}`);
      if (PUBLIC_BASE_URL) logger.info(`Público: ${PUBLIC_BASE_URL}`);
    });

    server.on('error', (err) => logger.error('Server error:', err));

    process.on('SIGINT', async () => {
      logger.info('Cerrando servidor...');
      try { await pool.end(); logger.info('Pool PostgreSQL cerrado.'); } catch {}
      process.exit(0);
    });
  } catch (e) {
    logger.error('Error al iniciar servidor:', e);
    process.exit(1);
  }
}

bootstrap();
