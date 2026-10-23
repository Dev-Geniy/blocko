'use strict';
// Хэширование паролей досок: scrypt + соль, сравнение за постоянное время.
const crypto = require('crypto');

const KEYLEN = 32;
const PARAMS = { N: 16384, r: 8, p: 1 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, PARAMS);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [algo, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, PARAMS);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Сравнение со старым паролем в открытом виде (для миграции) за постоянное время
function equalsPlain(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { hashPassword, verifyPassword, equalsPlain };
