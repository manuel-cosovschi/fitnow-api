import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // <- importante para aceptar conexiones de la red local

app.listen(PORT, HOST, () => {
  console.log(`FitNow API running on http://${HOST}:${PORT}`);
});
