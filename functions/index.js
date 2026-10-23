'use strict';
// =====================================================================
// BLOCKO PRO — Cloud Functions (2nd gen)
//
// Всё, что касается денег, тарифов, промокодов, наград и паролей досок,
// выполняется здесь. Firestore Rules запрещают клиенту менять эти поля.
// =====================================================================

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const crypto = require('crypto');

const C = require('./lib/catalog');
const { hashPassword, verifyPassword, equalsPlain } = require('./lib/passwords');
const paypal = require('./lib/paypal');

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const PAYPAL_CLIENT_ID = defineSecret('PAYPAL_CLIENT_ID');
const PAYPAL_SECRET = defineSecret('PAYPAL_SECRET');
const PAYPAL_ENV = defineString('PAYPAL_ENV', { default: 'live' }); // 'live' | 'sandbox'

const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_PASSWORD_ATTEMPTS = 5;
const PASSWORD_LOCK_MS = 10 * 60 * 1000;

// ---------- helpers ----------
function requireAuth(req) {
  if (!req.auth || !req.auth.uid) throw new HttpsError('unauthenticated', 'Войдите в аккаунт.');
  return req.auth.uid;
}

function requireId(value, name = 'id') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', `Некорректный ${name}.`);
  }
  return value;
}

function randomCode(prefix) {
  // 10 символов без похожих (0/O, 1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
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

function paypalCreds() {
  return { clientId: PAYPAL_CLIENT_ID.value(), secret: PAYPAL_SECRET.value(), env: PAYPAL_ENV.value() };
}

// =====================================================================
// 1. ПЛАТЕЖИ PAYPAL → монеты
// =====================================================================

// Создание заказа на сервере: сумма берётся из каталога, а не от клиента
exports.createPaypalOrder = onCall({ secrets: [PAYPAL_CLIENT_ID, PAYPAL_SECRET] }, async (req) => {
  const uid = requireAuth(req);
  const packId = req.data && req.data.packId;
  const pack = C.COIN_PACKS[packId];
  if (!pack) throw new HttpsError('invalid-argument', 'Неизвестный пакет.');

  const res = await paypal.createOrder(paypalCreds(), {
    amountUsd: pack.usd,
    description: `Blocko Pro: ${pack.name} (${pack.coins} Coins)`,
    customId: uid,
    referenceId: packId,
  });
  if (!res.ok || !res.json.id) {
    logger.error('paypal create failed', res.status, res.json);
    throw new HttpsError('unavailable', 'PayPal не создал заказ. Попробуйте позже.');
  }

  await db.collection('payments').doc(res.json.id).set({
    uid, packId, coins: pack.coins, usd: pack.usd, status: 'created',
    createdAt: FieldValue.serverTimestamp(),
  });
  return { orderId: res.json.id };
});

// Захват оплаты и зачисление монет (идемпотентно: повторный вызов не начислит дважды)
exports.capturePaypalOrder = onCall({ secrets: [PAYPAL_CLIENT_ID, PAYPAL_SECRET] }, async (req) => {
  const uid = requireAuth(req);
  const orderId = req.data && req.data.orderId;
  if (typeof orderId !== 'string' || !/^[A-Z0-9]{5,40}$/.test(orderId)) {
    throw new HttpsError('invalid-argument', 'Некорректный заказ.');
  }

  const payRef = db.collection('payments').doc(orderId);
  const paySnap = await payRef.get();
  if (!paySnap.exists || paySnap.data().uid !== uid) throw new HttpsError('not-found', 'Заказ не найден.');
  if (paySnap.data().status === 'captured') return { coins: paySnap.data().coins, alreadyCaptured: true };

  const creds = paypalCreds();
  let res = await paypal.captureOrder(creds, orderId);
  if (!res.ok && res.status === 422) res = await paypal.getOrder(creds, orderId); // уже захвачен ранее
  const capture = paypal.completedCapture(res.json);
  const pack = C.COIN_PACKS[paySnap.data().packId];

  if (!capture || !pack || capture.customId !== uid || capture.currency !== 'USD' || capture.amount !== pack.usd) {
    logger.error('paypal capture mismatch', { orderId, status: res.status, capture });
    await payRef.set({ status: 'failed', failedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw new HttpsError('failed-precondition', 'Оплата не подтверждена PayPal.');
  }

  const result = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(payRef);
    if (fresh.data().status === 'captured') return { coins: pack.coins, alreadyCaptured: true };

    const userRef = db.collection('users').doc(uid);
    const userSnap = await tx.get(userRef);
    const user = userSnap.exists ? userSnap.data() : {};
    const referrer = typeof user.referredBy === 'string' && user.referredBy !== uid ? user.referredBy : null;
    const cpaRef = referrer ? db.collection('affiliates_cpa').doc(referrer) : null;
    const cpaSnap = cpaRef ? await tx.get(cpaRef) : null;

    tx.set(payRef, { status: 'captured', captureId: capture.captureId, capturedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(userRef, { coins: FieldValue.increment(pack.coins), hasPaid: true }, { merge: true });

    if (referrer) {
      if (!user.hasPaid) {
        tx.set(db.collection('affiliates').doc(referrer), { paidSignups: FieldValue.increment(1) }, { merge: true });
      }
      if (cpaSnap && cpaSnap.exists && cpaSnap.data().isActive) {
        const commission = Math.round(parseFloat(pack.usd) * C.CPA_COMMISSION * 100) / 100;
        tx.update(cpaRef, {
          balanceUSD: FieldValue.increment(commission),
          sales: FieldValue.increment(1),
          history: FieldValue.arrayUnion({
            id: `tx_sale_${orderId}`, amount: commission, status: 'completed',
            description: `Комиссия ${Math.round(C.CPA_COMMISSION * 100)}% с оплаты реферала`, date: new Date().toISOString(),
          }),
        });
      }
    }
    return { coins: pack.coins, alreadyCaptured: false };
  });

  return result;
});

// =====================================================================
// 2. ПОКУПКИ ЗА МОНЕТЫ / КРЕДИТЫ
// =====================================================================

// Тариф из окна тарифов (index.html)
exports.purchasePlan = onCall(async (req) => {
  const uid = requireAuth(req);
  const planId = req.data && req.data.planId;
  const price = C.PLAN_PRICES[planId];
  if (!price) throw new HttpsError('invalid-argument', 'Неизвестный тариф.');

  return db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(uid);
    const snap = await tx.get(userRef);
    const user = snap.exists ? snap.data() : {};
    if ((user.coins || 0) < price) throw new HttpsError('failed-precondition', 'not_enough_coins');
    const next = C.extendPlan(user, planId, C.MONTH_MS);
    tx.set(userRef, {
      coins: FieldValue.increment(-price),
      plan: next.plan,
      planExpiresAt: next.planExpiresAt === null ? FieldValue.delete() : next.planExpiresAt,
    }, { merge: true });
    return { plan: next.plan, planExpiresAt: next.planExpiresAt };
  });
});

// Товары магазина (store.html)
exports.storePurchase = onCall(async (req) => {
  const uid = requireAuth(req);
  const { productId, currency } = req.data || {};
  const product = C.STORE_PRODUCTS[productId];
  if (!product) throw new HttpsError('invalid-argument', 'Неизвестный товар.');
  if (currency !== 'coins' && currency !== 'credits') throw new HttpsError('invalid-argument', 'Неизвестная валюта.');
  const price = currency === 'coins' ? product.priceCoins : product.priceCredits;
  if (!price) throw new HttpsError('invalid-argument', 'Этот товар нельзя купить за эту валюту.');

  return db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(uid);
    const affRef = db.collection('affiliates').doc(uid);
    const [userSnap, affSnap] = await Promise.all([tx.get(userRef), tx.get(affRef)]);
    const user = userSnap.exists ? userSnap.data() : {};
    const balance = currency === 'coins' ? (user.coins || 0) : ((affSnap.exists && affSnap.data().earnedCredits) || 0);
    if (balance < price) throw new HttpsError('failed-precondition', currency === 'coins' ? 'not_enough_coins' : 'not_enough_credits');

    if (currency === 'coins') tx.set(userRef, { coins: FieldValue.increment(-price) }, { merge: true });
    else tx.set(affRef, { earnedCredits: FieldValue.increment(-price) }, { merge: true });

    const g = product.grant;
    const userUpdates = {};
    let giftCode = null;
    if (g.bonusAi) userUpdates.bonusAiLimit = FieldValue.increment(g.bonusAi);
    if (g.aiDailySubMs) {
      const now = Date.now();
      const base = user.aiSubExpires && user.aiSubExpires > now ? user.aiSubExpires : now;
      userUpdates.aiDailySub = true;
      userUpdates.aiSubExpires = base + g.aiDailySubMs;
    }
    if (g.plan) {
      const next = C.extendPlan(user, g.plan, g.planMs);
      userUpdates.plan = next.plan;
      userUpdates.planExpiresAt = next.planExpiresAt === null ? FieldValue.delete() : next.planExpiresAt;
    }
    if (g.vip) userUpdates.vipRequestedAt = FieldValue.serverTimestamp();
    if (g.giftCoins) {
      giftCode = randomCode('GIFT');
      tx.set(db.collection('promocodes').doc(giftCode), {
        type: 'coins', rewardCoins: g.giftCoins, maxUses: 1, uses: 0, expiresAt: null,
        isGiftBox: true, createdAt: new Date().toISOString(), createdBy: uid,
        sender: publicProfile(user, { name: req.auth.token.name, avatar: req.auth.token.picture }),
      });
    }
    if (Object.keys(userUpdates).length) tx.set(userRef, userUpdates, { merge: true });
    return { ok: true, giftCode };
  });
});

