'use strict';
// =====================================================================
// Каталог цен — ЕДИНСТВЕННЫЙ источник правды для сервера.
// Клиент может показывать цены, но списывает и начисляет только сервер.
// =====================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

// Пакеты монет за реальные деньги (PayPal)
const COIN_PACKS = {
  starter: { coins: 1000, usd: '10.00', name: 'Набор Новичка' },
  popular: { coins: 5000, usd: '45.00', name: 'Популярный' },
  max: { coins: 12000, usd: '100.00', name: 'Максимальный' },
};

// Тарифы за монеты (окно тарифов на главной)
const PLAN_PRICES = {
  freelancer: 600,
  pro: 1900,
};

// Товары магазина (store.html). plan — id тарифа в приложении.
const STORE_PRODUCTS = {
  ai_50: { priceCoins: 200, priceCredits: 600, grant: { bonusAi: 50 } },
  ai_200: { priceCoins: 600, priceCredits: 1800, grant: { bonusAi: 200 } },
  ai_daily_sub: { priceCoins: 1500, priceCredits: 4500, grant: { aiDailySubMs: MONTH_MS } },
  plan_freelancer: { priceCoins: 600, priceCredits: 1800, grant: { plan: 'freelancer', planMs: MONTH_MS } },
  plan_company: { priceCoins: 1900, priceCredits: 5700, grant: { plan: 'pro', planMs: MONTH_MS } },
  vip_status: { priceCoins: 5000, priceCredits: 15000, grant: { vip: true } },
  gift_20: { priceCoins: 2000, grant: { giftCoins: 2000 } },
  gift_100: { priceCoins: 10000, grant: { giftCoins: 10000 } },
  gift_200: { priceCoins: 20000, grant: { giftCoins: 20000 } },
};

// Награды партнёрской программы (config.js → REWARDS)
const REFERRAL_TIERS = {
  friend: { required: 10, paidRequired: 0, plan: 'freelancer', days: 14 },
  partner: { required: 25, paidRequired: 0, plan: 'pro', days: 14 },
  ambassador: { required: 50, paidRequired: 10, plan: 'pro', days: 60 },
};

// Ежедневные задания (кредиты партнёрки)
const DAILY_QUESTS = {
  login: 10,
  telegram: 50,
};

const DAILY_GIFT_COINS = 50;
const SIGNUP_REFERRAL_CREDITS = 10;
const CPA_COMMISSION = 0.2;
const CPA_MIN_WITHDRAW_USD = 50;
const CPA_MIN_TRANSFER_USD = 10;

// Лимиты участников по тарифу владельца
const MEMBER_LIMITS = { free: 3, freelancer: 10, pro: 9999, infinity: 9999 };
// Лимиты облачных досок по тарифу владельца
const BOARD_LIMITS = { free: 1, freelancer: 10, pro: 999, infinity: 999 };

// Тариф с учётом срока действия
function effectivePlan(user, now = Date.now()) {
  const plan = (user && user.plan) || 'free';
  const exp = user && user.planExpiresAt;
  if (plan !== 'free' && typeof exp === 'number' && exp < now) return 'free';
  return plan;
}

// Продление тарифа: тот же тариф — добавляем срок к текущему, иначе считаем от сейчас
function extendPlan(user, plan, durationMs, now = Date.now()) {
  const current = effectivePlan(user, now);
  const currentExp = user && typeof user.planExpiresAt === 'number' ? user.planExpiresAt : 0;
  if (current === 'infinity') return { plan: 'infinity', planExpiresAt: null }; // не понижаем бессрочный
  if (durationMs === null) return { plan, planExpiresAt: null };
  const base = current === plan && currentExp > now ? currentExp : now;
  return { plan, planExpiresAt: base + durationMs };
}

// Дата «дня» для ежедневных наград — по Киеву, в формате дд.мм.гггг (как на клиенте)
function dayKey(now = Date.now()) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(now));
}

module.exports = {
  DAY_MS, MONTH_MS, COIN_PACKS, PLAN_PRICES, STORE_PRODUCTS, REFERRAL_TIERS, DAILY_QUESTS,
  DAILY_GIFT_COINS, SIGNUP_REFERRAL_CREDITS, CPA_COMMISSION, CPA_MIN_WITHDRAW_USD, CPA_MIN_TRANSFER_USD, MEMBER_LIMITS, BOARD_LIMITS,
  effectivePlan, extendPlan, dayKey,
};
