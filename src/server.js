// src/server.js
import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

import app from './app.js';
import { pool } from './db.js';

// __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Inyectar pool al app (para req.app.get('db'))
app.set('db', pool);

// Estáticos: /uploads
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
    // Probar DB
    await pool.query('SELECT 1 + 1 AS ok');
    console.log('✅ MySQL pool conectado.');

    const ip = getLocalIp();
    const server = app.listen(PORT, HOST, () => {
      console.log(`🚀 FitNow API escuchando en http://${HOST}:${PORT}`);
      console.log(`🔌 Acceso LAN: http://${ip}:${PORT}`);
      if (PUBLIC_BASE_URL) console.log(`🌍 Público (ngrok/dom): ${PUBLIC_BASE_URL}`);
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
    });

    // Cierre limpio
    process.on('SIGINT', async () => {
      console.log('\n🛑 Cerrando servidor...');
      try { await pool.end(); console.log('🔌 Pool MySQL cerrado.'); } catch {}
      process.exit(0);
    });
  } catch (e) {
    console.error('❌ Error al iniciar servidor:', e);
    process.exit(1);
  }
}

bootstrap();
