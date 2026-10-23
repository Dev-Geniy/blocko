// Проверка Firebase ID-токена (вход через Google) без Admin SDK: подпись RS256 по публичным ключам Google.
import { ApiError } from './firestore.js';

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { keys: null, exp: 0 };

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const decodeJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getKeys(fetchImpl) {
  if (jwksCache.keys && jwksCache.exp > Date.now()) return jwksCache.keys;
  const res = await fetchImpl(JWKS_URL);
  if (!res.ok) throw new ApiError('unavailable', 'Не удалось проверить вход. Попробуйте ещё раз.');
  const json = await res.json();
  const maxAge = Number(((res.headers.get('cache-control') || '').match(/max-age=(\d+)/) || [])[1] || 3600);
  jwksCache = { keys: json.keys || [], exp: Date.now() + maxAge * 1000 };
  return jwksCache.keys;
}

/** Возвращает { uid, email, name, picture } или бросает unauthenticated */
export async function verifyIdToken(token, projectId, fetchImpl = (...a) => fetch(...a), now = Date.now()) {
  if (!token || token.split('.').length !== 3) throw new ApiError('unauthenticated', 'Войдите в аккаунт.');
  const [h, p, s] = token.split('.');
  let header, payload;
  try { header = decodeJson(h); payload = decodeJson(p); } catch (e) { throw new ApiError('unauthenticated', 'Войдите в аккаунт.'); }
  if (header.alg !== 'RS256') throw new ApiError('unauthenticated', 'Войдите в аккаунт.');

  const nowSec = Math.floor(now / 1000);
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`
    || !payload.sub || payload.exp < nowSec || payload.iat > nowSec + 300) {
    throw new ApiError('unauthenticated', 'Сессия истекла. Обновите страницу.');
  }

  const keys = await getKeys(fetchImpl);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) { jwksCache.exp = 0; throw new ApiError('unauthenticated', 'Сессия истекла. Обновите страницу.'); }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new ApiError('unauthenticated', 'Войдите в аккаунт.');

  return { uid: payload.sub, email: payload.email || null, name: payload.name || null, picture: payload.picture || null };
}
