// ==========================================
// BLOCKO API — серверные операции (деньги, тарифы, промокоды, пароли досок)
//
// Куда уходят запросы:
//   1) Cloudflare Worker (папка worker/) — если его адрес записан в api-endpoint.json
//      (это делает GitHub Action «Деплой API (Cloudflare)» автоматически). Работает
//      на бесплатном тарифе Firebase, Blaze не нужен.
//   2) Иначе — Firebase Cloud Functions (папка functions/, нужен тариф Blaze).
// Требует config.js (инициализация Firebase). Для варианта 2 — firebase-functions-compat.js.
// ==========================================
(function (global) {
  'use strict';

  const REGION = 'us-central1';
  const BACKEND_DOWN_MESSAGE = 'Сервис временно недоступен: идёт обновление сервера. Попробуйте чуть позже.';
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || global.location.href;

  // ---------- адрес воркера ----------
  let endpointPromise = null;
  function workerBase() {
    if (typeof global.BLOCKO_API_URL === 'string') return Promise.resolve(global.BLOCKO_API_URL.trim().replace(/\/+$/, ''));
    if (!endpointPromise) {
      endpointPromise = fetch(new URL('api-endpoint.json', SCRIPT_SRC).href, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : {}))
        .then((j) => (j && typeof j.url === 'string' && /^https:\/\//.test(j.url.trim()) ? j.url.trim().replace(/\/+$/, '') : ''))
        .catch(() => '');
      // Не нашли адрес — через минуту попробуем снова (например, сайт только что обновился)
      endpointPromise.then((url) => { if (!url) setTimeout(() => { endpointPromise = null; }, 60000); });
    }
    return endpointPromise;
  }

  function apiError(code, message, cause) {
    const e = new Error(message);
    e.code = code;
    if (cause) e.cause = cause;
    return e;
  }

  async function callWorker(base, name, data, retried) {
    const user = global.firebase && firebase.auth().currentUser;
    if (!user) throw apiError('unauthenticated', 'Войдите в аккаунт.');
    const token = await user.getIdToken(!!retried);
    let res;
    try {
      res = await fetch(`${base}/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ data: data || {} }),
      });
    } catch (netErr) {
      throw apiError('unavailable', '', netErr); // нет сети или сервер недоступен
    }
    const body = await res.json().catch(() => null);
    if (body && Object.prototype.hasOwnProperty.call(body, 'result')) return body.result;
    if (body && body.error) {
      // Токен мог устареть — обновляем и повторяем один раз
      if (body.error.status === 'unauthenticated' && !retried) return callWorker(base, name, data, true);
      throw apiError(String(body.error.status || 'internal'), String(body.error.message || ''));
    }
    throw apiError(res.status >= 500 ? 'unavailable' : 'internal', '');
  }

  async function callFunctions(name, data) {
    if (!firebase.app().functions) throw apiError('unavailable', '');
    const res = await firebase.app().functions(REGION).httpsCallable(name)(data || {});
    return res.data;
  }

  /**
   * Сервер не задеплоен / не отвечает (а не осмысленная ошибка нашего кода).
   * Отсутствующая Cloud Function падает на CORS-preflight, и SDK отдаёт code=internal с текстом «internal».
   */
  function isBackendUnavailable(err) {
    const code = String((err && err.code) || '').replace(/^functions\//, '');
    const msg = String((err && err.message) || '').trim().toLowerCase();
    if (code === 'internal' && (msg === 'internal' || msg === '')) return true;
    if (code === 'not-found' && (msg === 'not-found' || msg === 'not_found' || msg === 'not found')) return true;
    if (code === 'unavailable' && (msg === 'unavailable' || msg === '')) return true;
    if (code === 'deadline-exceeded') return true;
    return false;
  }

  /**
   * Вызов серверной операции. Возвращает результат.
   * fallback(data) — запасной путь, если сервер недоступен (только для некритичных к деньгам операций).
   */
  async function call(name, data, fallback) {
    try {
      const base = await workerBase();
      return base ? await callWorker(base, name, data) : await callFunctions(name, data);
    } catch (err) {
      if (isBackendUnavailable(err)) {
        console.warn(`[BlockoAPI] операция ${name} недоступна`, err);
        if (typeof fallback === 'function') return fallback(data || {});
        const down = apiError('backend-unavailable', BACKEND_DOWN_MESSAGE, err);
        throw down;
      }
      throw err;
    }
  }

  /** Код ошибки сервера без префикса "functions/" (например, 'permission-denied'). */
  function errorCode(err) {
    return String((err && err.code) || '').replace(/^functions\//, '');
  }

  /** Сообщение ошибки сервера. */
  function errorMessage(err) {
    return (err && err.message) || '';
  }

  // Платёжная форма PayPal загружается только когда человек открывает оплату:
  // без этого скрипт PayPal (и его cookie) подгружался бы каждому посетителю.
  // Client ID публичный, секрет хранится только на сервере.
  const PAYPAL_SDK = 'https://www.paypal.com/sdk/js?client-id=AaLW-O9Lrf97E4ok5qaUwz9ml1bJAqPNTjAufRMMmEfrC53NSXdzGSherMK3WaXbbXzU8omY7IKnMym_&currency=USD';
  let paypalPromise = null;
  function loadPayPal() {
    if (global.paypal && typeof global.paypal.Buttons === 'function') return Promise.resolve(global.paypal);
    if (!paypalPromise) {
      paypalPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PAYPAL_SDK;
        s.async = true;
        s.onload = () => (global.paypal && typeof global.paypal.Buttons === 'function' ? resolve(global.paypal) : reject(new Error('paypal-not-ready')));
        s.onerror = () => reject(new Error('paypal-load-failed'));
        document.head.appendChild(s);
      }).catch((e) => { paypalPromise = null; throw e; });
    }
    return paypalPromise;
  }

  global.BlockoAPI = { call, errorCode, errorMessage, isBackendUnavailable, BACKEND_DOWN_MESSAGE, loadPayPal };
})(window);
