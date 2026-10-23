// =====================================================================
// Blocko API — Cloudflare Worker.
// Принимает запросы сайта (POST /<имяОперации>, тело {data}), проверяет вход
// пользователя (Firebase ID-токен) и выполняет операцию от имени сервера.
// Ответ в формате Firebase callable: {result} или {error:{status,message}}.
// =====================================================================
import { FirestoreRest, ApiError } from './firestore.js';
import { verifyIdToken } from './auth.js';
import { HANDLERS } from './handlers.js';

const DEFAULT_ORIGINS = ['https://blocko.cloud', 'https://www.blocko.cloud'];

function allowedOrigin(origin, env) {
  if (!origin) return null;
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const all = list.length ? list : DEFAULT_ORIGINS;
  if (all.includes('*') || all.includes(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin; // локальная разработка
  return null;
}

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
});

const HTTP_STATUS = {
  'invalid-argument': 400, 'failed-precondition': 400, unauthenticated: 401, 'permission-denied': 403,
  'not-found': 404, 'already-exists': 409, 'resource-exhausted': 429, unavailable: 503, internal: 500,
};
const PUBLIC_CODES = new Set(Object.keys(HTTP_STATUS));

let dbCache = null;
function getDb(env, deps) {
  if (deps.db) return deps.db;
  if (!deps.fetch && dbCache && dbCache.key === env.FIREBASE_SERVICE_ACCOUNT) return dbCache.db;
  let sa;
  try { sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || ''); } catch (e) { sa = null; }
  if (!sa || !sa.private_key || !sa.client_email) {
    const e = new ApiError('internal', 'Сервер не настроен: нет ключа базы данных (FIREBASE_SERVICE_ACCOUNT).');
    e.expose = true;
    throw e;
  }
  const db = new FirestoreRest({ projectId: env.FIREBASE_PROJECT_ID || sa.project_id, serviceAccount: sa, fetchImpl: deps.fetch });
  if (!deps.fetch) dbCache = { key: env.FIREBASE_SERVICE_ACCOUNT, db };
  return db;
}

export async function handle(request, env, deps = {}) {
  const url = new URL(request.url);
  const origin = allowedOrigin(request.headers.get('Origin'), env);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    return json({ ok: true, service: 'blocko-api', operations: Object.keys(HANDLERS) }, 200, origin);
  }
  if (request.method !== 'POST') return json({ error: { status: 'not-found', message: 'Not found' } }, 404, origin);

  const name = url.pathname.replace(/^\/+|\/+$/g, '');
  const handler = Object.prototype.hasOwnProperty.call(HANDLERS, name) ? HANDLERS[name] : null;
  if (!handler) return json({ error: { status: 'not-found', message: 'Неизвестная операция.' } }, 404, origin);

  try {
    let body = {};
    try { body = await request.json(); } catch (e) { body = {}; }
    const data = body && typeof body.data === 'object' && body.data !== null ? body.data : {};
    const projectId = env.FIREBASE_PROJECT_ID || 'blocko-pro';
    const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const verify = deps.verifyIdToken || verifyIdToken;
    const token = await verify(bearer, projectId, deps.fetch);
    const db = getDb(env, deps);
    const result = await handler({ uid: token.uid, token, data, db, env, fetch: deps.fetch, paypal: deps.paypal });
    return json({ result: result === undefined ? null : result }, 200, origin);
  } catch (e) {
    const code = e instanceof ApiError && PUBLIC_CODES.has(e.code) ? e.code : 'internal';
    if (code === 'internal') console.error(`[${name}]`, e && e.stack ? e.stack : e);
    // Внутренние подробности (ответы Google/PayPal) наружу не отдаём
    const message = code === 'internal' && !(e && e.expose) ? 'Внутренняя ошибка сервера. Попробуйте ещё раз.' : e.message;
    return json({ error: { status: code, message } }, HTTP_STATUS[code] || 500, origin);
  }
}

export default { fetch: (request, env) => handle(request, env) };
