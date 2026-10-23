// Пароли досок на WebCrypto (PBKDF2-SHA256). Формат: pbkdf2$<итерации>$<соль base64>$<хэш base64>.
// Cloudflare Workers ограничивает PBKDF2 100 000 итерациями — это и используем.
const ITERATIONS = 100000;
const KEYLEN_BITS = 256;
const enc = new TextEncoder();

const toB64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (b64) => { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

async function derive(password, salt, iterations, bits) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, bits));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS, KEYLEN_BITS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

/** Проверка. Хэши scrypt (от Cloud Functions) здесь не проверить — функция их никогда не создавала в проде. */
export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [algo, iterStr, saltB64, hashB64] = stored.split('$');
  if (algo !== 'pbkdf2' || !saltB64 || !hashB64) return false;
  const iterations = Number(iterStr);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
  const expected = fromB64(hashB64);
  const actual = await derive(password, fromB64(saltB64), iterations, expected.length * 8);
  return timingSafeEqual(expected, actual);
}

export function equalsPlain(a, b) {
  return timingSafeEqual(enc.encode(String(a)), enc.encode(String(b)));
}
