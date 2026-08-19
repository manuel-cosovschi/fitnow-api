// src/utils/secretBox.js
//
// Cifrado simétrico para los secretos de terceros que guardamos en la base:
// hoy, los tokens OAuth con los que un proveedor nos autoriza a cobrar en su
// nombre. Un token de esos permite mover plata ajena, así que no puede quedar
// en texto plano en una tabla.
//
// AES-256-GCM: además de cifrar, autentica. Si alguien altera el registro en la
// base, el descifrado falla en vez de devolver basura.
//
// La clave sale de PAYMENTS_ENCRYPTION_KEY si está configurada; si no, se
// deriva de JWT_SECRET con HKDF. Derivar es seguro —son claves distintas para
// propósitos distintos— y evita un paso de configuración más. Ojo con lo obvio:
// si rotás JWT_SECRET sin haber configurado PAYMENTS_ENCRYPTION_KEY, los tokens
// guardados dejan de poder descifrarse y los proveedores tienen que volver a
// conectar su cuenta.

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES  = 12;   // el tamaño recomendado para GCM
const TAG_BYTES = 16;
const HKDF_INFO = 'fitnow:payments:v1';

let cachedKey;

function encryptionKey() {
  if (cachedKey) return cachedKey;

  const explicit = (process.env.PAYMENTS_ENCRYPTION_KEY || '').trim();
  if (explicit) {
    // Se acepta hex de 64 caracteres, base64 de 32 bytes, o una frase larga.
    let material;
    if (/^[0-9a-f]{64}$/i.test(explicit)) {
      material = Buffer.from(explicit, 'hex');
    } else {
      const decoded = Buffer.from(explicit, 'base64');
      material = decoded.length === 32 ? decoded : crypto.createHash('sha256').update(explicit).digest();
    }
    cachedKey = material;
    return cachedKey;
  }

  const master = process.env.JWT_SECRET;
  if (!master) {
    throw new Error('[secretBox] Hace falta PAYMENTS_ENCRYPTION_KEY o JWT_SECRET para cifrar.');
  }
  cachedKey = Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), HKDF_INFO, 32));
  return cachedKey;
}

/** Solo para tests: olvida la clave derivada. */
export function resetKeyCache() {
  cachedKey = undefined;
}

/**
 * Cifra un texto. El resultado es una sola cadena `v1.<iv>.<tag>.<datos>` en
 * base64url, para guardarla en una columna de texto sin más ceremonia.
 */
export function seal(plaintext) {
  if (plaintext == null) return null;
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const data   = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();

  return ['v1', iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
}

/**
 * Descifra lo que produjo `seal`. Devuelve null si el valor está vacío, fue
 * alterado o se cifró con otra clave: quien llama trata eso como "no hay token"
 * y le pide al proveedor que reconecte, que es lo único que se puede hacer.
 */
export function open(sealed) {
  if (!sealed) return null;

  const parts = String(sealed).split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;

  try {
    const iv   = Buffer.from(parts[1], 'base64url');
    const tag  = Buffer.from(parts[2], 'base64url');
    const data = Buffer.from(parts[3], 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (_) {
    return null;
  }
}

/** Últimos caracteres de un secreto, para poder identificarlo en un log sin exponerlo. */
export function hint(plaintext) {
  const s = String(plaintext ?? '');
  return s.length <= 4 ? '****' : `****${s.slice(-4)}`;
}
