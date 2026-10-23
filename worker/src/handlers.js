// =====================================================================
// Серверные операции Blocko Pro (деньги, тарифы, промокоды, пароли досок).
// Это та же логика, что в functions/index.js, но для Cloudflare Workers:
// работает без тарифа Blaze. Каталог цен общий — functions/lib/catalog.js.
// =====================================================================
import * as C from '../../functions/lib/catalog.js';
import { ApiError, FV, timestamp } from './firestore.js';
import { hashPassword, verifyPassword, equalsPlain } from './passwords.js';
import { makePaypal, completedCapture } from './paypal.js';

const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_PASSWORD_ATTEMPTS = 5;
const PASSWORD_LOCK_MS = 10 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

const err = (code, message) => new ApiError(code, message);

function requireId(value, name = 'id') {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw err('invalid-argument', `Некорректный ${name}.`);
  return value;
}

export function randomCode(prefix) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${prefix}-${out}`;
}

function publicProfile(user, fallback = {}) {
  return {
    name: (user && user.name) || fallback.name || 'User',
    avatar: (user && user.avatar) || fallback.avatar || null,
    customAvatar: (user && user.customAvatar) || null,
    badgeStatus: (user && user.badgeStatus) || null,
    badgeConfig: (user && user.badgeConfig) || null,
  };
}

const planExp = (next) => (next.planExpiresAt === null ? FV.delete() : next.planExpiresAt);

function paypalFor(ctx) {
  const { PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV } = ctx.env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) throw err('failed-precondition', 'Оплата PayPal ещё не настроена.');
  return ctx.paypal || makePaypal({ clientId: PAYPAL_CLIENT_ID, secret: PAYPAL_SECRET, env: PAYPAL_ENV || 'live' }, ctx.fetch);
}

// =====================================================================
// 1. ПЛАТЕЖИ PAYPAL → монеты
// =====================================================================
async function createPaypalOrder(ctx) {
  const { uid, db, data } = ctx;
  const packId = data.packId;
  const pack = Object.prototype.hasOwnProperty.call(C.COIN_PACKS, packId) ? C.COIN_PACKS[packId] : null;
  if (!pack) throw err('invalid-argument', 'Неизвестный пакет.');

  const res = await paypalFor(ctx).createOrder({
    amountUsd: pack.usd, description: `Blocko Pro: ${pack.name} (${pack.coins} Coins)`, customId: uid, referenceId: packId,
  });
  if (!res.ok || !res.json.id) {
    console.error('paypal create failed', res.status, JSON.stringify(res.json));
    throw err('unavailable', 'PayPal не создал заказ. Попробуйте позже.');
  }
  await db.set(`payments/${res.json.id}`, {
    uid, packId, coins: pack.coins, usd: pack.usd, status: 'created', createdAt: FV.serverTimestamp(),
  });
  return { orderId: res.json.id };
}

async function capturePaypalOrder(ctx) {
  const { uid, db, data } = ctx;
  const orderId = data.orderId;
  if (typeof orderId !== 'string' || !/^[A-Z0-9]{5,40}$/.test(orderId)) throw err('invalid-argument', 'Некорректный заказ.');

  const payPath = `payments/${orderId}`;
  const pay = await db.get(payPath);
  if (!pay || pay.uid !== uid) throw err('not-found', 'Заказ не найден.');
  if (pay.status === 'captured') return { coins: pay.coins, alreadyCaptured: true };

  const pp = paypalFor(ctx);
  let res = await pp.captureOrder(orderId);
  if (!res.ok && res.status === 422) res = await pp.getOrder(orderId); // уже захвачен ранее
  const capture = completedCapture(res.json);
  const pack = C.COIN_PACKS[pay.packId];

  if (!capture || !pack || capture.customId !== uid || capture.currency !== 'USD' || capture.amount !== pack.usd) {
    console.error('paypal capture mismatch', orderId, res.status, JSON.stringify(capture));
    await db.set(payPath, { status: 'failed', failedAt: FV.serverTimestamp() }, { merge: true });
    throw err('failed-precondition', 'Оплата не подтверждена PayPal.');
  }

  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(payPath);
    if (fresh && fresh.status === 'captured') return { coins: pack.coins, alreadyCaptured: true };

    const user = (await tx.get(`users/${uid}`)) || {};
    const referrer = typeof user.referredBy === 'string' && ID_RE.test(user.referredBy) && user.referredBy !== uid ? user.referredBy : null;
    const cpa = referrer ? await tx.get(`affiliates_cpa/${referrer}`) : null;

    tx.set(payPath, { status: 'captured', captureId: capture.captureId, capturedAt: FV.serverTimestamp() }, { merge: true });
    tx.set(`users/${uid}`, { coins: FV.increment(pack.coins), hasPaid: true }, { merge: true });

    if (referrer) {
      if (!user.hasPaid) tx.set(`affiliates/${referrer}`, { paidSignups: FV.increment(1) }, { merge: true });
      if (cpa && cpa.isActive) {
        const rate = C.cpaRate(cpa.sales);
        const commission = Math.round(parseFloat(pack.usd) * rate * 100) / 100;
        tx.update(`affiliates_cpa/${referrer}`, {
          balanceUSD: FV.increment(commission),
          sales: FV.increment(1),
          history: FV.arrayUnion({
            id: `tx_sale_${orderId}`, amount: commission, status: 'completed',
            description: `Комиссия ${Math.round(rate * 100)}% с оплаты реферала`, date: new Date().toISOString(),
          }),
        });
      }
    }
    return { coins: pack.coins, alreadyCaptured: false };
  });
}

// =====================================================================
// 2. ПОКУПКИ ЗА МОНЕТЫ / КРЕДИТЫ
// =====================================================================
async function purchasePlan(ctx) {
  const { uid, db, data } = ctx;
  const planId = data.planId;
  const price = Object.prototype.hasOwnProperty.call(C.PLAN_PRICES, planId) ? C.PLAN_PRICES[planId] : null;
  if (!price) throw err('invalid-argument', 'Неизвестный тариф.');

  return db.runTransaction(async (tx) => {
    const user = (await tx.get(`users/${uid}`)) || {};
    if ((user.coins || 0) < price) throw err('failed-precondition', 'not_enough_coins');
    const next = C.extendPlan(user, planId, C.MONTH_MS);
    tx.set(`users/${uid}`, { coins: FV.increment(-price), plan: next.plan, planExpiresAt: planExp(next) }, { merge: true });
    return { plan: next.plan, planExpiresAt: next.planExpiresAt };
  });
}

async function storePurchase(ctx) {
  const { uid, db, data, token } = ctx;
  const { productId, currency } = data;
  const product = Object.prototype.hasOwnProperty.call(C.STORE_PRODUCTS, productId) ? C.STORE_PRODUCTS[productId] : null;
  if (!product) throw err('invalid-argument', 'Неизвестный товар.');
  if (currency !== 'coins' && currency !== 'credits') throw err('invalid-argument', 'Неизвестная валюта.');
  const price = currency === 'coins' ? product.priceCoins : product.priceCredits;
  if (!price) throw err('invalid-argument', 'Этот товар нельзя купить за эту валюту.');

  return db.runTransaction(async (tx) => {
    const [userDoc, aff] = await Promise.all([tx.get(`users/${uid}`), tx.get(`affiliates/${uid}`)]);
    const user = userDoc || {};
    const balance = currency === 'coins' ? (user.coins || 0) : ((aff && aff.earnedCredits) || 0);
    if (balance < price) throw err('failed-precondition', currency === 'coins' ? 'not_enough_coins' : 'not_enough_credits');

    if (currency === 'coins') tx.set(`users/${uid}`, { coins: FV.increment(-price) }, { merge: true });
    else tx.set(`affiliates/${uid}`, { earnedCredits: FV.increment(-price) }, { merge: true });

    const g = product.grant;
    const updates = {};
    let giftCode = null;
    if (g.bonusAi) updates.bonusAiLimit = FV.increment(g.bonusAi);
    if (g.aiDailySubMs) {
      const now = Date.now();
      const base = user.aiSubExpires && user.aiSubExpires > now ? user.aiSubExpires : now;
      updates.aiDailySub = true;
      updates.aiSubExpires = base + g.aiDailySubMs;
    }
    if (g.plan) {
      const next = C.extendPlan(user, g.plan, g.planMs);
      updates.plan = next.plan;
      updates.planExpiresAt = planExp(next);
    }
    if (g.vip) updates.vipRequestedAt = FV.serverTimestamp();
    if (g.giftCoins) {
      giftCode = randomCode('GIFT');
      tx.set(`promocodes/${giftCode}`, {
        type: 'coins', rewardCoins: g.giftCoins, maxUses: 1, uses: 0, expiresAt: null,
        isGiftBox: true, createdAt: new Date().toISOString(), createdBy: uid,
        sender: publicProfile(user, { name: token.name, avatar: token.picture }),
      });
    }
    if (Object.keys(updates).length) tx.set(`users/${uid}`, updates, { merge: true });
    return { ok: true, giftCode };
  });
}

// =====================================================================
// 3. ПРОМОКОДЫ И ПОДАРКИ
// =====================================================================
async function redeemPromo(ctx) {
  const { uid, db, data, token } = ctx;
  const code = String(data.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,64}$/.test(code)) throw err('invalid-argument', 'not_found');

  return db.runTransaction(async (tx) => {
    const [promo, userDoc] = await Promise.all([tx.get(`promocodes/${code}`), tx.get(`users/${uid}`)]);
    if (!promo) throw err('not-found', 'not_found');
    const user = userDoc || {};
    const now = Date.now();
    if (promo.expiresAt && new Date(promo.expiresAt).getTime() < now) throw err('failed-precondition', 'expired');
    if (promo.maxUses > 0 && (promo.uses || 0) >= promo.maxUses) throw err('resource-exhausted', 'limit');
    if ((user.usedPromos || []).includes(code)) throw err('already-exists', 'already_used');

    const updates = { usedPromos: FV.arrayUnion(code) };
    const reward = {};
    if (promo.type === 'plan' || promo.type === 'plan_pro_2m' || promo.type === 'plan_fl_1m') {
      const plan = promo.rewardPlan || (promo.type === 'plan_pro_2m' ? 'pro' : 'freelancer');
      if (!['freelancer', 'pro', 'infinity'].includes(plan)) throw err('failed-precondition', 'bad_promo');
      const months = Number(promo.rewardPlanDuration || (promo.type === 'plan_pro_2m' ? 2 : 1));
      const next = C.extendPlan(user, plan, months === 999 ? null : months * C.MONTH_MS, now);
      updates.plan = next.plan;
      updates.planExpiresAt = planExp(next);
      Object.assign(reward, { type: 'plan', plan: next.plan, planExpiresAt: next.planExpiresAt });
    } else if (promo.type === 'coins' || promo.type === 'coins_1000') {
      const coins = Math.max(0, Math.min(1000000, Number(promo.rewardCoins || 1000)));
      updates.coins = FV.increment(coins);
      Object.assign(reward, { type: 'coins', coins });
    } else if (promo.type === 'discount' || promo.type === 'discount_50') {
      const discount = Math.max(1, Math.min(90, Number(promo.rewardDiscount || 50)));
      updates.activeDiscount = discount;
      Object.assign(reward, { type: 'discount', discount });
    } else {
      throw err('failed-precondition', 'bad_promo');
    }

    tx.set(`users/${uid}`, updates, { merge: true });
    const promoUpdate = { uses: FV.increment(1), lastUsedAt: new Date().toISOString() };
    if (promo.isGiftBox) promoUpdate.claimedBy = publicProfile(user, { name: token.name, avatar: token.picture });
    tx.update(`promocodes/${code}`, promoUpdate);
    return reward;
  });
}

async function claimDailyGift(ctx) {
  const { uid, db, token } = ctx;
  const today = C.dayKey();
  return db.runTransaction(async (tx) => {
    const user = (await tx.get(`users/${uid}`)) || {};
    if (user.lastDailyGiftDate === today && user.lastDailyGiftCode) {
      return { code: user.lastDailyGiftCode, date: today, alreadyClaimed: true };
    }
    const code = randomCode('DGIFT');
    tx.set(`promocodes/${code}`, {
      type: 'coins', rewardCoins: C.DAILY_GIFT_COINS, maxUses: 1, uses: 0, expiresAt: null,
      isGiftBox: true, createdAt: new Date().toISOString(), createdBy: uid,
      sender: publicProfile(user, { name: token.name, avatar: token.picture }),
    });
    tx.set(`users/${uid}`, { lastDailyGiftDate: today, lastDailyGiftCode: code }, { merge: true });
    return { code, date: today, alreadyClaimed: false };
  });
}

async function claimDailyQuest(ctx) {
  const { uid, db, data } = ctx;
  const type = data.type;
  const amount = Object.prototype.hasOwnProperty.call(C.DAILY_QUESTS, type) ? C.DAILY_QUESTS[type] : null;
  if (!amount) throw err('invalid-argument', 'Неизвестное задание.');
  const today = C.dayKey();
  return db.runTransaction(async (tx) => {
    const user = (await tx.get(`users/${uid}`)) || {};
    const done = user.dailyQuestsDate === today ? (user.dailyQuests || []) : [];
    if (done.includes(type)) throw err('already-exists', 'Вы уже выполнили это задание сегодня.');
    tx.set(`users/${uid}`, { dailyQuestsDate: today, dailyQuests: [...done, type] }, { merge: true });
    tx.set(`affiliates/${uid}`, { earnedCredits: FV.increment(amount) }, { merge: true });
    return { amount, date: today, dailyQuests: [...done, type] };
  });
}

// =====================================================================
// 4. ПАРТНЁРСКАЯ ПРОГРАММА
// =====================================================================

// Вызывается клиентом сразу после регистрации (замена триггера onUserCreated).
// Начисление ровно один раз: флаг referralCredited ставится в той же транзакции.
async function registerReferral(ctx) {
  const { uid, db } = ctx;
  return db.runTransaction(async (tx) => {
    const me = await tx.get(`users/${uid}`);
    if (!me) return { credited: false, reason: 'no_user' };
    if (me.referralCredited) return { credited: false, reason: 'already' };
    const ref = me.referredBy;
    if (typeof ref !== 'string' || ref === uid || !ID_RE.test(ref)) return { credited: false, reason: 'no_referrer' };
    // Только для свежих аккаунтов: старый пользователь не может «приписать» себе пригласившего задним числом
    const created = typeof me.createdAt === 'number' ? me.createdAt : Date.parse(me.createdAt || '');
    if (!created || Date.now() - created > 24 * 60 * 60 * 1000) return { credited: false, reason: 'too_old' };

    const [refUser, cpa] = await Promise.all([tx.get(`users/${ref}`), tx.get(`affiliates_cpa/${ref}`)]);
    if (!refUser) return { credited: false, reason: 'no_referrer' };
    tx.set(`users/${uid}`, { referralCredited: true }, { merge: true });
    tx.set(`affiliates/${ref}`, { signups: FV.increment(1), earnedCredits: FV.increment(C.SIGNUP_REFERRAL_CREDITS) }, { merge: true });
    if (cpa && cpa.isActive) tx.update(`affiliates_cpa/${ref}`, { signups: FV.increment(1) });
    return { credited: true };
  });
}

async function claimReferralReward(ctx) {
  const { uid, db, data } = ctx;
  const tierKey = data.tier;
  const tier = Object.prototype.hasOwnProperty.call(C.REFERRAL_TIERS, tierKey) ? C.REFERRAL_TIERS[tierKey] : null;
  if (!tier) throw err('invalid-argument', 'Неизвестный уровень.');
  return db.runTransaction(async (tx) => {
    const [userDoc, affDoc] = await Promise.all([tx.get(`users/${uid}`), tx.get(`affiliates/${uid}`)]);
    const user = userDoc || {};
    const aff = affDoc || {};
    if ((user.rewardsClaimed || []).includes(tierKey)) throw err('already-exists', 'Награда уже получена.');
    if ((aff.signups || 0) < tier.required || (aff.paidSignups || 0) < tier.paidRequired) {
      throw err('failed-precondition', 'Условия уровня ещё не выполнены.');
    }
    const next = C.extendPlan(user, tier.plan, tier.days * C.DAY_MS);
    tx.set(`users/${uid}`, {
      plan: next.plan, planExpiresAt: planExp(next), badgeStatus: tierKey, rewardsClaimed: FV.arrayUnion(tierKey),
    }, { merge: true });
    return { plan: next.plan, planExpiresAt: next.planExpiresAt, days: tier.days };
  });
}

async function listReferrals(ctx) {
  const docs = await ctx.db.queryEq('users', 'referredBy', ctx.uid, 100);
  return { referrals: docs.map((d) => publicProfile(d.data)) };
}

async function cpaWithdraw(ctx) {
  const { uid, db } = ctx;
  const path = `affiliates_cpa/${uid}`;
  return db.runTransaction(async (tx) => {
    const cpa = await tx.get(path);
    if (!cpa || !cpa.isActive) throw err('failed-precondition', 'Кабинет партнёра не активирован.');
    const balance = Math.round((cpa.balanceUSD || 0) * 100) / 100;
    if (balance < C.CPA_MIN_WITHDRAW_USD) throw err('failed-precondition', `Минимальная сумма вывода — $${C.CPA_MIN_WITHDRAW_USD}.`);
    const entry = { id: `tx_wd_${Date.now()}`, amount: -balance, status: 'pending', description: 'Заявка на вывод средств', date: new Date().toISOString() };
    tx.update(path, { balanceUSD: FV.increment(-balance), history: FV.arrayUnion(entry) });
    return { amount: balance, txId: entry.id };
  });
}

async function cpaTransferToCoins(ctx) {
  const { uid, db } = ctx;
  const path = `affiliates_cpa/${uid}`;
  return db.runTransaction(async (tx) => {
    const cpa = await tx.get(path);
    if (!cpa || !cpa.isActive) throw err('failed-precondition', 'Кабинет партнёра не активирован.');
    const balance = Math.round((cpa.balanceUSD || 0) * 100) / 100;
    if (balance < C.CPA_MIN_TRANSFER_USD) throw err('failed-precondition', `Перевод в магазин возможен от $${C.CPA_MIN_TRANSFER_USD}.`);
    const coins = Math.floor(balance * 100);
    tx.update(path, {
      balanceUSD: FV.increment(-balance),
      history: FV.arrayUnion({ id: `tx_coins_${Date.now()}`, amount: -balance, status: 'completed', description: 'Перевод в Marketplace (B-Coins)', date: new Date().toISOString() }),
    });
    tx.set(`users/${uid}`, { coins: FV.increment(coins) }, { merge: true });
    return { amount: balance, coins };
  });
}

// =====================================================================
// 5. ДОСКИ: вход и пароли
// =====================================================================
async function enterBoard(ctx) {
  const { uid, db, data, token } = ctx;
  const boardId = requireId(data.boardId, 'boardId');
  const password = typeof data.password === 'string' ? data.password : null;
  const requestedRole = data.role === 'viewer' ? 'viewer' : 'editor';
  const boardPath = `boards/${boardId}`;
  const secretPath = `board_secrets/${boardId}`;

  const [board, secret] = await Promise.all([db.get(boardPath), db.get(secretPath)]);
  if (!board) throw err('not-found', 'Проект не найден.');

  const isOwner = board.owner === uid;
  const isMember = (board.members || []).includes(uid);
  const legacyPlain = typeof board.password === 'string' && board.password ? board.password : null;
  const hasPassword = !!(secret && secret.hash) || !!legacyPlain || board.hasPassword === true;
  const ownerProfile = (board.users || {})[board.owner] || {};
  const preview = {
    title: board.title || 'Без названия',
    owner: { name: ownerProfile.name || 'Владелец', avatar: ownerProfile.avatar || null, customAvatar: ownerProfile.customAvatar || null, badgeConfig: ownerProfile.badgeConfig || null },
    hasPassword,
  };

  if (hasPassword && !isOwner) {
    if (!password) return { status: 'password_required', preview };
    const attempts = (secret && secret.attempts && secret.attempts[uid]) || { count: 0, until: 0 };
    if (attempts.until > Date.now()) throw err('resource-exhausted', 'Слишком много попыток. Подождите 10 минут.');

    let ok = false;
    if (secret && secret.hash) ok = await verifyPassword(password, secret.hash);
    else if (legacyPlain) ok = equalsPlain(password, legacyPlain);

    if (!ok) {
      const count = (attempts.count || 0) + 1;
      const locked = count >= MAX_PASSWORD_ATTEMPTS;
      await db.set(secretPath, { attempts: { [uid]: { count: locked ? 0 : count, until: locked ? Date.now() + PASSWORD_LOCK_MS : 0 } } }, { merge: true });
      throw err('permission-denied', 'wrong_password');
    }

    const secretUpdate = { attempts: { [uid]: FV.delete() } };
    if (legacyPlain && !(secret && secret.hash)) {
      secretUpdate.hash = await hashPassword(legacyPlain); // миграция старого пароля в хэш
      await db.update(boardPath, { password: FV.delete(), hasPassword: true });
    }
    await db.set(secretPath, secretUpdate, { merge: true });
    await db.set(`${boardPath}/unlocks/${uid}`, { expiresAt: timestamp(Date.now() + UNLOCK_TTL_MS) });
  }

  if (!isMember && !isOwner) {
    const [owner, me] = await Promise.all([db.get(`users/${board.owner}`), db.get(`users/${uid}`)]);
    const ownerPlan = C.effectivePlan(owner || {});
    const limit = C.MEMBER_LIMITS[ownerPlan] || C.MEMBER_LIMITS.free;
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(boardPath);
      const members = (fresh && fresh.members) || [];
      if (members.includes(uid)) return;
      if (members.length >= limit) throw err('resource-exhausted', 'member_limit');
      tx.update(boardPath, {
        members: FV.arrayUnion(uid),
        [`users.${uid}`]: { ...publicProfile(me || {}, { name: token.name, avatar: token.picture }), role: requestedRole },
      });
    });
    return { status: 'joined', preview };
  }
  return { status: 'ok', preview };
}

async function setBoardPassword(ctx) {
  const { uid, db, data } = ctx;
  const boardId = requireId(data.boardId, 'boardId');
  const password = typeof data.password === 'string' ? data.password.trim() : '';
  if (password.length > 128) throw err('invalid-argument', 'Пароль слишком длинный.');

  const boardPath = `boards/${boardId}`;
  const board = await db.get(boardPath);
  if (!board) throw err('not-found', 'Проект не найден.');
  if (board.owner !== uid) throw err('permission-denied', 'Пароль меняет только владелец.');

  if (password) {
    await db.set(`board_secrets/${boardId}`, { hash: await hashPassword(password), attempts: {} });
    await db.update(boardPath, { hasPassword: true, password: FV.delete() });
    // Старые разблокировки больше не действуют
    const ids = await db.listIds(`${boardPath}/unlocks`);
    if (ids.length) await db.commit(ids.map((id) => ({ delete: db.docName(`${boardPath}/unlocks/${id}`) })));
  } else {
    await db.delete(`board_secrets/${boardId}`);
    await db.update(boardPath, { hasPassword: false, password: FV.delete() });
  }
  return { hasPassword: !!password };
}

export const HANDLERS = {
  createPaypalOrder, capturePaypalOrder,
  purchasePlan, storePurchase,
  redeemPromo, claimDailyGift, claimDailyQuest,
  registerReferral, claimReferralReward, listReferrals, cpaWithdraw, cpaTransferToCoins,
  enterBoard, setBoardPassword,
};
