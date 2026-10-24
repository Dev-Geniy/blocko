import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { handle } from '../src/index.js';
import { createFakeGoogle } from './fake-google.js';
import { verifyIdToken } from '../src/auth.js';
import { hashPassword, verifyPassword } from '../src/passwords.js';
import { buildWrite, FV } from '../src/firestore.js';

const PROJECT = 'blocko-pro';
const sa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SERVICE_ACCOUNT = JSON.stringify({
  type: 'service_account', project_id: PROJECT, private_key_id: 'k1', client_email: 'firebase-adminsdk@blocko-pro.iam.gserviceaccount.com',
  private_key: sa.privateKey.export({ type: 'pkcs8', format: 'pem' }),
});
const idKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...idKey.publicKey.export({ format: 'jwk' }), kid: 'id1', alg: 'RS256', use: 'sig' };

const b64u = (s) => Buffer.from(s).toString('base64url');
function idToken(uid, over = {}, key = idKey.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'id1', typ: 'JWT' }));
  const p = b64u(JSON.stringify({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: uid, iat: now - 10, exp: now + 3600, name: `Name ${uid}`, picture: null, ...over }));
  const sig = createSign('RSA-SHA256').update(`${h}.${p}`).sign(key).toString('base64url');
  return `${h}.${p}.${sig}`;
}

function setup(opts = {}) {
  const g = createFakeGoogle(opts);
  const fetchImpl = async (url, init) => {
    if (String(url).includes('securetoken@system.gserviceaccount.com')) {
      return new Response(JSON.stringify({ keys: [JWK] }), { headers: { 'cache-control': 'public, max-age=600' } });
    }
    return g.fetch(url, init);
  };
  const env = { FIREBASE_SERVICE_ACCOUNT: SERVICE_ACCOUNT, FIREBASE_PROJECT_ID: PROJECT, PAYPAL_CLIENT_ID: 'cid', PAYPAL_SECRET: 'sec', PAYPAL_ENV: 'sandbox', ALLOWED_ORIGINS: 'https://blocko.cloud' };
  async function call(name, data, uid = 'u1', extra = {}) {
    const headers = { 'Content-Type': 'application/json', Origin: 'https://blocko.cloud' };
    if (uid) headers.Authorization = `Bearer ${extra.token || idToken(uid)}`;
    const res = await handle(new Request(`https://api.test/${name}`, { method: 'POST', headers, body: JSON.stringify({ data }) }), extra.env || env, { fetch: fetchImpl, paypal: extra.paypal });
    const body = await res.json();
    return { status: res.status, body, headers: res.headers };
  }
  return { g, call, env, fetchImpl };
}

