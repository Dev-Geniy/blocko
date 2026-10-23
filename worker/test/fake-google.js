// Поддельные Google OAuth + Firestore REST для тестов воркера (в памяти).
// Реализует ровно то подмножество API, которым пользуется src/firestore.js.
import { encodeValue, decodeFields } from '../src/firestore.js';

function parseFieldPath(fp) {
  const out = [];
  let i = 0;
  while (i < fp.length) {
    if (fp[i] === '`') {
      let s = '';
      i++;
      while (i < fp.length && fp[i] !== '`') { if (fp[i] === '\\') i++; s += fp[i]; i++; }
      i++;
      out.push(s);
    } else {
      let s = '';
      while (i < fp.length && fp[i] !== '.') s += fp[i++];
      out.push(s);
    }
    if (fp[i] === '.') i++;
  }
  return out;
}

const getAt = (fields, segs) => {
  let cur = { mapValue: { fields } };
  for (const s of segs) {
    if (!cur || !cur.mapValue || !cur.mapValue.fields || !(s in cur.mapValue.fields)) return undefined;
    cur = cur.mapValue.fields[s];
  }
  return cur;
};
const setAt = (fields, segs, value) => {
  let cur = fields;
  for (let i = 0; i < segs.length - 1; i++) {
    if (!cur[segs[i]] || !cur[segs[i]].mapValue) cur[segs[i]] = { mapValue: { fields: {} } };
    cur[segs[i]].mapValue.fields = cur[segs[i]].mapValue.fields || {};
    cur = cur[segs[i]].mapValue.fields;
  }
  cur[segs[segs.length - 1]] = value;
};
const delAt = (fields, segs) => {
  let cur = fields;
  for (let i = 0; i < segs.length - 1; i++) {
    if (!cur[segs[i]] || !cur[segs[i]].mapValue) return;
    cur = cur[segs[i]].mapValue.fields || {};
  }
  delete cur[segs[segs.length - 1]];
};
const num = (v) => (v && 'integerValue' in v ? Number(v.integerValue) : v && 'doubleValue' in v ? v.doubleValue : 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createFakeGoogle({ projectId = 'blocko-pro', abortCommits = 0 } = {}) {
  const docs = new Map(); // path → fields (encoded)
  const root = `projects/${projectId}/databases/(default)/documents`;
  const state = { abortCommits, commits: 0, tokenRequests: 0, lastAssertion: null };

  function applyWrite(w) {
    if (w.delete) { docs.delete(w.delete.slice(root.length + 1)); return; }
    const path = w.update.name.slice(root.length + 1);
    const exists = docs.has(path);
    if (w.currentDocument && w.currentDocument.exists === true && !exists) throw Object.assign(new Error('NOT_FOUND'), { status: 'NOT_FOUND', http: 404 });
    if (w.currentDocument && w.currentDocument.exists === false && exists) throw Object.assign(new Error('ALREADY_EXISTS'), { status: 'ALREADY_EXISTS', http: 409 });
    let fields;
    if (w.updateMask) {
      fields = JSON.parse(JSON.stringify(docs.get(path) || {}));
      for (const fp of w.updateMask.fieldPaths) {
        const segs = parseFieldPath(fp);
        const v = getAt(w.update.fields || {}, segs);
        if (v === undefined) delAt(fields, segs); else setAt(fields, segs, JSON.parse(JSON.stringify(v)));
      }
    } else {
      fields = JSON.parse(JSON.stringify(w.update.fields || {}));
    }
    for (const t of w.updateTransforms || []) {
      const segs = parseFieldPath(t.fieldPath);
      const cur = getAt(fields, segs);
      if (t.increment) {
        const n = num(cur) + num(t.increment);
        setAt(fields, segs, Number.isInteger(n) && !('doubleValue' in t.increment) ? { integerValue: String(n) } : { doubleValue: n });
      } else if (t.appendMissingElements) {
        const arr = cur && cur.arrayValue ? [...(cur.arrayValue.values || [])] : [];
        for (const v of t.appendMissingElements.values) if (!arr.some((x) => same(x, v))) arr.push(v);
        setAt(fields, segs, { arrayValue: { values: arr } });
      } else if (t.removeAllFromArray) {
        const arr = cur && cur.arrayValue ? (cur.arrayValue.values || []) : [];
        setAt(fields, segs, { arrayValue: { values: arr.filter((x) => !t.removeAllFromArray.values.some((v) => same(x, v))) } });
      } else if (t.setToServerValue) {
        setAt(fields, segs, { timestampValue: new Date().toISOString() });
      }
    }
    docs.set(path, fields);
  }

  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fail = (http, status, message) => reply(http, { error: { code: http, status, message } });

  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const method = (init.method || 'GET').toUpperCase();
    if (u.host === 'oauth2.googleapis.com') {
      state.tokenRequests++;
      state.lastAssertion = new URLSearchParams(init.body).get('assertion');
      return reply(200, { access_token: 'fake-access-token', expires_in: 3600 });
    }
    if (u.host !== 'firestore.googleapis.com') throw new Error(`unexpected fetch ${url}`);
    if ((init.headers || {}).Authorization !== 'Bearer fake-access-token') return fail(401, 'UNAUTHENTICATED', 'no token');

    const prefix = `/v1/${root}`;
    const pathname = decodeURIComponent(u.pathname);
    if (!pathname.startsWith(prefix)) return fail(400, 'INVALID_ARGUMENT', 'bad path');
    const rest = pathname.slice(prefix.length);
    const body = init.body ? JSON.parse(init.body) : {};

    if (rest === ':beginTransaction') return reply(200, { transaction: `tx${Math.random().toString(36).slice(2)}` });
    if (rest === ':rollback') return reply(200, {});
    if (rest === ':commit') {
      state.commits++;
      if (body.transaction && state.abortCommits > 0) { state.abortCommits--; return fail(409, 'ABORTED', 'contention'); }
      const snapshot = new Map(docs);
      try { for (const w of body.writes || []) applyWrite(w); } catch (e) {
        docs.clear(); for (const [k, v] of snapshot) docs.set(k, v);
        return fail(e.http || 400, e.status || 'INVALID_ARGUMENT', e.message);
      }
      return reply(200, { writeResults: [] });
    }
    if (rest === ':runQuery') {
      const q = body.structuredQuery;
      const coll = q.from[0].collectionId;
      const f = q.where.fieldFilter;
      const out = [];
      for (const [path, fields] of docs) {
        const segs = path.split('/');
        if (segs.length !== 2 || segs[0] !== coll) continue;
        if (same(getAt(fields, parseFieldPath(f.field.fieldPath)), f.value)) out.push({ document: { name: `${root}/${path}`, fields } });
      }
      return reply(200, out.slice(0, q.limit || 100));
    }
    const path = rest.replace(/^\//, '');
    const segs = path.split('/');
    if (method === 'GET' && segs.length % 2 === 0) {
      if (!docs.has(path)) return fail(404, 'NOT_FOUND', 'missing');
      return reply(200, { name: `${root}/${path}`, fields: docs.get(path) });
    }
    if (method === 'GET') {
      const documents = [];
      for (const [p] of docs) if (p.startsWith(`${path}/`) && p.split('/').length === segs.length + 1) documents.push({ name: `${root}/${p}` });
      return reply(200, { documents });
    }
    return fail(400, 'INVALID_ARGUMENT', `unsupported ${method} ${rest}`);
  }

  return {
    fetch: fetchImpl,
    state,
    put(path, obj) { docs.set(path, encodeValue(obj).mapValue.fields); },
    read(path) { return docs.has(path) ? decodeFields(docs.get(path)) : null; },
    has(path) { return docs.has(path); },
    paths() { return [...docs.keys()].sort(); },
  };
}
