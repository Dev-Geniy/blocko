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

  /** Безопасный идентификатор (id карточек/колонок/досок) для data-атрибутов и путей. */
  function isSafeId(value) {
    return /^[A-Za-z0-9_.:-]{1,128}$/.test(String(value));
  }

  global.BlockoSec = { esc, jsArg, safeUrl, safeColor, sanitizeHTML, escRegExp, highlight, isSafeId, safeYoutubeEmbed };
  // Короткие глобальные алиасы для шаблонов
  global.esc = esc;
  global.jsArg = jsArg;
  global.safeUrl = safeUrl;
  global.safeColor = safeColor;
  global.sanitizeHTML = sanitizeHTML;
  global.safeYoutubeEmbed = safeYoutubeEmbed;
})(window);