// ---------- инфраструктура ----------
test('health и CORS', async () => {
  const { env } = setup();
  const ok = await handle(new Request('https://api.test/health', { headers: { Origin: 'https://blocko.cloud' } }), env);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://blocko.cloud');
  const pre = await handle(new Request('https://api.test/purchasePlan', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), null);
  const local = await handle(new Request('https://api.test/purchasePlan', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8080' } }), env);
  assert.equal(local.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8080');
});

test('без входа и с поддельным токеном — unauthenticated', async () => {
  const { call } = setup();
  let r = await call('purchasePlan', { planId: 'pro' }, null);
  assert.equal(r.status, 401);
  assert.equal(r.body.error.status, 'unauthenticated');
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  r = await call('purchasePlan', { planId: 'pro' }, 'u1', { token: idToken('u1', {}, other.privateKey) });
  assert.equal(r.body.error.status, 'unauthenticated');
  r = await call('purchasePlan', { planId: 'pro' }, 'u1', { token: idToken('u1', { aud: 'other-project' }) });
  assert.equal(r.body.error.status, 'unauthenticated');
  r = await call('purchasePlan', { planId: 'pro' }, 'u1', { token: idToken('u1', { exp: Math.floor(Date.now() / 1000) - 5 }) });
  assert.equal(r.body.error.status, 'unauthenticated');
});

test('неизвестная операция — 404', async () => {
  const { call } = setup();
  const r = await call('__proto__', {});
  assert.equal(r.status, 404);
});

test('verifyIdToken возвращает uid', async () => {
  const { fetchImpl } = setup();
  const t = await verifyIdToken(idToken('abc'), PROJECT, fetchImpl);
  assert.equal(t.uid, 'abc');
});

test('сервисный аккаунт: подписанный JWT уходит в Google', async () => {
  const { g, call } = setup();
  g.put('users/u1', { coins: 0 });
  await call('purchasePlan', { planId: 'pro' });
  assert.ok(g.state.lastAssertion && g.state.lastAssertion.split('.').length === 3);
  const claims = JSON.parse(Buffer.from(g.state.lastAssertion.split('.')[1], 'base64url').toString());
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/datastore');
});

test('нет ключа сервера — понятная ошибка', async () => {
  const { call, env } = setup();
  const r = await call('purchasePlan', { planId: 'pro' }, 'u1', { env: { ...env, FIREBASE_SERVICE_ACCOUNT: '' } });
  assert.equal(r.body.error.status, 'internal');
  assert.match(r.body.error.message, /FIREBASE_SERVICE_ACCOUNT/);
});

// ---------- запись ----------
test('buildWrite: merge с вложенным удалением и increment', () => {
  const w = buildWrite('x/doc', { attempts: { u1: FV.delete() }, coins: FV.increment(5), hash: 'h' }, 'merge');
  assert.deepEqual(w.updateMask.fieldPaths.sort(), ['attempts.u1', 'hash']);
  assert.equal(w.updateTransforms[0].fieldPath, 'coins');
  const u = buildWrite('x/doc', { 'users.ab-c': { role: 'editor' } }, 'update');
  assert.deepEqual(u.updateMask.fieldPaths, ['users.`ab-c`']);
  assert.deepEqual(u.currentDocument, { exists: true });
});

test('транзакция повторяется при конфликте (ABORTED)', async () => {
  const { g, call } = setup({ abortCommits: 2 });
  g.put('users/u1', { coins: 2000 });
  const r = await call('purchasePlan', { planId: 'pro' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(g.read('users/u1').coins, 100);
});

// ---------- тарифы и магазин ----------
test('purchasePlan: не хватает монет / успешная покупка', async () => {
  const { g, call } = setup();
  g.put('users/u1', { coins: 500 });
  let r = await call('purchasePlan', { planId: 'freelancer' });
  assert.equal(r.body.error.message, 'not_enough_coins');
  g.put('users/u1', { coins: 700, name: 'A' });
  r = await call('purchasePlan', { planId: 'freelancer' });
  assert.equal(r.body.result.plan, 'freelancer');
  const u = g.read('users/u1');
  assert.equal(u.coins, 100);
  assert.equal(u.name, 'A');
  assert.ok(u.planExpiresAt > Date.now() + 29 * 864e5);
  r = await call('purchasePlan', { planId: 'infinity' });
  assert.equal(r.body.error.status, 'invalid-argument');
});

test('storePurchase: подарок за монеты создаёт промокод', async () => {
  const { g, call } = setup();
  g.put('users/u1', { coins: 2500, name: 'Дарящий' });
  const r = await call('storePurchase', { productId: 'gift_20', currency: 'coins' });
  assert.match(r.body.result.giftCode, /^GIFT-[A-Z2-9]{10}$/);
  const promo = g.read(`promocodes/${r.body.result.giftCode}`);
  assert.equal(promo.rewardCoins, 2000);
  assert.equal(promo.sender.name, 'Дарящий');
  assert.equal(g.read('users/u1').coins, 500);
});

test('storePurchase: за кредиты партнёрки', async () => {
  const { g, call } = setup();
  g.put('users/u1', {});
  g.put('affiliates/u1', { earnedCredits: 700 });
  let r = await call('storePurchase', { productId: 'ai_50', currency: 'credits' });
  assert.equal(r.status, 200);
  assert.equal(g.read('affiliates/u1').earnedCredits, 100);
  assert.equal(g.read('users/u1').bonusAiLimit, 50);
  r = await call('storePurchase', { productId: 'gift_20', currency: 'credits' });
  assert.equal(r.body.error.status, 'invalid-argument');
});

// ---------- промокоды ----------
test('redeemPromo: монеты, повтор, лимит, подарок', async () => {
  const { g, call } = setup();
  g.put('users/u1', { coins: 1 });
  g.put('users/u2', { name: 'Получатель' });
  g.put('promocodes/BONUS', { type: 'coins', rewardCoins: 300, maxUses: 2, uses: 0 });
  g.put('users/u3', {});
  let r = await call('redeemPromo', { code: 'bonus' });
  assert.deepEqual(r.body.result, { type: 'coins', coins: 300 });
  assert.equal(g.read('users/u1').coins, 301);
  r = await call('redeemPromo', { code: 'BONUS' });
  assert.equal(r.body.error.message, 'already_used');
  r = await call('redeemPromo', { code: 'BONUS' }, 'u3');
  assert.equal(r.status, 200);
  r = await call('redeemPromo', { code: 'BONUS' }, 'u2');
  assert.equal(r.body.error.message, 'limit');
  r = await call('redeemPromo', { code: 'NOPE' });
  assert.equal(r.body.error.message, 'not_found');

  g.put('promocodes/GIFT-AAAA', { type: 'coins', rewardCoins: 50, maxUses: 1, uses: 0, isGiftBox: true });
  r = await call('redeemPromo', { code: 'GIFT-AAAA' }, 'u2');
  assert.equal(g.read('promocodes/GIFT-AAAA').claimedBy.name, 'Получатель');

  g.put('promocodes/PRO2', { type: 'plan_pro_2m', maxUses: 0 });
  r = await call('redeemPromo', { code: 'PRO2' }, 'u2');
  assert.equal(r.body.result.plan, 'pro');
  g.put('promocodes/OLD', { type: 'coins', rewardCoins: 1, expiresAt: '2020-01-01' });
  r = await call('redeemPromo', { code: 'OLD' }, 'u2');
  assert.equal(r.body.error.message, 'expired');
});

test('claimDailyGift: один код в день', async () => {
  const { g, call } = setup();
  g.put('users/u1', {});
  const a = await call('claimDailyGift', {});
  const b = await call('claimDailyGift', {});
  assert.equal(a.body.result.code, b.body.result.code);
  assert.equal(b.body.result.alreadyClaimed, true);
  assert.equal(g.read(`promocodes/${a.body.result.code}`).rewardCoins, 50);
});

test('claimDailyQuest: один раз в день', async () => {
  const { g, call } = setup();
  let r = await call('claimDailyQuest', { type: 'telegram' });
  assert.equal(r.body.result.amount, 50);
  r = await call('claimDailyQuest', { type: 'telegram' });
  assert.equal(r.body.error.status, 'already-exists');
  r = await call('claimDailyQuest', { type: 'login' });
  assert.deepEqual(r.body.result.dailyQuests, ['telegram', 'login']);
  assert.equal(g.read('affiliates/u1').earnedCredits, 60);
});

// ---------- партнёрка ----------
test('registerReferral: начисление один раз и только свежим аккаунтам', async () => {
  const { g, call } = setup();
  g.put('users/ref', { name: 'Пригласивший' });
  g.put('affiliates_cpa/ref', { isActive: true, signups: 0 });
  g.put('users/new', { referredBy: 'ref', createdAt: { __ts: Date.now() - 1000 } });
  let r = await call('registerReferral', { sub: 'youtube' }, 'new');
  assert.equal(r.body.result.credited, true);
  r = await call('registerReferral', { sub: 'youtube' }, 'new');
  assert.equal(r.body.result.credited, false);
  assert.deepEqual([g.read('affiliates/ref').signups, g.read('affiliates/ref').earnedCredits], [1, 10]);
  const cpaAfter = g.read('affiliates_cpa/ref');
  assert.equal(cpaAfter.signups, 1);
  assert.equal(cpaAfter.subStats.youtube.signups, 1);
  const days = Object.keys(cpaAfter.daily);
  assert.equal(days.length, 1);
  assert.match(days[0], /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(cpaAfter.daily[days[0]].signups, 1);
  assert.equal(g.read('users/new').referredSub, 'youtube');
  // метка с недопустимыми символами не сохраняется, регистрация идёт в «без метки»
  g.put('users/new2', { referredBy: 'ref', createdAt: { __ts: Date.now() - 1000 } });
  r = await call('registerReferral', { sub: 'bad sub/../x' }, 'new2');
  assert.equal(r.body.result.credited, true);
  assert.equal(g.read('users/new2').referredSub, null);
  assert.equal(g.read('affiliates_cpa/ref').subStats.direct.signups, 1);
  // служебные имена полей (__x__) тоже не принимаем
  g.put('users/new3', { referredBy: 'ref', createdAt: { __ts: Date.now() - 1000 } });
  r = await call('registerReferral', { sub: '__proto__' }, 'new3');
  assert.equal(r.body.result.credited, true);
  assert.equal(g.read('users/new3').referredSub, null);
  assert.equal(g.read('affiliates_cpa/ref').subStats.direct.signups, 2);
  g.put('users/old', { referredBy: 'ref', createdAt: { __ts: Date.now() - 5 * 864e5 } });
  r = await call('registerReferral', {}, 'old');
  assert.equal(r.body.result.reason, 'too_old');
  g.put('users/self', { referredBy: 'self', createdAt: { __ts: Date.now() } });
  r = await call('registerReferral', {}, 'self');
  assert.equal(r.body.result.credited, false);
});

test('listReferrals и claimReferralReward', async () => {
  const { g, call } = setup();
  g.put('users/u1', {});
  g.put('users/a', { referredBy: 'u1', name: 'A', email: 'secret@x' });
  g.put('users/b', { referredBy: 'zzz', name: 'B' });
  let r = await call('listReferrals', {});
  assert.deepEqual(r.body.result.referrals.map((x) => x.name), ['A']);
  assert.equal(r.body.result.referrals[0].email, undefined);
  r = await call('claimReferralReward', { tier: 'friend' });
  assert.equal(r.body.error.status, 'failed-precondition');
  g.put('affiliates/u1', { signups: 10 });
  r = await call('claimReferralReward', { tier: 'friend' });
  assert.equal(r.body.result.plan, 'freelancer');
  assert.deepEqual(g.read('users/u1').rewardsClaimed, ['friend']);
  r = await call('claimReferralReward', { tier: 'friend' });
  assert.equal(r.body.error.status, 'already-exists');
});

test('CPA: вывод и перевод в монеты', async () => {
  const { g, call } = setup();
  g.put('affiliates_cpa/u1', { isActive: true, balanceUSD: 20.5, history: [] });
  let r = await call('cpaWithdraw', {});
  assert.equal(r.body.error.status, 'failed-precondition');
  r = await call('cpaTransferToCoins', {});
  assert.deepEqual(r.body.result, { amount: 20.5, coins: 2050 });
  assert.equal(g.read('users/u1').coins, 2050);
  assert.equal(g.read('affiliates_cpa/u1').balanceUSD, 0);
  assert.equal(g.read('affiliates_cpa/u1').history.length, 1);
  // дробные центы не теряют монету: $10.29 → 1029 монет
  g.put('affiliates_cpa/u1', { isActive: true, balanceUSD: 10.29, history: [] });
  r = await call('cpaTransferToCoins', {});
  assert.deepEqual(r.body.result, { amount: 10.29, coins: 1029 });
});

// ---------- PayPal ----------
function fakePaypal({ amount = '45.00', customId = 'u1' } = {}) {
  const calls = [];
  return {
    calls,
    createOrder: async (o) => { calls.push(['create', o]); return { ok: true, status: 201, json: { id: 'ORDER12345' } }; },
    captureOrder: async (id) => {
      calls.push(['capture', id]);
      return { ok: true, status: 201, json: { status: 'COMPLETED', purchase_units: [{ reference_id: 'popular', payments: { captures: [{ id: 'CAP1', status: 'COMPLETED', custom_id: customId, amount: { value: amount, currency_code: 'USD' } }] } }] } };
    },
    getOrder: async () => ({ ok: true, status: 200, json: {} }),
  };
}

test('PayPal: заказ → оплата → монеты и комиссия партнёру, повтор не начисляет', async () => {
  const { g, call } = setup();
  g.put('users/u1', { referredBy: 'ref', referredSub: 'telegram', coins: 5 });
  g.put('affiliates_cpa/ref', { isActive: true, sales: 10, balanceUSD: 0, history: [] });
  const paypal = fakePaypal();
  let r = await call('createPaypalOrder', { packId: 'popular' }, 'u1', { paypal });
  assert.equal(r.body.result.orderId, 'ORDER12345');
  assert.equal(paypal.calls[0][1].amountUsd, '45.00');
  assert.equal(g.read('payments/ORDER12345').status, 'created');

  r = await call('capturePaypalOrder', { orderId: 'ORDER12345' }, 'u1', { paypal });
  assert.deepEqual(r.body.result, { coins: 5000, alreadyCaptured: false });
  const u = g.read('users/u1');
  assert.equal(u.coins, 5005);
  assert.equal(u.hasPaid, true);
  assert.equal(g.read('affiliates/ref').paidSignups, 1);
  const cpa = g.read('affiliates_cpa/ref');
  assert.equal(cpa.balanceUSD, 18); // 40% от $45
  assert.equal(cpa.sales, 11);
  assert.equal(cpa.history.length, 1);
  assert.equal(cpa.history[0].sub, 'telegram');
  assert.equal(cpa.history[0].amount, 18);
  assert.equal(Object.values(cpa.daily)[0].sales, 1);

  r = await call('capturePaypalOrder', { orderId: 'ORDER12345' }, 'u1', { paypal });
  assert.equal(r.body.result.alreadyCaptured, true);
  assert.equal(g.read('users/u1').coins, 5005);

  r = await call('capturePaypalOrder', { orderId: 'ORDER12345' }, 'u2', { paypal });
  assert.equal(r.body.error.status, 'not-found');
  r = await call('createPaypalOrder', { packId: 'free_money' }, 'u1', { paypal });
  assert.equal(r.body.error.status, 'invalid-argument');
});

test('PayPal: сумма не совпала — монеты не начисляются', async () => {
  const { g, call } = setup();
  g.put('users/u1', { coins: 0 });
  g.put('payments/ORDER99999', { uid: 'u1', packId: 'max', coins: 12000, usd: '100.00', status: 'created' });
  const r = await call('capturePaypalOrder', { orderId: 'ORDER99999' }, 'u1', { paypal: fakePaypal({ amount: '1.00' }) });
  assert.equal(r.body.error.status, 'failed-precondition');
  assert.equal(g.read('users/u1').coins, 0);
  assert.equal(g.read('payments/ORDER99999').status, 'failed');
});

test('PayPal не настроен — понятная ошибка', async () => {
  const { call, env } = setup();
  const r = await call('createPaypalOrder', { packId: 'starter' }, 'u1', { env: { ...env, PAYPAL_SECRET: '' } });
  assert.equal(r.body.error.status, 'failed-precondition');
});

// ---------- доски ----------
test('пароли: pbkdf2 хэш и проверка', async () => {
  const h = await hashPassword('секрет');
  assert.match(h, /^pbkdf2\$100000\$/);
  assert.equal(await verifyPassword('секрет', h), true);
  assert.equal(await verifyPassword('секреТ', h), false);
});

test('enterBoard: пароль, блокировка, разблокировка, вступление и лимит', async () => {
  const { g, call } = setup();
  g.put('users/owner', { plan: 'free' });
  g.put('users/u1', { name: 'Гость' });
  g.put('boards/b1', { owner: 'owner', title: 'Доска', members: ['owner'], users: { owner: { name: 'Хозяин', role: 'owner' } } });

  let r = await call('setBoardPassword', { boardId: 'b1', password: 'qwerty' }, 'u1');
  assert.equal(r.body.error.status, 'permission-denied');
  g.put('boards/b1/unlocks/old', { expiresAt: { __ts: Date.now() + 1000 } });
  r = await call('setBoardPassword', { boardId: 'b1', password: 'qwerty' }, 'owner');
  assert.equal(r.body.result.hasPassword, true);
  assert.equal(g.read('boards/b1').hasPassword, true);
  assert.equal(g.has('boards/b1/unlocks/old'), false);
  assert.match(g.read('board_secrets/b1').hash, /^pbkdf2\$/);

  r = await call('enterBoard', { boardId: 'b1' });
  assert.equal(r.body.result.status, 'password_required');
  assert.equal(r.body.result.preview.owner.name, 'Хозяин');

  for (let i = 0; i < 5; i++) {
    r = await call('enterBoard', { boardId: 'b1', password: 'nope' });
    assert.equal(r.body.error.message, 'wrong_password');
  }
  r = await call('enterBoard', { boardId: 'b1', password: 'qwerty' });
  assert.equal(r.body.error.status, 'resource-exhausted');

  g.put('board_secrets/b1', { ...g.read('board_secrets/b1'), attempts: {} });
  r = await call('enterBoard', { boardId: 'b1', password: 'qwerty', role: 'viewer' });
  assert.equal(r.body.result.status, 'joined');
  const board = g.read('boards/b1');
  assert.deepEqual(board.members, ['owner', 'u1']);
  assert.equal(board.users.u1.role, 'viewer');
  assert.equal(board.users.owner.name, 'Хозяин');
  assert.ok(g.read('boards/b1/unlocks/u1').expiresAt > Date.now() + 11 * 3600e3);

  // лимит бесплатного тарифа — 3 участника
  g.put('boards/b2', { owner: 'owner', members: ['owner', 'x', 'y'], users: {} });
  r = await call('enterBoard', { boardId: 'b2' });
  assert.equal(r.body.error.message, 'member_limit');

  r = await call('setBoardPassword', { boardId: 'b1', password: '' }, 'owner');
  assert.equal(g.has('board_secrets/b1'), false);
  assert.equal(g.read('boards/b1').hasPassword, false);
});

test('enterBoard: старый пароль в открытом виде переносится в хэш', async () => {
  const { g, call } = setup();
  g.put('users/owner', { plan: 'pro' });
  g.put('boards/b9', { owner: 'owner', members: ['owner'], users: {}, password: '1234' });
  const r = await call('enterBoard', { boardId: 'b9', password: '1234' });
  assert.equal(r.body.result.status, 'joined');
  assert.equal('password' in g.read('boards/b9'), false);
  assert.equal(g.read('boards/b9').hasPassword, true);
  assert.equal(await verifyPassword('1234', g.read('board_secrets/b9').hash), true);
  const r2 = await call('enterBoard', { boardId: 'missing' });
  assert.equal(r2.body.error.status, 'not-found');
  const r3 = await call('enterBoard', { boardId: '../x' });
  assert.equal(r3.body.error.status, 'invalid-argument');
});

test('чат: «одно скачивание» удаляет любой участник, временные файлы очищаются после срока', async () => {
  const { g, call } = setup();
  g.put('boards/b1', { owner: 'owner', members: ['owner', 'u1'], users: {} });
  g.put('boards/b1/chat/m1', { text: '', user: { id: 'owner' }, attachment: { type: 'file', url: 'data:a', name: 'a.pdf', retention: 'burn' } });
  g.put('boards/b1/chat/m2', { text: 'привет', user: { id: 'owner' } });

  let r = await call('burnChatFile', { boardId: 'b1', msgId: 'm1' }, 'stranger');
  assert.equal(r.body.error.status, 'permission-denied');
  r = await call('burnChatFile', { boardId: 'b1', msgId: 'm2' }, 'u1');
  assert.equal(r.body.error.status, 'failed-precondition');
  assert.equal(g.has('boards/b1/chat/m2'), true);
  r = await call('burnChatFile', { boardId: 'b1', msgId: 'm1' }, 'u1');
  assert.equal(r.body.result.deleted, true);
  assert.equal(g.has('boards/b1/chat/m1'), false);
  r = await call('burnChatFile', { boardId: 'b1', msgId: 'm1' }, 'u1');
  assert.equal(r.body.result.deleted, false);
  r = await call('burnChatFile', { boardId: 'b1', msgId: '../x' }, 'u1');
  assert.equal(r.body.error.status, 'invalid-argument');

  const past = Date.now() - 1000, future = Date.now() + 864e5;
  g.put('boards/b1/chat/f1', { user: { id: 'owner' }, attachment: { type: 'file', url: 'data:x', name: 'old.txt', size: '1.0 KB', retention: '1day', expiresAt: past } });
  g.put('boards/b1/chat/f2', { user: { id: 'owner' }, attachment: { type: 'file', url: 'data:y', name: 'new.txt', size: '2.0 KB', retention: '7days', expiresAt: future } });
  r = await call('purgeExpiredChatFiles', { boardId: 'b1', msgIds: ['f1', 'f2', 'm2', 'nope'] }, 'stranger');
  assert.equal(r.body.error.status, 'permission-denied');
  r = await call('purgeExpiredChatFiles', { boardId: 'b1', msgIds: ['f1', 'f2', 'm2', 'nope'] }, 'u1');
  assert.equal(r.body.result.purged, 1);
  const f1 = g.read('boards/b1/chat/f1');
  assert.equal(f1.attachment.url, undefined);
  assert.equal(f1.attachment.expired, true);
  assert.equal(f1.attachment.name, 'old.txt');
  assert.equal(f1.user.id, 'owner');
  assert.equal(g.read('boards/b1/chat/f2').attachment.url, 'data:y');
  r = await call('purgeExpiredChatFiles', { boardId: 'b1', msgIds: ['f1'] }, 'u1');
  assert.equal(r.body.result.purged, 0);

  // проект с паролем: без разблокировки участник не может
  g.put('boards/b2', { owner: 'owner', members: ['owner', 'u1'], users: {}, hasPassword: true });
  g.put('boards/b2/chat/x', { attachment: { type: 'file', url: 'u', retention: 'burn' } });
  r = await call('burnChatFile', { boardId: 'b2', msgId: 'x' }, 'u1');
  assert.equal(r.body.error.status, 'permission-denied');
  g.put('boards/b2/unlocks/u1', { expiresAt: { __ts: Date.now() + 3600e3 } });
  r = await call('burnChatFile', { boardId: 'b2', msgId: 'x' }, 'u1');
  assert.equal(r.body.result.deleted, true);
});

test('deleteBoard: владелец удаляет проект вместе со всеми данными', async () => {
  const { g, call } = setup();
  g.put('boards/b1', { owner: 'owner', members: ['owner', 'u1'], users: {} });
  for (let i = 0; i < 5; i++) g.put(`boards/b1/cards/c${i}`, { title: 'Задача ' + i });
  g.put('boards/b1/chat/m1', { text: 'a' });
  g.put('boards/b1/presence/u1', { lastActive: 1 });
  g.put('boards/b1/activity/a1', { text: 'x' });
  g.put('boards/b1/unlocks/u1', { expiresAt: { __ts: Date.now() } });
  g.put('board_secrets/b1', { hash: 'h' });
  g.put('boards/b2', { owner: 'other', members: ['other'] });
  g.put('boards/b2/cards/c1', { title: 'чужое' });

  let r = await call('deleteBoard', { boardId: 'b1' }, 'u1');
  assert.equal(r.body.error.status, 'permission-denied');
  assert.equal(g.has('boards/b1'), true);
  r = await call('deleteBoard', { boardId: 'b1' }, 'owner');
  assert.equal(r.body.result.deleted, true);
  assert.equal(r.body.result.removed, 9);
  for (const p of ['boards/b1', 'boards/b1/cards/c0', 'boards/b1/cards/c4', 'boards/b1/chat/m1', 'boards/b1/presence/u1', 'boards/b1/activity/a1', 'boards/b1/unlocks/u1', 'board_secrets/b1']) {
    assert.equal(g.has(p), false, p);
  }
  assert.equal(g.has('boards/b2/cards/c1'), true);
  r = await call('deleteBoard', { boardId: 'b1' }, 'owner');
  assert.equal(r.body.result.deleted, false);
});
