// src/utils/dbConnection.js
// Helpers to diagnose DB connectivity problems early, before pg hides them
// behind a generic ENETUNREACH / ECONNREFUSED.
//
// Background: Railway (and other PaaS) don't provide outbound IPv6. Supabase
// direct-connection hosts (db.<project-ref>.supabase.co) are IPv6-only since
// 2024, so any client on Railway / Render / Fly free tier will fail to reach
// them. The Supavisor pooler (aws-0-<region>.pooler.supabase.com) provides an
// IPv4 endpoint and is the correct choice on those platforms.

import dns from 'dns';
import { URL } from 'url';

// Prefer IPv4 for dual-stack hosts. This alone does NOT fix IPv6-only hosts.
dns.setDefaultResultOrder('ipv4first');

function parseHost(connectionString) {
  if (!connectionString) return null;
  try {
    return new URL(connectionString).hostname || null;
  } catch {
    return null;
  }
}

function isLocalHost(hostname) {
  if (!hostname) return true;
  if (hostname === 'localhost') return true;
  if (hostname.startsWith('127.')) return true;
  if (hostname.startsWith('/')) return true; // unix socket path
  return false;
}

/**
 * Asserts that DATABASE_URL's hostname resolves to at least one IPv4 address.
 * Throws an actionable error otherwise. Silently returns for localhost / unix
 * sockets / malformed URLs (pg will surface its own error for the last case).
 */
export async function assertDbHostReachable(connectionString) {
  const hostname = parseHost(connectionString);
  if (isLocalHost(hostname)) return;

  try {
    await dns.promises.lookup(hostname, { family: 4 });
    return;
  } catch (err) {
    if (err.code !== 'ENOTFOUND' && err.code !== 'EAI_AGAIN') throw err;
  }

  let hasIPv6 = false;
  try {
    const records = await dns.promises.resolve6(hostname);
    hasIPv6 = Array.isArray(records) && records.length > 0;
  } catch { /* no AAAA either */ }

  const lines = [`[DB] No se pudo resolver IPv4 para "${hostname}".`];

  if (hasIPv6) {
    lines.push(
      '[DB] El host resuelve SOLO a IPv6, y Railway / Render / Fly (free) no tienen egress IPv6.',
    );
    if (/^db\..+\.supabase\.co$/.test(hostname)) {
      lines.push(
        '[DB] Estás usando la conexión DIRECTA de Supabase, que es IPv6-only desde 2024.',
        '[DB] SOLUCIÓN: cambiá DATABASE_URL por la URL del Supavisor pooler (IPv4).',
        '[DB]   Supabase → Project Settings → Database → Connection string → "Transaction pooler".',
        '[DB]   Formato:',
        '[DB]     postgresql://postgres.<PROJECT-REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres',
      );
    } else {
      lines.push('[DB] Usá un host/URL que soporte IPv4 (por ejemplo un connection pooler).');
    }
  } else {
    lines.push('[DB] El host no tiene registros DNS (ni A ni AAAA). Verificá el hostname en DATABASE_URL.');
  }

  throw new Error(lines.join('\n'));
}