// =====================================================================
// 3. ПРОМОКОДЫ И ПОДАРКИ
// =====================================================================
exports.redeemPromo = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String((req.data && req.data.code) || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,64}$/.test(code)) throw new HttpsError('invalid-argument', 'not_found');

  return db.runTransaction(async (tx) => {
    const promoRef = db.collection('promocodes').doc(code);
    const userRef = db.collection('users').doc(uid);
    const [promoSnap, userSnap] = await Promise.all([tx.get(promoRef), tx.get(userRef)]);
    if (!promoSnap.exists) throw new HttpsError('not-found', 'not_found');

    const promo = promoSnap.data();
    const user = userSnap.exists ? userSnap.data() : {};
    const now = Date.now();
    if (promo.expiresAt && new Date(promo.expiresAt).getTime() < now) throw new HttpsError('failed-precondition', 'expired');
    if (promo.maxUses > 0 && (promo.uses || 0) >= promo.maxUses) throw new HttpsError('resource-exhausted', 'limit');
    if ((user.usedPromos || []).includes(code)) throw new HttpsError('already-exists', 'already_used');

    const updates = { usedPromos: FieldValue.arrayUnion(code) };
    const reward = {};

    if (promo.type === 'plan' || promo.type === 'plan_pro_2m' || promo.type === 'plan_fl_1m') {
      const plan = promo.rewardPlan || (promo.type === 'plan_pro_2m' ? 'pro' : 'freelancer');
      if (!['freelancer', 'pro', 'infinity'].includes(plan)) throw new HttpsError('failed-precondition', 'bad_promo');
      const months = Number(promo.rewardPlanDuration || (promo.type === 'plan_pro_2m' ? 2 : 1));
      const next = C.extendPlan(user, plan, months === 999 ? null : months * C.MONTH_MS, now);
      updates.plan = next.plan;
      updates.planExpiresAt = next.planExpiresAt === null ? FieldValue.delete() : next.planExpiresAt;
      Object.assign(reward, { type: 'plan', plan: next.plan, planExpiresAt: next.planExpiresAt });
    } else if (promo.type === 'coins' || promo.type === 'coins_1000') {
      const coins = Math.max(0, Math.min(1000000, Number(promo.rewardCoins || 1000)));
      updates.coins = FieldValue.increment(coins);
      Object.assign(reward, { type: 'coins', coins });
    } else if (promo.type === 'discount' || promo.type === 'discount_50') {
      const discount = Math.max(1, Math.min(90, Number(promo.rewardDiscount || 50)));
      updates.activeDiscount = discount;
      Object.assign(reward, { type: 'discount', discount });
    } else {
      throw new HttpsError('failed-precondition', 'bad_promo');
    }

    tx.set(userRef, updates, { merge: true });
    const promoUpdate = { uses: FieldValue.increment(1), lastUsedAt: new Date().toISOString() };
    // Для подарков сохраняем, кто распаковал (только публичный профиль) — его видит дарящий
    if (promo.isGiftBox) promoUpdate.claimedBy = publicProfile(user, { name: req.auth.token.name, avatar: req.auth.token.picture });
    tx.update(promoRef, promoUpdate);
    return reward;
  });
});

