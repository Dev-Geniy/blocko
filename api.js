// ==========================================
// BLOCKO API — вызовы Cloud Functions
// Требует firebase-functions-compat.js и config.js (инициализация Firebase).
// ==========================================
(function (global) {
  'use strict';

  const REGION = 'us-central1';

  function fns() {
    return firebase.app().functions(REGION);
  }

  /** Вызов callable-функции. Возвращает data из ответа. */
  async function call(name, data) {
    const res = await fns().httpsCallable(name)(data || {});
    return res.data;
  }

  /** Код ошибки сервера без префикса "functions/" (например, 'permission-denied'). */
  function errorCode(err) {
    return String((err && err.code) || '').replace(/^functions\//, '');
  }

  /** Сообщение ошибки сервера (то, что передано в HttpsError). */
  function errorMessage(err) {
    return (err && err.message) || '';
  }

  global.BlockoAPI = { call, errorCode, errorMessage };
})(window);
