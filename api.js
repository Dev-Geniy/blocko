// ==========================================
// BLOCKO API — вызовы Cloud Functions
// Требует firebase-functions-compat.js и config.js (инициализация Firebase).
// ==========================================
(function (global) {
  'use strict';

  const REGION = 'us-central1';
  const BACKEND_DOWN_MESSAGE = 'Сервис временно недоступен: идёт обновление сервера. Попробуйте чуть позже.';

  function fns() {
    return firebase.app().functions(REGION);
  }

  /**
   * Функция не задеплоена / сервер не отвечает (а не осмысленная ошибка нашего кода).
   * Отсутствующая функция падает на CORS-preflight, и SDK отдаёт code=internal с текстом «internal».
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
   * Вызов callable-функции. Возвращает data из ответа.
   * fallback(data) — запасной путь на время, пока функции не задеплоены (только для некритичных к деньгам операций).
   */
  async function call(name, data, fallback) {
    try {
      const res = await fns().httpsCallable(name)(data || {});
      return res.data;
    } catch (err) {
      if (isBackendUnavailable(err)) {
        console.warn(`[BlockoAPI] функция ${name} недоступна`, err);
        if (typeof fallback === 'function') return fallback(data || {});
        const down = new Error(BACKEND_DOWN_MESSAGE);
        down.code = 'backend-unavailable';
        down.cause = err;
        throw down;
      }
      throw err;
    }
  }

  /** Код ошибки сервера без префикса "functions/" (например, 'permission-denied'). */
  function errorCode(err) {
    return String((err && err.code) || '').replace(/^functions\//, '');
  }

  /** Сообщение ошибки сервера (то, что передано в HttpsError). */
  function errorMessage(err) {
    return (err && err.message) || '';
  }

  global.BlockoAPI = { call, errorCode, errorMessage, isBackendUnavailable, BACKEND_DOWN_MESSAGE };
})(window);