// Ежедневный подарок в магазине: код на 50 монет раз в сутки
exports.claimDailyGift = onCall(async (req) => {
  const uid = requireAuth(req);
  const today = C.dayKey();
  return db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(uid);
    const snap = await tx.get(userRef);
    const user = snap.exists ? snap.data() : {};
    if (user.lastDailyGiftDate === today && user.lastDailyGiftCode) {
      return { code: user.lastDailyGiftCode, date: today, alreadyClaimed: true };
    }
    const code = randomCode('DGIFT');
    tx.set(db.collection('promocodes').doc(code), {
      type: 'coins', rewardCoins: C.DAILY_GIFT_COINS, maxUses: 1, uses: 0, expiresAt: null,
      isGiftBox: true, createdAt: new Date().toISOString(), createdBy: uid,
      sender: publicProfile(user, { name: req.auth.token.name, avatar: req.auth.token.picture }),
    });
    tx.set(userRef, { lastDailyGiftDate: today, lastDailyGiftCode: code }, { merge: true });
    return { code, date: today, alreadyClaimed: false };
  });
});

// Ежедневные задания: кредиты партнёрской программы
exports.claimDailyQuest = onCall(async (req) => {
  const uid = requireAuth(req);
  const type = req.data && req.data.type;
  const amount = C.DAILY_QUESTS[type];
  if (!amount) throw new HttpsError('invalid-argument', 'Неизвестное задание.');
  const today = C.dayKey();

  return db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(uid);
    const snap = await tx.get(userRef);
    const user = snap.exists ? snap.data() : {};
    const done = user.dailyQuestsDate === today ? (user.dailyQuests || []) : [];
    if (done.includes(type)) throw new HttpsError('already-exists', 'Вы уже выполнили это задание сегодня.');
    tx.set(userRef, { dailyQuestsDate: today, dailyQuests: [...done, type] }, { merge: true });
    tx.set(db.collection('affiliates').doc(uid), { earnedCredits: FieldValue.increment(amount) }, { merge: true });
    return { amount, date: today, dailyQuests: [...done, type] };
  });
});

