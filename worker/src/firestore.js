// =====================================================================
// Firestore через REST API — для Cloudflare Workers (без Firebase Admin SDK).
// Права администратора: OAuth-токен сервисного аккаунта Firebase.
// Работает на бесплатном тарифе Firebase (Spark) — Cloud Functions не нужны.
// =====================================================================

// ---------- «Особые значения» (аналог FieldValue в Admin SDK) ----------
export const FV = {
  increment: (n) => ({ __fv: 'increment', n }),
  arrayUnion: (...values) => ({ __fv: 'arrayUnion', values }),
  arrayRemove: (...values) => ({ __fv: 'arrayRemove', values }),
  serverTimestamp: () => ({ __fv: 'serverTimestamp' }),
  delete: () => ({ __fv: 'delete' }),
};
export const timestamp = (ms) => ({ __ts: Number(ms) });

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v.__fv) && !('__ts' in v);

// ---------- Кодирование значений ----------
export function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) && Math.abs(v) < 2 ** 53 ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'object' && '__ts' in v) return { timestampValue: new Date(v.__ts).toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) {
      if (val && val.__fv) throw new Error(`FieldValue внутри вложенного объекта не поддерживается: ${k}`);
      fields[k] = encodeValue(val);
    }
    return { mapValue: { fields } };
  }
  throw new Error(`Неподдерживаемый тип: ${typeof v}`);
}

export function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('bytesValue' in v) return v.bytesValue;
  return null;
}

export function decodeFields(fields) {
  const out = {};
  for (const [k, val] of Object.entries(fields || {})) out[k] = decodeValue(val);
  return out;
}

// Сегмент пути поля: простые имена как есть, остальные — в обратных кавычках
export function fieldSegment(s) {
  return /^[A-Za-z_][A-Za-z_0-9]*$/.test(s) ? s : '`' + String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`';
}
export const fieldPath = (...segments) => segments.map(fieldSegment).join('.');

// Разбор «users.abc.role» (как в Admin SDK update) → сегменты
function splitDotted(path) { return String(path).split('.'); }

/**
 * Превращает объект операции в write для REST commit.
 * mode: 'set' | 'merge' | 'update' | 'create'
 */
export function buildWrite(name, data, mode) {
  const fields = {};
  const mask = [];
  const transforms = [];

  const setNested = (segments, value) => {
    let cur = fields;
    for (let i = 0; i < segments.length - 1; i++) {
      const s = segments[i];
      if (!cur[s] || !cur[s].mapValue) cur[s] = { mapValue: { fields: {} } };
      cur = cur[s].mapValue.fields;
    }
    cur[segments[segments.length - 1]] = encodeValue(value);
  };

  const handle = (segments, value, collectMask) => {
    const fp = fieldPath(...segments);
    if (value && value.__fv) {
      if (value.__fv === 'delete') { mask.push(fp); return; }
      if (value.__fv === 'increment') transforms.push({ fieldPath: fp, increment: encodeValue(value.n) });
      else if (value.__fv === 'arrayUnion') transforms.push({ fieldPath: fp, appendMissingElements: { values: value.values.map(encodeValue) } });
      else if (value.__fv === 'arrayRemove') transforms.push({ fieldPath: fp, removeAllFromArray: { values: value.values.map(encodeValue) } });
      else if (value.__fv === 'serverTimestamp') transforms.push({ fieldPath: fp, setToServerValue: 'REQUEST_TIME' });
      return;
    }
    // merge: «глубокое» слияние обычных объектов — маска до листьев
    if (mode === 'merge' && isPlainObject(value) && Object.keys(value).length) {
      for (const [k, v] of Object.entries(value)) handle([...segments, k], v, collectMask);
      return;
    }
    setNested(segments, value);
    if (collectMask) mask.push(fp);
  };

  for (const [key, value] of Object.entries(data || {})) {
    const segments = mode === 'update' ? splitDotted(key) : [key];
    handle(segments, value, mode === 'merge' || mode === 'update');
  }

  const write = { update: { name, fields } };
  if (mode === 'merge' || mode === 'update') write.updateMask = { fieldPaths: mask };
  if (transforms.length) write.updateTransforms = transforms;
  if (mode === 'update') write.currentDocument = { exists: true };
  if (mode === 'create') write.currentDocument = { exists: false };
  return write;
}

// ---------- Ошибки в стиле Firebase HttpsError ----------
export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---------- Токен сервисного аккаунта ----------
const b64url = (buf) => {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlJson = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

function pemToPkcs8(pem) {
  const body = String(pem).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s|\\n/g, '');
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

let cachedToken = null;
async function getAccessToken(sa, fetchImpl) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now && cachedToken.email === sa.client_email) return cachedToken.token;
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const header = b64urlJson({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id });
  const claims = b64urlJson({
    iss: sa.client_email, sub: sa.client_email, aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore', iat: now, exp: now + 3600,
  });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claims}.${b64url(sig)}`,
  });
  if (!res.ok) {
    const e = new ApiError('internal', 'Не удалось получить доступ к базе (проверьте ключ сервисного аккаунта).');
    e.expose = true;
    throw e;
  }
  const json = await res.json();
  cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600), email: sa.client_email };
  return cachedToken.token;
}

