// ==========================================
// Правовые страницы (terms / privacy / cookies):
// тема, оглавление из заголовков, подсветка текущего раздела,
// ссылки на разделы, печать и переключатель аналитики на странице cookie.
// ==========================================
(function () {
  'use strict';

  try { if (localStorage.getItem('theme') === 'light') document.documentElement.classList.remove('dark'); } catch (e) {}

  window.toggleTheme = function () {
    document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); } catch (e) {}
  };

  function buildToc() {
    const article = document.querySelector('[data-legal-article]');
    if (!article) return;
    const heads = [...article.querySelectorAll('h2[id]')];

    // Оглавление (на ПК — сбоку, на телефоне — раскрывающийся список)
    const items = heads.map((h) => {
      const label = h.getAttribute('data-toc') || h.textContent.trim();
      return `<a href="#${h.id}" data-toc-link="${h.id}" class="block py-1.5 pl-3 -ml-px border-l-2 border-transparent text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">${label}</a>`;
    }).join('');
    document.querySelectorAll('[data-toc-list]').forEach((el) => { el.innerHTML = items; });

    // Значок-ссылка у заголовков: можно скопировать ссылку на раздел
    heads.forEach((h) => {
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.className = 'heading-anchor ml-2 text-gray-300 dark:text-gray-600 hover:text-blue-600 no-print';
      a.setAttribute('aria-label', 'Ссылка на раздел');
      a.textContent = '#';
      a.addEventListener('click', () => {
        try { navigator.clipboard.writeText(location.href.split('#')[0] + '#' + h.id); } catch (e) {}
      });
      h.appendChild(a);
    });

    // На телефоне список закрывается после выбора раздела
    const mobile = document.querySelector('[data-toc-mobile]');
    if (mobile) mobile.addEventListener('click', (e) => { if (e.target.closest('a')) mobile.open = false; });

    // Подсветка текущего раздела
    let current = null;
    function setCurrent(id) {
      if (id === current) return;
      current = id;
      document.querySelectorAll('[data-toc-link]').forEach((a) => a.setAttribute('aria-current', a.dataset.tocLink === id ? 'true' : 'false'));
    }
    let ticking = false;
    function update() {
      ticking = false;
      let id = heads.length ? heads[0].id : null;
      for (const h of heads) if (h.getBoundingClientRect().top - 120 <= 0) id = h.id;
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && heads.length) id = heads[heads.length - 1].id;
      setCurrent(id);
    }
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  // Переключатель аналитики (cookies.html)
  function initConsent() {
    const sw = document.getElementById('consentSwitch');
    if (!sw || !window.BlockoConsent) return;
    const status = document.getElementById('consentStatus');
    function render() {
      const c = window.BlockoConsent.get();
      const on = !!(c && c.analytics);
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      sw.classList.toggle('bg-blue-600', on);
      sw.classList.toggle('bg-gray-200', !on);
      sw.classList.toggle('dark:bg-gray-700', !on);
      sw.firstElementChild.style.transform = on ? 'translateX(20px)' : 'none';
      if (status) {
        const when = c ? new Date(c.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
        status.textContent = !c ? 'Вы ещё не выбирали — аналитика выключена.' : on ? `Включена — вы разрешили ${when}.` : `Выключена — ваш выбор от ${when}.`;
      }
    }
    sw.addEventListener('click', () => {
      const c = window.BlockoConsent.get();
      window.BlockoConsent.set(!(c && c.analytics));
      render();
    });
    window.addEventListener('blocko-consent', render);
    render();
  }

  function init() {
    buildToc();
    initConsent();
    document.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => window.print()));
    try { lucide.createIcons(); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