// =====================================================================
// 4. ПАРТНЁРСКАЯ ПРОГРАММА
// =====================================================================

// Новый пользователь пришёл по реферальной ссылке
exports.onUserCreated = onDocumentCreated('users/{userId}', async (event) => {
  const data = event.data && event.data.data();
  const userId = event.params.userId;
  const ref = data && data.referredBy;
  if (typeof ref !== 'string' || ref === userId || !/^[A-Za-z0-9_-]{1,128}$/.test(ref)) return;

  const refUser = await db.collection('users').doc(ref).get();
  if (!refUser.exists) return;

  await db.runTransaction(async (tx) => {
    const markRef = db.collection('users').doc(userId);
    const mark = await tx.get(markRef);
    if (mark.exists && mark.data().referralCredited) return; // повторная доставка события
    const cpaRef = db.collection('affiliates_cpa').doc(ref);
    const cpa = await tx.get(cpaRef);
    tx.set(markRef, { referralCredited: true }, { merge: true });
    tx.set(db.collection('affiliates').doc(ref), {
      signups: FieldValue.increment(1),
      earnedCredits: FieldValue.increment(C.SIGNUP_REFERRAL_CREDITS),
    }, { merge: true });
    if (cpa.exists && cpa.data().isActive) tx.update(cpaRef, { signups: FieldValue.increment(1) });
  });
});

// Получение награды за уровень (друг / партнёр / амбассадор)
exports.claimReferralReward = onCall(async (req) => {
  const uid = requireAuth(req);
  const tierKey = req.data && req.data.tier;
  const tier = C.REFERRAL_TIERS[tierKey];
  if (!tier) throw new HttpsError('invalid-argument', 'Неизвестный уровень.');

  return db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(uid);
    const affRef = db.collection('affiliates').doc(uid);
    const [userSnap, affSnap] = await Promise.all([tx.get(userRef), tx.get(affRef)]);
    const user = userSnap.exists ? userSnap.data() : {};
    const aff = affSnap.exists ? affSnap.data() : {};
    if ((user.rewardsClaimed || []).includes(tierKey)) throw new HttpsError('already-exists', 'Награда уже получена.');
    if ((aff.signups || 0) < tier.required || (aff.paidSignups || 0) < tier.paidRequired) {
      throw new HttpsError('failed-precondition', 'Условия уровня ещё не выполнены.');
    }
    const next = C.extendPlan(user, tier.plan, tier.days * C.DAY_MS);
    tx.set(userRef, {
      plan: next.plan,
      planExpiresAt: next.planExpiresAt === null ? FieldValue.delete() : next.planExpiresAt,
      badgeStatus: tierKey,
      rewardsClaimed: FieldValue.arrayUnion(tierKey),
    }, { merge: true });
    return { plan: next.plan, planExpiresAt: next.planExpiresAt, days: tier.days };
  });
});

