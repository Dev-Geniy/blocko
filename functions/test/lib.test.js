'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../lib/catalog');
const { hashPassword, verifyPassword, equalsPlain } = require('../lib/passwords');
const { completedCapture } = require('../lib/paypal');

test('пароли: хэш проверяется, неверный отклоняется', () => {
  const h = hashPassword('секрет-123');
  assert.ok(h.startsWith('scrypt$'));
  assert.notStrictEqual(h, hashPassword('секрет-123'), 'соль делает хэши разными');
  assert.ok(verifyPassword('секрет-123', h));
  assert.ok(!verifyPassword('секрет-124', h));
  assert.ok(!verifyPassword('x', 'garbage'));
  assert.ok(equalsPlain('abc', 'abc'));
  assert.ok(!equalsPlain('abc', 'abcd'));
});

test('тариф: истёкший считается free, продление суммирует срок', () => {
  const now = 1_000_000_000_000;
  assert.strictEqual(C.effectivePlan({ plan: 'pro', planExpiresAt: now - 1 }, now), 'free');
  assert.strictEqual(C.effectivePlan({ plan: 'pro' }, now), 'pro');
  const ext = C.extendPlan({ plan: 'pro', planExpiresAt: now + C.DAY_MS }, 'pro', C.MONTH_MS, now);
  assert.strictEqual(ext.planExpiresAt, now + C.DAY_MS + C.MONTH_MS);
  const sw = C.extendPlan({ plan: 'freelancer', planExpiresAt: now + C.DAY_MS }, 'pro', C.MONTH_MS, now);
  assert.strictEqual(sw.planExpiresAt, now + C.MONTH_MS);
  assert.deepStrictEqual(C.extendPlan({ plan: 'infinity' }, 'pro', C.MONTH_MS, now), { plan: 'infinity', planExpiresAt: null });
  assert.deepStrictEqual(C.extendPlan({}, 'pro', null, now), { plan: 'pro', planExpiresAt: null });
});

test('каталог: магазин выдаёт тариф pro за Company и цены положительные', () => {
  assert.strictEqual(C.STORE_PRODUCTS.plan_company.grant.plan, 'pro');
  for (const [id, p] of Object.entries(C.STORE_PRODUCTS)) assert.ok(p.priceCoins > 0, id);
  assert.match(C.dayKey(Date.UTC(2026, 9, 22, 12)), /^\d{2}\.\d{2}\.\d{4}$/);
});

test('CPA: ставка растёт с рангом партнёра', () => {
  assert.strictEqual(C.cpaRate(0), 0.3);
  assert.strictEqual(C.cpaRate(10), 0.4);
  assert.strictEqual(C.cpaRate(50), 0.5);
});

test('PayPal: принимается только завершённый захват', () => {
  const order = { status: 'COMPLETED', purchase_units: [{ reference_id: 'starter', custom_id: 'u1', payments: { captures: [{ id: 'C1', status: 'COMPLETED', amount: { value: '10.00', currency_code: 'USD' } }] } }] };
  assert.deepStrictEqual(completedCapture(order), { captureId: 'C1', amount: '10.00', currency: 'USD', customId: 'u1', referenceId: 'starter' });
  assert.strictEqual(completedCapture({ ...order, status: 'APPROVED' }), null);
});

test('passwords: принимает pbkdf2-хэши от сервера на Cloudflare', () => {
  const { verifyPassword } = require('../lib/passwords');
  const fromWorker = 'pbkdf2$100000$1aEX5qHz2LLQMoN2sMHaEw==$a97UwEzw5csGkI54qiXNQkPj79WaGyXHcp6yQC0GcQA=';
  assert.equal(verifyPassword('blocko-test', fromWorker), true);
  assert.equal(verifyPassword('blocko-Test', fromWorker), false);
});
