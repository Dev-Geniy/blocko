// ==========================================
// BLOCKO SECURITY HELPERS
// Подключается на всех страницах ДО любого кода, который рендерит
// пользовательские данные через innerHTML / шаблонные строки.
// ==========================================
(function (global) {
  'use strict';

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

  /**
   * Экранирует строку для безопасной вставки в HTML-текст и в атрибуты в кавычках.
   * null/undefined → пустая строка.
   */
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch]);
  }

  /**
   * Аргумент для inline-обработчика: onclick="fn(${jsArg(x)})".
   * JSON.stringify даёт корректный JS-литерал, esc() защищает HTML-атрибут.
   */
  function jsArg(value) {
    return esc(JSON.stringify(value === undefined ? null : value));
  }

  /**
   * Пропускает только http(s) URL (и, по запросу, data: для скачивания файлов/аудио).
   * Всё остальное (javascript:, vbscript: и т.п.) → пустая строка.
   */
  function safeUrl(value, opts) {
    if (!value) return '';
    const allowData = !!(opts && opts.allowData);
    const raw = String(value).trim();
    if (allowData && /^data:[a-z0-9.+-]+\/[a-z0-9.+-]+(;[a-z0-9=.+-]+)*(;base64)?,/i.test(raw)) {
      // data:text/html никогда не отдаём — только как скачивание через Blob
      if (/^data:text\/html/i.test(raw)) return '';
      return raw;
    }
    try {
      const url = new URL(raw, global.location.href);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (e) { /* invalid url */ }
    return '';
  }

  /** Безопасное значение CSS-цвета для inline style. */
  function safeColor(value, fallback) {
    const v = String(value || '').trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
    if (/^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\)$/i.test(v)) return v;
    if (/^(transparent|currentColor)$/i.test(v)) return v;
    if (/^linear-gradient\([#\w\s,.%()-]+\)$/i.test(v) && !/url\(/i.test(v)) return v;
    return fallback === undefined ? 'transparent' : fallback;
  }

  /** Санитизация HTML (например, результата marked.parse). Требует DOMPurify. */
  function sanitizeHTML(html) {
    if (global.DOMPurify && typeof global.DOMPurify.sanitize === 'function') {
      return global.DOMPurify.sanitize(String(html || ''), {
        ADD_ATTR: ['target', 'rel'],
        FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'select', 'button', 'iframe', 'object', 'embed'],
      });
    }
    // Без DOMPurify безопаснее показать текст, чем рискнуть исполнением
    return esc(html);
  }

  /** Экранирует спецсимволы регулярных выражений. */
  function escRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Подсветка совпадения поиска: сначала экранируем текст, потом оборачиваем совпадения в <mark>.
   * Возвращает безопасный HTML.
   */
  function highlight(text, query) {
    const safeText = esc(text);
    if (!query) return safeText;
    const safeQuery = esc(query);
    if (!safeQuery) return safeText;
    const re = new RegExp('(' + escRegExp(safeQuery) + ')', 'gi');
    return safeText.replace(re, '<mark class="bg-yellow-200 dark:bg-yellow-500/50 dark:text-black rounded-sm">$1</mark>');
  }

  /** Принимает только embed-ссылку YouTube вида https://www.youtube.com/embed/<11 символов>. */
  function safeYoutubeEmbed(value) {
    const m = String(value || '').match(/^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})$/);
    return m ? 'https://www.youtube-nocookie.com/embed/' + m[1] : '';
  }

  /**
   * Аватар с инициалами (SVG data-URI) — без внешних сервисов.
   * Цвет стабилен для одного и того же имени.
   */
  const AVATAR_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#10b981', '#06b6d4', '#64748b'];
  function initialsAvatar(name) {
    const clean = String(name || '').replace(/[<>&"'`]/g, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    const letters = ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    let hash = 0;
    for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
    const bg = AVATAR_COLORS[hash % AVATAR_COLORS.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/>` +
      `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="26" font-weight="600" fill="#fff">${letters}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // Битые картинки аватаров (пустой src, недоступный сервис) заменяем инициалами
  if (global.document) {
    global.document.addEventListener('error', function (e) {
      const img = e.target;
      if (!img || img.tagName !== 'IMG' || img.dataset.avatarFallback) return;
      const isAvatar = img.classList.contains('rounded-full') || img.dataset.avatar !== undefined;
      if (!isAvatar) return;
      img.dataset.avatarFallback = '1';
      img.src = initialsAvatar(img.getAttribute('title') || img.getAttribute('alt') || '');
    }, true);
  }

  /** Безопасный идентификатор (id карточек/колонок/досок) для data-атрибутов и путей. */
  function isSafeId(value) {
    return /^[A-Za-z0-9_.:-]{1,128}$/.test(String(value));
  }

  global.BlockoSec = { esc, jsArg, safeUrl, safeColor, sanitizeHTML, escRegExp, highlight, isSafeId, safeYoutubeEmbed, initialsAvatar };
  // Короткие глобальные алиасы для шаблонов
  global.esc = esc;
  global.jsArg = jsArg;
  global.safeUrl = safeUrl;
  global.safeColor = safeColor;
  global.sanitizeHTML = sanitizeHTML;
  global.safeYoutubeEmbed = safeYoutubeEmbed;
  global.initialsAvatar = initialsAvatar;
})(window);