// Список приглашённых (только публичные поля — без email и балансов)
exports.listReferrals = onCall(async (req) => {
  const uid = requireAuth(req);
  const snap = await db.collection('users').where('referredBy', '==', uid).limit(100).get();
  return { referrals: snap.docs.map((d) => publicProfile(d.data())) };
});

// CPA: заявка на вывод (админ подтверждает/отклоняет в Command Center)
exports.cpaWithdraw = onCall(async (req) => {
  const uid = requireAuth(req);
  const ref = db.collection('affiliates_cpa').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || !snap.data().isActive) throw new HttpsError('failed-precondition', 'Кабинет партнёра не активирован.');
    const balance = Math.round((snap.data().balanceUSD || 0) * 100) / 100;
    if (balance < C.CPA_MIN_WITHDRAW_USD) throw new HttpsError('failed-precondition', `Минимальная сумма вывода — $${C.CPA_MIN_WITHDRAW_USD}.`);
    const entry = { id: `tx_wd_${Date.now()}`, amount: -balance, status: 'pending', description: 'Заявка на вывод средств', date: new Date().toISOString() };
    tx.update(ref, { balanceUSD: FieldValue.increment(-balance), history: FieldValue.arrayUnion(entry) });
    return { amount: balance, txId: entry.id };
  });
});

// CPA: перевод заработка в монеты магазина ($1 = 100 монет)
exports.cpaTransferToCoins = onCall(async (req) => {
  const uid = requireAuth(req);
  const ref = db.collection('affiliates_cpa').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || !snap.data().isActive) throw new HttpsError('failed-precondition', 'Кабинет партнёра не активирован.');
    const balance = Math.round((snap.data().balanceUSD || 0) * 100) / 100;
    if (balance < C.CPA_MIN_TRANSFER_USD) throw new HttpsError('failed-precondition', `Перевод в магазин возможен от $${C.CPA_MIN_TRANSFER_USD}.`);
    const coins = Math.floor(balance * 100);
    tx.update(ref, {
      balanceUSD: FieldValue.increment(-balance),
      history: FieldValue.arrayUnion({ id: `tx_coins_${Date.now()}`, amount: -balance, status: 'completed', description: 'Перевод в Marketplace (B-Coins)', date: new Date().toISOString() }),
    });
    tx.set(db.collection('users').doc(uid), { coins: FieldValue.increment(coins) }, { merge: true });
    return { amount: balance, coins };
  });
});

// =====================================================================
// 5. ДОСКИ: вход, пароли, лимиты, очистка
// =====================================================================

