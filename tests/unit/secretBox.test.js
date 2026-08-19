import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seal, open, hint, resetKeyCache } from '../../src/utils/secretBox.js';

const ORIGINAL = {
  key: process.env.PAYMENTS_ENCRYPTION_KEY,
  jwt: process.env.JWT_SECRET,
};

beforeEach(() => {
  delete process.env.PAYMENTS_ENCRYPTION_KEY;
  process.env.JWT_SECRET = 'un_secreto_de_pruebas_bastante_largo_123456';
  resetKeyCache();
});

afterEach(() => {
  for (const [k, v] of [['PAYMENTS_ENCRYPTION_KEY', ORIGINAL.key], ['JWT_SECRET', ORIGINAL.jwt]]) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetKeyCache();
});

describe('seal / open', () => {
  it('recupera el texto original', () => {
    const token = 'APP_USR-1234567890-abcdef';
    expect(open(seal(token))).toBe(token);
  });

  it('el texto cifrado no contiene el original', () => {
    const token = 'APP_USR-secreto';
    expect(seal(token)).not.toContain('secreto');
  });

  it('dos cifrados del mismo texto son distintos', () => {
    // Si el IV se repitiera, dos proveedores con el mismo token tendrían la
    // misma fila cifrada y eso ya filtra información.
    expect(seal('igual')).not.toBe(seal('igual'));
  });

  it('detecta que alguien alteró el registro', () => {
    const sealed = seal('APP_USR-original');
    const [v, iv, tag, data] = sealed.split('.');
    const alterado = [v, iv, tag, Buffer.from('otra cosa').toString('base64url')].join('.');
    expect(open(alterado)).toBeNull();
  });

  it('no descifra con otra clave', () => {
    const sealed = seal('APP_USR-original');
    process.env.PAYMENTS_ENCRYPTION_KEY = 'a'.repeat(64);
    resetKeyCache();
    expect(open(sealed)).toBeNull();
  });

  it('tolera valores vacíos o con formato desconocido', () => {
    expect(seal(null)).toBeNull();
    expect(open(null)).toBeNull();
    expect(open('')).toBeNull();
    expect(open('texto plano')).toBeNull();
    expect(open('v9.a.b.c')).toBeNull();
  });

  it('acepta la clave explícita en hex, en base64 y como frase', () => {
    for (const key of ['b'.repeat(64), Buffer.alloc(32, 7).toString('base64'), 'una frase larga de prueba']) {
      process.env.PAYMENTS_ENCRYPTION_KEY = key;
      resetKeyCache();
      expect(open(seal('hola'))).toBe('hola');
    }
  });

  it('la clave explícita gana sobre la derivada de JWT_SECRET', () => {
    const conDerivada = seal('token');
    process.env.PAYMENTS_ENCRYPTION_KEY = 'c'.repeat(64);
    resetKeyCache();
    expect(open(conDerivada)).toBeNull();
  });
});

describe('hint', () => {
  it('deja ver solo el final del secreto', () => {
    expect(hint('APP_USR-1234567890')).toBe('****7890');
    expect(hint('abc')).toBe('****');
    expect(hint(null)).toBe('****');
  });
});
