// ==========================================
// Согласие на аналитику (Google Analytics)
//
// Без согласия скрипт Google не загружается и cookie аналитики не ставятся.
// Выбор хранится в браузере (localStorage: blocko_consent) и меняется
// на странице cookies.html. Баннер показывается только там, где подключён
// <script src="consent.js" data-banner="true"> (главная).
// ==========================================
(function (global) {
  'use strict';

  const KEY = 'blocko_consent';
  const GA_ID = 'G-WM851HTC0E';
  const script = document.currentScript;
  const wantsBanner = !!(script && script.dataset && script.dataset.banner === 'true');
  let gaLoaded = false;

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && typeof v.analytics === 'boolean' ? v : null;
    } catch (e) {
      return null;
    }
  }

  function write(analytics) {
    const v = { analytics: !!analytics, date: Date.now(), v: 1 };
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* приватный режим */ }
    return v;
  }

  function loadAnalytics() {
    if (gaLoaded) return;
    gaLoaded = true;
    global.dataLayer = global.dataLayer || [];
    global.gtag = global.gtag || function () { global.dataLayer.push(arguments); };
    global.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    global.gtag('js', new Date());
    global.gtag('config', GA_ID);
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  // Отзыв согласия: удаляем cookie Google Analytics (_ga, _ga_XXXX) со всех вариантов домена
  function clearAnalyticsCookies() {
    const host = global.location.hostname;
    const parts = host.split('.');
    const domains = [''];
    for (let i = 0; i < parts.length - 1; i++) domains.push('; domain=.' + parts.slice(i).join('.'));
    document.cookie.split(';')
      .map((c) => c.split('=')[0].trim())
      .filter((name) => /^_ga($|_)|^_gid$|^_gat/.test(name))
      .forEach((name) => domains.forEach((d) => { document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`; }));
  }

  function set(analytics) {
    const v = write(analytics);
    if (analytics) loadAnalytics();
    else {
      if (gaLoaded && global.gtag) global.gtag('consent', 'update', { analytics_storage: 'denied' });
      clearAnalyticsCookies();
    }
    hideBanner();
    try { global.dispatchEvent(new CustomEvent('blocko-consent', { detail: v })); } catch (e) {}
    return v;
  }

  // ---------- баннер ----------
  function hideBanner() {
    const b = document.getElementById('consentBanner');
    if (!b) return;
    b.style.opacity = '0';
    b.style.transform = 'translateY(8px)';
    setTimeout(() => b.remove(), 200);
  }

  function showBanner() {
    if (read() || document.getElementById('consentBanner')) return;
    const b = document.createElement('div');
    b.id = 'consentBanner';
    b.setAttribute('role', 'region');
    b.setAttribute('aria-label', 'Согласие на аналитику');
    b.className = 'fixed z-[90] left-3 right-3 bottom-3 sm:left-6 sm:right-auto sm:bottom-6 sm:max-w-sm rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg p-4';
    b.style.transition = 'opacity .2s ease, transform .2s ease';
    b.style.opacity = '0';
    b.style.transform = 'translateY(8px)';
    b.innerHTML =
      '<p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Можно мы будем считать посещения через Google Analytics? Так мы видим, какими разделами пользуются, и понимаем, что улучшать. Рекламы нет, данные не продаём.</p>' +
      '<div class="mt-3 flex items-center gap-2">' +
      '<button type="button" data-consent="yes" class="h-9 px-3.5 rounded-xl bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium transition-colors">Разрешить</button>' +
      '<button type="button" data-consent="no" class="h-9 px-3.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors">Не нужно</button>' +
      '<a href="cookies.html" class="ml-auto text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline-offset-2 hover:underline">Подробнее</a>' +
      '</div>';
    b.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-consent]');
      if (btn) set(btn.dataset.consent === 'yes');
    });
    document.body.appendChild(b);
    requestAnimationFrame(() => { b.style.opacity = '1'; b.style.transform = 'none'; });
  }

  global.BlockoConsent = { get: read, set, loadAnalytics, clearAnalyticsCookies, showBanner };

  // Согласие уже дано — включаем аналитику сразу
  const current = read();
  if (current && current.analytics) loadAnalytics();
  if (wantsBanner && !current) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(showBanner, 800));
    else setTimeout(showBanner, 800);
  }
})(window);