// Вход/присоединение к доске. Пароль проверяется только здесь.
exports.enterBoard = onCall(async (req) => {
  const uid = requireAuth(req);
  const boardId = requireId(req.data && req.data.boardId, 'boardId');
  const password = req.data && typeof req.data.password === 'string' ? req.data.password : null;
  const requestedRole = req.data && req.data.role === 'viewer' ? 'viewer' : 'editor';

  const boardRef = db.collection('boards').doc(boardId);
  const secretRef = db.collection('board_secrets').doc(boardId);
  const [boardSnap, secretSnap] = await Promise.all([boardRef.get(), secretRef.get()]);
  if (!boardSnap.exists) throw new HttpsError('not-found', 'Проект не найден.');

  const board = boardSnap.data();
  const isOwner = board.owner === uid;
  const isMember = (board.members || []).includes(uid);
  const secret = secretSnap.exists ? secretSnap.data() : null;
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
    if (attempts.until > Date.now()) {
      throw new HttpsError('resource-exhausted', 'Слишком много попыток. Подождите 10 минут.');
    }

    let ok = false;
    if (secret && secret.hash) ok = verifyPassword(password, secret.hash);
    else if (legacyPlain) ok = equalsPlain(password, legacyPlain);

    if (!ok) {
      const count = attempts.count + 1;
      await secretRef.set({
        attempts: { [uid]: { count: count >= MAX_PASSWORD_ATTEMPTS ? 0 : count, until: count >= MAX_PASSWORD_ATTEMPTS ? Date.now() + PASSWORD_LOCK_MS : 0 } },
      }, { merge: true });
      throw new HttpsError('permission-denied', 'wrong_password');
    }

    const secretUpdate = { attempts: { [uid]: FieldValue.delete() } };
    if (legacyPlain && !(secret && secret.hash)) {
      // Миграция старого пароля из документа доски в хэш
      secretUpdate.hash = hashPassword(legacyPlain);
      await boardRef.update({ password: FieldValue.delete(), hasPassword: true });
    }
    await secretRef.set(secretUpdate, { merge: true });
    await boardRef.collection('unlocks').doc(uid).set({ expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + UNLOCK_TTL_MS) });
  }

  if (!isMember && !isOwner) {
    const [ownerSnap, meSnap] = await Promise.all([
      db.collection('users').doc(board.owner).get(),
      db.collection('users').doc(uid).get(),
    ]);
    const ownerPlan = C.effectivePlan(ownerSnap.exists ? ownerSnap.data() : {});
    const limit = C.MEMBER_LIMITS[ownerPlan] || C.MEMBER_LIMITS.free;

    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(boardRef);
      const members = fresh.data().members || [];
      if (members.includes(uid)) return;
      if (members.length >= limit) throw new HttpsError('resource-exhausted', 'member_limit');
      tx.update(boardRef, {
        members: FieldValue.arrayUnion(uid),
        [`users.${uid}`]: { ...publicProfile(meSnap.exists ? meSnap.data() : {}, { name: req.auth.token.name, avatar: req.auth.token.picture }), role: requestedRole },
      });
    });
    return { status: 'joined', preview };
  }

  return { status: 'ok', preview };
});

// Установка/снятие пароля владельцем
exports.setBoardPassword = onCall(async (req) => {
  const uid = requireAuth(req);
  const boardId = requireId(req.data && req.data.boardId, 'boardId');
  const password = req.data && typeof req.data.password === 'string' ? req.data.password.trim() : '';
  if (password.length > 128) throw new HttpsError('invalid-argument', 'Пароль слишком длинный.');

  const boardRef = db.collection('boards').doc(boardId);
  const snap = await boardRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Проект не найден.');
  if (snap.data().owner !== uid) throw new HttpsError('permission-denied', 'Пароль меняет только владелец.');

  const secretRef = db.collection('board_secrets').doc(boardId);
  if (password) {
    await secretRef.set({ hash: hashPassword(password), attempts: {} });
    await boardRef.update({ hasPassword: true, password: FieldValue.delete() });
    // Старые разблокировки больше не действуют
    await db.recursiveDelete(boardRef.collection('unlocks'));
  } else {
    await secretRef.delete();
    await boardRef.update({ hasPassword: false, password: FieldValue.delete() });
  }
  return { hasPassword: !!password };
});

// Лимит облачных досок по тарифу + запрет пароля в открытом виде
exports.onBoardCreated = onDocumentCreated('boards/{boardId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const board = snap.data();
  if (typeof board.password === 'string') {
    await snap.ref.update({ password: FieldValue.delete() }); // правила это запрещают, но на всякий случай
  }
  const ownerSnap = await db.collection('users').doc(board.owner).get();
  const plan = C.effectivePlan(ownerSnap.exists ? ownerSnap.data() : {});
  const limit = C.BOARD_LIMITS[plan] || C.BOARD_LIMITS.free;
  const owned = await db.collection('boards').where('owner', '==', board.owner).count().get();
  if (owned.data().count > limit) {
    logger.warn('board limit exceeded, removing', { boardId: snap.id, owner: board.owner, plan });
    await db.recursiveDelete(snap.ref);
  }
});

// Удаление доски: чистим подколлекции и секрет
exports.onBoardDeleted = onDocumentDeleted('boards/{boardId}', async (event) => {
  const boardRef = db.collection('boards').doc(event.params.boardId);
  await Promise.all([
    db.recursiveDelete(boardRef.collection('cards')),
    db.recursiveDelete(boardRef.collection('chat')),
    db.recursiveDelete(boardRef.collection('activity')),
    db.recursiveDelete(boardRef.collection('unlocks')),
    db.collection('board_secrets').doc(event.params.boardId).delete().catch(() => {}),
  ]);
});