// ---------- Клиент Firestore ----------
export class FirestoreRest {
  constructor({ projectId, serviceAccount, fetchImpl }) {
    this.projectId = projectId;
    this.sa = serviceAccount;
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.root = `projects/${projectId}/databases/(default)/documents`;
    this.base = `https://firestore.googleapis.com/v1/${this.root}`;
  }

  docName(path) { return `${this.root}/${path}`; }

  async req(method, url, body) {
    const token = await getAccessToken(this.sa, this.fetch);
    const res = await this.fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404 && method === 'GET') return null;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const status = (json.error && json.error.status) || String(res.status);
      const err = new ApiError(status === 'ABORTED' ? 'aborted' : status === 'FAILED_PRECONDITION' ? 'precondition' : 'internal', (json.error && json.error.message) || `Firestore ${res.status}`);
      err.status = status;
      throw err;
    }
    return json;
  }

  async get(path, transaction) {
    const q = transaction ? `?transaction=${encodeURIComponent(transaction)}` : '';
    const doc = await this.req('GET', `${this.base}/${path}${q}`);
    return doc && doc.fields !== undefined ? decodeFields(doc.fields) : (doc ? {} : null);
  }

  /** Документы подколлекции (для удаления отметок о пароле) */
  async listIds(collectionPath, pageSize = 300) {
    const json = await this.req('GET', `${this.base}/${collectionPath}?pageSize=${pageSize}&mask.fieldPaths=__name__`);
    return ((json && json.documents) || []).map((d) => d.name.split('/').pop());
  }

  /** Простой запрос: where(field == value), limit */
  async queryEq(collectionId, field, value, limit = 100) {
    const json = await this.req('POST', `${this.base}:runQuery`, {
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encodeValue(value) } },
        limit,
      },
    });
    return (json || []).filter((r) => r.document).map((r) => ({ id: r.document.name.split('/').pop(), data: decodeFields(r.document.fields) }));
  }

  async commit(writes, transaction) {
    const body = { writes };
    if (transaction) body.transaction = transaction;
    return this.req('POST', `${this.base}:commit`, body);
  }

  /** Транзакция: чтения внутри fn, записи копятся и уходят одним commit. Повтор при конфликте. */
  async runTransaction(fn, attempts = 5) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      const { transaction } = await this.req('POST', `${this.base}:beginTransaction`, { options: { readWrite: {} } });
      const writes = [];
      const tx = {
        get: (path) => this.get(path, transaction),
        set: (path, data, opts) => writes.push(buildWrite(this.docName(path), data, opts && opts.merge ? 'merge' : 'set')),
        update: (path, data) => writes.push(buildWrite(this.docName(path), data, 'update')),
        create: (path, data) => writes.push(buildWrite(this.docName(path), data, 'create')),
        delete: (path) => writes.push({ delete: this.docName(path) }),
      };
      try {
        const result = await fn(tx);
        await this.commit(writes, transaction);
        return result;
      } catch (e) {
        lastErr = e;
        if (e.code !== 'aborted') {
          await this.req('POST', `${this.base}:rollback`, { transaction }).catch(() => {});
          throw e;
        }
      }
    }
    throw lastErr;
  }

  // Одиночные записи вне транзакции
  set(path, data, opts) { return this.commit([buildWrite(this.docName(path), data, opts && opts.merge ? 'merge' : 'set')]); }
  update(path, data) { return this.commit([buildWrite(this.docName(path), data, 'update')]); }
  delete(path) { return this.commit([{ delete: this.docName(path) }]); }
}
