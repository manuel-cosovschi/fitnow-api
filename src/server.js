// server.js
import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import os from 'os';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Helper: intenta obtener una IP LAN legible para el log
function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const ip = getLocalIp();

const server = app.listen(PORT, HOST, () => {
  console.log(`FitNow API listening on http://${HOST}:${PORT}`);
  console.log(`Local LAN URL (from other devices): http://${ip}:${PORT}`);
});

// Opcional: logs de error de arranque
server.on('error', (err) => {
  console.error('Server error:', err);
});
