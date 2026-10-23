// =====================================================================
// Blocko Pro — главная страница: «пульс задач» и личные сообщения.
//
// 1) Пульс задач — тонкая строка над приветствием: мои задачи (тег с моим
//    именем) и задачи с дедлайном меньше суток во всех моих проектах.
// 2) Сообщения — контакты из участников моих облачных проектов и личные
//    диалоги (Firestore: dms/{uidA_uidB} + messages). Непрочитанное на кнопке
//    в шапке и в заголовке вкладки, всплывашка, звук, системное уведомление.
//
// Зависит от index.html: db, firebase, currentUser, onlineBoards, getLocalBoards,
// esc, safeUrl, initialsAvatar, showSystemToast, lucide, IMGBB_KEY.
// =====================================================================
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const me = () => (typeof currentUser !== 'undefined' && currentUser ? currentUser : null);
  const myId = () => (me() ? me().id : null);
  const FV = () => firebase.firestore.FieldValue;
  const icon = (n, c = '') => `<i data-lucide="${n}" class="${c}"></i>`;
  const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } };
  const avatarUrl = (u) => safeUrl((u || {}).customAvatar) || safeUrl((u || {}).avatar) || initialsAvatar((u || {}).name || 'U');
  const av = (u, cls) => `<img src="${esc(avatarUrl(u))}" referrerpolicy="no-referrer" alt="" class="${cls} rounded-full object-cover bg-gray-100 dark:bg-gray-800 flex-shrink-0">`;
  const icons = (root) => { if (typeof lucide !== 'undefined') lucide.createIcons({ root }); };
  const pageVisible = () => document.visibilityState === 'visible';
  const DAY = 864e5;

  // =================================================================
  // 1. ПУЛЬС ЗАДАЧ
  // =================================================================
  const PULSE_TTL = 3 * 60 * 1000;
  const DONE_COL = /готов|done|выполн|закрыт|complete|archive/i;
  let pulseTimer = null;
  let pulseLoading = false;

  function dueTime(due) {
    if (!due) return null;
    const s = String(due);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59).getTime(); }
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }
  function dueLabel(t) {
    const diff = t - Date.now();
    if (diff < 0) {
      const days = Math.floor(-diff / DAY);
      return { text: days >= 1 ? `просрочено ${days} д` : 'просрочено', tone: 'red' };
    }
    const h = Math.floor(diff / 36e5);
    if (h < 1) return { text: `${Math.max(1, Math.round(diff / 6e4))} мин`, tone: 'red' };
    if (h < 24) return { text: `${h} ч`, tone: 'amber' };
    const d = Math.round(diff / DAY);
    return { text: `${d} д`, tone: 'gray' };
  }

  function isMine(card, board) {
    const uid = myId();
    const myName = (me() && me().name) || '';
    return (card.tags || []).some((tId) => {
      if (tId === `tag_user_${uid}`) return true;
      const tag = (board.tags || []).find((t) => t.id === tId);
      return !!(tag && myName && tag.name === myName);
    });
  }

  async function collectCards(boards) {
    const out = [];
    const push = (board, boardId, card, col, isLocal) => {
      if (!card || card.archived) return;
      out.push({
        id: String(card.id), title: String(card.title || 'Без названия'), boardId, isLocal,
        boardTitle: board.title || 'Проект', colName: (col && col.name) || '', done: !!(col && DONE_COL.test(col.name || '')),
        due: dueTime(card.dueDate), mine: isMine(card, board),
      });
    };
    await Promise.all(boards.map(async (board) => {
      try {
        const snap = await db.collection('boards').doc(board.id).collection('cards').where('archived', '==', false).get();
        const cols = new Map((board.columns || []).map((c) => [String(c.id), c]));
        snap.docs.forEach((d) => { const c = { id: d.id, ...d.data() }; push(board, board.id, c, cols.get(String(c.columnId)), false); });
      } catch (e) { /* доска с паролем без недавнего ввода — пропускаем */ }
    }));
    try {
      const local = (typeof getLocalBoards === 'function' ? getLocalBoards() : {}) || {};
      Object.values(local).forEach((board) => {
        if (!board || (board.members && !board.members.includes(myId()))) return;
        (board.columns || []).forEach((col) => (col.cards || []).forEach((c) => push(board, board.id, c, col, true)));
      });
    } catch (e) { /* повреждённые локальные данные */ }
    return out;
  }

  async function loadPulse(force) {
    if (!myId() || pulseLoading) return;
    const boards = (typeof onlineBoards !== 'undefined' ? onlineBoards : []) || [];
    const key = `blocko_pulse_${myId()}`;
    const boardsKey = boards.map((b) => b.id).sort().join(',');
    if (!force) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (cached && cached.boardsKey === boardsKey && Date.now() - cached.ts < PULSE_TTL) { renderPulse(cached.cards); return; }
      } catch (e) { /* нет кэша */ }
    }
    pulseLoading = true;
    try {
      const cards = await collectCards(boards);
      try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), boardsKey, cards })); } catch (e) { /* переполнено */ }
      renderPulse(cards);
    } finally { pulseLoading = false; }
  }

  function chip(c) {
    const href = c.isLocal ? `board.html?b=${encodeURIComponent(c.boardId)}` : `board.html?b=${encodeURIComponent(c.boardId)}&c=${encodeURIComponent(c.id)}`;
    const lab = c.due ? dueLabel(c.due) : null;
    const dot = !lab ? 'bg-gray-300 dark:bg-gray-600' : lab.tone === 'red' ? 'bg-red-500' : lab.tone === 'amber' ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600';
    const title = `${c.title} · ${c.boardTitle}${c.colName ? ` / ${c.colName}` : ''}${lab ? ` · срок: ${lab.text}` : ''}`;
    return `<a href="${esc(href)}" title="${esc(title)}" class="flex-shrink-0 inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 text-gray-700 dark:text-gray-200 transition-colors max-w-[240px]">
      <span class="w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}"></span>
      <span class="truncate">${esc(c.title)}</span>
      ${lab ? `<span class="flex-shrink-0 ${lab.tone === 'red' ? 'text-red-600 dark:text-red-400' : lab.tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}">${esc(lab.text)}</span>` : ''}
    </a>`;
  }

  function renderPulse(cards) {
    const box = $('taskPulse');
    if (!box) return;
    const now = Date.now();
    const open = cards.filter((c) => !c.done);
    const byDue = (a, b) => (a.due || Infinity) - (b.due || Infinity);
    const mine = open.filter((c) => c.mine).sort(byDue);
    // Срочные — без повторов: мои задачи уже видны в первой группе со своим сроком
    const hot = open.filter((c) => c.due && c.due - now < DAY && !c.mine).sort(byDue);
    if (!mine.length && !hot.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    const label = (ic, text, n, tone) => `<span class="flex-shrink-0 inline-flex items-center gap-1.5 h-7 pr-1 text-gray-500 dark:text-gray-400"><span class="${tone}">${icon(ic, 'w-3.5 h-3.5')}</span>${text}<span class="font-semibold text-gray-900 dark:text-white tabular-nums">${n}</span></span>`;
    const parts = [];
    if (mine.length) parts.push(label('user-round', 'Мои', mine.length, 'text-blue-600 dark:text-blue-400') + mine.slice(0, 6).map(chip).join(''));
    if (hot.length) parts.push(label('alarm-clock', 'Срок < 24 ч', hot.length, 'text-red-500') + hot.slice(0, 6).map(chip).join(''));
    box.innerHTML = `${parts.join('<span class="flex-shrink-0 w-px h-4 bg-gray-200 dark:bg-gray-800 mx-1.5"></span>')}
      <a href="my-tasks.html" class="flex-shrink-0 inline-flex items-center gap-1 h-7 px-2 text-gray-500 hover:text-gray-900 dark:hover:text-white">Все ${icon('arrow-right', 'w-3.5 h-3.5')}</a>`;
    box.classList.remove('hidden');
    icons(box);
  }

  // =================================================================
  // 2. СООБЩЕНИЯ
  // =================================================================
  const D = {
    threads: new Map(),       // id → data
    contacts: new Map(),      // uid → { uid, name, avatar, customAvatar, boards:Set }
    unsubThreads: null,
    unsubMsgs: null,
    active: null,             // { id, other }
    messages: [],
    failed: new Map(),
    lastAt: new Map(),        // id → lastMessage.at (для новых сообщений)
    threadsReady: false,
    search: '',
    lastReadWrite: 0,
    openOnLoad: new URLSearchParams(location.search).get('dm'),
    baseTitle: null,
  };
  const threadIdWith = (other) => [myId(), other].sort().join('_');
  const otherOf = (t, id) => ((t && t.members) || String(id).split('_')).find((u) => u !== myId());
  const pub = (u) => ({ name: (u && u.name) || 'Участник', avatar: (u && u.avatar) || null, customAvatar: (u && u.customAvatar) || null });
  const panelOpen = () => { const p = $('dmPanel'); return !!p && !p.classList.contains('translate-x-full'); };

  function rebuildContacts() {
    const map = new Map();
    const add = (uid, u, boardTitle) => {
      if (!uid || uid === myId() || !u) return;
      const c = map.get(uid) || { uid, name: u.name || 'Участник', avatar: u.avatar || null, customAvatar: u.customAvatar || null, boards: new Set() };
      if (u.name) c.name = u.name;
      if (u.customAvatar) c.customAvatar = u.customAvatar;
      if (u.avatar) c.avatar = u.avatar;
      if (boardTitle) c.boards.add(boardTitle);
      map.set(uid, c);
    };
    ((typeof onlineBoards !== 'undefined' ? onlineBoards : []) || []).forEach((b) => Object.entries(b.users || {}).forEach(([uid, u]) => add(uid, u, b.title || 'Проект')));
    D.threads.forEach((t, id) => { const o = otherOf(t, id); add(o, (t.users || {})[o], null); });
    D.contacts = map;
  }

  function totalUnread() {
    let n = 0;
    D.threads.forEach((t) => { n += Number(((t.unread || {})[myId()]) || 0); });
    return n;
  }
  function updateDmBadge() {
    const n = totalUnread();
    const b = $('dmBadge');
    if (b) { b.textContent = n > 99 ? '99+' : String(n); b.classList.toggle('hidden', !n); }
    if (D.baseTitle === null) D.baseTitle = document.title.replace(/^\(\d+\+?\)\s/, '');
    const next = n ? `(${n > 99 ? '99+' : n}) ${D.baseTitle}` : D.baseTitle;
    if (document.title !== next) document.title = next;
  }

  // ---------- звук и уведомления ----------
  let audioCtx = null;
  const unlockAudio = () => { if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; } } };
  function playSound() {
    if (lsGet('blocko_chat_sound', '1') !== '1' || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      [[880, 0], [1320, 0.09]].forEach(([f, dl]) => {
        const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
        o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + dl);
        g.gain.exponentialRampToValueAtTime(0.12, t + dl + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dl + 0.18);
        o.connect(g).connect(audioCtx.destination); o.start(t + dl); o.stop(t + dl + 0.2);
      });
    } catch (e) { /* звук не обязателен */ }
  }
  async function systemNotify(id, t) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || lsGet('blocko_chat_notify', '1') !== '1') return;
    const o = otherOf(t, id);
    const u = (t.users || {})[o] || {};
    const opts = { body: String((t.lastMessage || {}).text || 'Новое сообщение'), tag: `dm-${id}`, renotify: true, icon: safeUrl(u.customAvatar) || safeUrl(u.avatar) || undefined, data: { url: `index.html?dm=${encodeURIComponent(id)}`, type: 'dm', threadId: id } };
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg && reg.showNotification) { await reg.showNotification(u.name || 'Сообщение', opts); return; }
    } catch (e) { /* ниже — запасной вариант */ }
    try { const n = new Notification(u.name || 'Сообщение', opts); n.onclick = () => { window.focus(); openThread(id); n.close(); }; } catch (e) { /* не поддерживается */ }
  }

  // ---------- подписка на диалоги ----------
  function subscribeThreads() {
    if (D.unsubThreads || !myId()) return;
    D.unsubThreads = db.collection('dms').where('members', 'array-contains', myId()).limit(200).onSnapshot((snap) => {
      const fresh = [];
      D.threads = new Map(snap.docs.map((d) => [d.id, d.data({ serverTimestamps: 'estimate' })]));
      D.threads.forEach((t, id) => {
        const lm = t.lastMessage || {};
        const prev = D.lastAt.get(id);
        if (D.threadsReady && lm.at && lm.from && lm.from !== myId() && (!prev || lm.at > prev)) fresh.push([id, t]);
        if (lm.at) D.lastAt.set(id, lm.at);
      });
      D.threadsReady = true;
      rebuildContacts();
      updateDmBadge();
      if (panelOpen() && !D.active) renderList();
      if (D.active) renderThreadHeader();
      fresh.forEach(([id, t]) => {
        const viewing = D.active && D.active.id === id && panelOpen() && pageVisible();
        if (viewing) return;
        playSound();
        const u = (t.users || {})[otherOf(t, id)] || {};
        if (pageVisible()) showSystemToast(`💬 ${u.name || 'Сообщение'}`, String((t.lastMessage || {}).text || '').slice(0, 80), 'message-circle', 'text-blue-500', 'bg-blue-50 dark:bg-blue-900/30');
        else systemNotify(id, t);
      });
      if (D.openOnLoad && D.threads.size) { const id = D.openOnLoad; D.openOnLoad = null; if (D.threads.has(id)) openThread(id); }
    }, (err) => {
      console.warn('dms listener', err && err.code);
      D.threadsReady = true;
      if (panelOpen() && !D.active) renderList(err && err.code === 'permission-denied' ? 'rules' : null);
    });
  }

  // ---------- панель ----------
  function ensurePanel() {
    if ($('dmPanel')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="dmBackdrop" class="hidden fixed inset-0 z-[69] bg-black/20 dark:bg-black/40 sm:bg-transparent sm:dark:bg-transparent"></div>
      <aside id="dmPanel" class="fixed top-0 right-0 bottom-0 z-[70] w-full sm:w-[400px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col translate-x-full transition-transform duration-300" aria-label="Сообщения">
        <div id="dmHeader" class="h-14 px-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2 flex-shrink-0"></div>
        <div id="dmBody" class="flex-1 min-h-0 flex flex-col"></div>
      </aside>`;
    document.body.appendChild(wrap);
    $('dmBackdrop').addEventListener('click', closeMessages);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panelOpen()) { if (D.active) backToList(); else closeMessages(); } });
  }

  function openMessages() {
    unlockAudio();
    if (!myId()) return;
    ensurePanel();
    subscribeThreads();
    rebuildContacts();
    $('dmBackdrop').classList.remove('hidden');
    requestAnimationFrame(() => $('dmPanel').classList.remove('translate-x-full'));
    if (D.active) renderThread(); else renderList();
  }
  function closeMessages() {
    const p = $('dmPanel');
    if (!p) return;
    p.classList.add('translate-x-full');
    $('dmBackdrop').classList.add('hidden');
    stopThread();
    D.active = null;
  }

  function headerHtml(left, title, sub) {
    return `${left}<div class="flex-1 min-w-0"><div class="text-sm font-semibold text-gray-900 dark:text-white truncate leading-tight">${title}</div>${sub ? `<div class="text-[11px] text-gray-500 dark:text-gray-400 truncate leading-tight mt-0.5">${sub}</div>` : ''}</div>
      <button type="button" data-dm="close" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white" title="Закрыть" aria-label="Закрыть">${icon('x', 'w-4 h-4')}</button>`;
  }
  function bindHeader() {
    const h = $('dmHeader');
    h.onclick = (e) => {
      const b = e.target.closest('[data-dm]');
      if (!b) return;
      if (b.dataset.dm === 'close') closeMessages();
      if (b.dataset.dm === 'back') backToList();
    };
  }

  function timeShort(ms) {
    if (!ms) return '';
    const d = new Date(ms); const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const y = new Date(); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  // ---------- список: диалоги + контакты ----------
  function renderList(errKind) {
    ensurePanel();
    const h = $('dmHeader');
    h.innerHTML = headerHtml(`<div class="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">${icon('message-circle', 'w-4 h-4')}</div>`, 'Сообщения', 'Личные диалоги с участниками ваших проектов');
    bindHeader();
    const body = $('dmBody');
    const q = D.search.trim().toLowerCase();
    const threads = [...D.threads.entries()]
      .filter(([, t]) => t.lastMessage)
      .sort((a, b) => ((b[1].lastMessage || {}).at || 0) - ((a[1].lastMessage || {}).at || 0));
    const inThreads = new Set(threads.map(([id, t]) => otherOf(t, id)));
    const contacts = [...D.contacts.values()].filter((c) => !inThreads.has(c.uid)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const match = (name) => !q || String(name || '').toLowerCase().includes(q);

    const threadRow = ([id, t]) => {
      const o = otherOf(t, id);
      const c = D.contacts.get(o) || {};
      const u = { ...((t.users || {})[o] || {}), ...c };
      if (!match(u.name)) return '';
      const lm = t.lastMessage || {};
      const unread = Number(((t.unread || {})[myId()]) || 0);
      return `<button type="button" data-thread="${esc(id)}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
        ${av(u, 'w-10 h-10')}
        <span class="flex-1 min-w-0">
          <span class="flex items-baseline gap-2"><span class="flex-1 truncate text-sm ${unread ? 'font-semibold' : 'font-medium'} text-gray-900 dark:text-white">${esc(u.name || 'Участник')}</span><span class="text-[11px] text-gray-400 flex-shrink-0">${esc(timeShort(lm.at))}</span></span>
          <span class="flex items-center gap-2 mt-0.5"><span class="flex-1 truncate text-[13px] ${unread ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}">${lm.from === myId() ? '<span class="text-gray-400">Вы: </span>' : ''}${esc(lm.text || '')}</span>${unread ? `<span class="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">${unread > 99 ? '99+' : unread}</span>` : ''}</span>
        </span>
      </button>`;
    };
    const contactRow = (c) => (!match(c.name) ? '' : `<button type="button" data-contact="${esc(c.uid)}" class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
        ${av(c, 'w-9 h-9')}
        <span class="flex-1 min-w-0"><span class="block truncate text-sm font-medium text-gray-900 dark:text-white">${esc(c.name)}</span><span class="block truncate text-[12px] text-gray-500 dark:text-gray-400">${c.boards.size ? esc([...c.boards].slice(0, 3).join(', ')) : 'Личный диалог'}</span></span>
        <span class="text-gray-300 dark:text-gray-600">${icon('message-square-plus', 'w-4 h-4')}</span>
      </button>`);

    const tRows = threads.map(threadRow).join('');
    const cRows = contacts.map(contactRow).join('');
    let content = '';
    if (errKind === 'rules') {
      content = `<div class="m-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-200">Личные сообщения заработают после обновления правил базы (Firebase → Firestore → Rules → Publish).</div>`;
    } else if (!tRows && !cRows) {
      content = `<div class="flex-1 flex flex-col items-center justify-center text-center px-8 py-16 text-gray-400">
        <div class="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-900 flex items-center justify-center mb-3">${icon('users', 'w-6 h-6')}</div>
        <p class="text-sm font-medium text-gray-700 dark:text-gray-200">${q ? 'Никого не нашли' : 'Пока нет контактов'}</p>
        <p class="text-xs mt-1 leading-relaxed">${q ? 'Попробуйте другое имя.' : 'Здесь появятся все участники ваших облачных проектов. Пригласите коллег в проект — и пишите им напрямую.'}</p></div>`;
    } else {
      content = `${tRows ? `<div class="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Диалоги</div><div class="px-1.5">${tRows}</div>` : ''}
        ${cRows ? `<div class="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Контакты · ${contacts.length}</div><div class="px-1.5 pb-4">${cRows}</div>` : ''}`;
    }
    body.innerHTML = `<div class="px-3 pt-3 flex-shrink-0">
        <label class="flex items-center h-9 px-3 rounded-xl bg-gray-100 dark:bg-gray-900 border border-transparent focus-within:border-blue-500 focus-within:bg-white dark:focus-within:bg-gray-900 transition-colors">
          ${icon('search', 'w-4 h-4 text-gray-400 mr-2')}
          <input id="dmSearch" value="${esc(D.search)}" placeholder="Найти человека" autocomplete="off" class="bg-transparent outline-none text-sm w-full text-gray-900 dark:text-white placeholder-gray-400">
        </label>
      </div>
      <div id="dmList" class="flex-1 min-h-0 overflow-y-auto pt-1">${content}</div>`;
    icons(body); icons(h);
    const search = $('dmSearch');
    search.addEventListener('input', () => {
      D.search = search.value;
      const pos = search.selectionStart;
      renderList();
      const s2 = $('dmSearch'); s2.focus({ preventScroll: true }); s2.setSelectionRange(pos, pos);
    });
    $('dmList').addEventListener('click', (e) => {
      const t = e.target.closest('[data-thread]');
      if (t) return openThread(t.dataset.thread);
      const c = e.target.closest('[data-contact]');
      if (c) openThread(threadIdWith(c.dataset.contact));
    });
  }

  // ---------- диалог ----------
  function stopThread() { if (D.unsubMsgs) { D.unsubMsgs(); D.unsubMsgs = null; } D.messages = []; D.failed.clear(); }
  function backToList() { stopThread(); D.active = null; renderList(); }

  function openThread(id) {
    if (!myId() || !String(id).split('_').includes(myId())) return;
    ensurePanel();
    if (!panelOpen()) { $('dmBackdrop').classList.remove('hidden'); requestAnimationFrame(() => $('dmPanel').classList.remove('translate-x-full')); subscribeThreads(); rebuildContacts(); }
    stopThread();
    D.active = { id, other: otherOf(D.threads.get(id), id) };
    renderThread();
    D.unsubMsgs = db.collection('dms').doc(id).collection('messages').orderBy('timestamp').limitToLast(150)
      .onSnapshot({ includeMetadataChanges: true }, (snap) => {
        D.messages = snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' });
          const t = data.timestamp;
          return { id: d.id, data, ts: t && t.toMillis ? t.toMillis() : (data.clientTs || Date.now()), pending: d.metadata.hasPendingWrites };
        });
        D.messages.forEach((m) => D.failed.delete(m.id));
        renderMessages();
        markThreadRead();
      }, (err) => {
        console.warn('dm messages', err && err.code);
        const box = $('dmMessages');
        if (box) box.innerHTML = `<div class="m-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-800 dark:text-amber-200">${err && err.code === 'permission-denied' ? 'Личные сообщения заработают после обновления правил базы.' : 'Не удалось загрузить сообщения.'}</div>`;
      });
  }

  function contactOf(uid) {
    const t = D.active && D.threads.get(D.active.id);
    return { uid, ...(((t && t.users) || {})[uid] || {}), ...(D.contacts.get(uid) || {}) };
  }

  function renderThreadHeader() {
    if (!D.active) return;
    const c = contactOf(D.active.other);
    const boards = c.boards && c.boards.size ? `Общие проекты: ${[...c.boards].slice(0, 3).join(', ')}` : 'Личный диалог';
    $('dmHeader').innerHTML = headerHtml(`<button type="button" data-dm="back" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white flex-shrink-0" title="Назад" aria-label="Назад">${icon('arrow-left', 'w-4 h-4')}</button>${av(c, 'w-8 h-8')}`, esc(c.name || 'Участник'), esc(boards));
    bindHeader();
    icons($('dmHeader'));
    renderMessages(true);
  }

  function renderThread() {
    renderThreadHeader();
    const body = $('dmBody');
    body.innerHTML = `<div id="dmMessages" class="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col"></div>
      <div class="border-t border-gray-200 dark:border-gray-800 p-3 flex-shrink-0" style="padding-bottom:max(.75rem, env(safe-area-inset-bottom))">
        <div class="flex items-end gap-1.5">
          <label class="cursor-pointer w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0" title="Фото">${icon('image', 'w-5 h-5')}<input id="dmFile" type="file" accept="image/*" class="hidden"></label>
          <div class="flex-1 min-w-0 flex items-end bg-gray-100 dark:bg-gray-900 rounded-2xl border border-transparent focus-within:border-blue-500 transition-colors">
            <textarea id="dmInput" rows="1" maxlength="5000" placeholder="Сообщение…" class="flex-1 min-w-0 bg-transparent px-3.5 py-2.5 outline-none resize-none text-[16px] sm:text-sm leading-5 max-h-[140px] text-gray-900 dark:text-white placeholder-gray-400"></textarea>
          </div>
          <button id="dmSend" type="button" class="w-10 h-10 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex-shrink-0 active:scale-95" title="Отправить" aria-label="Отправить">${icon('send-horizontal', 'w-5 h-5')}</button>
        </div>
      </div>`;
    icons(body);
    const input = $('dmInput');
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const autosize = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; };
    input.addEventListener('input', autosize);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !coarse) { e.preventDefault(); send(); } });
    input.addEventListener('paste', (e) => { const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0]; if (f && f.type.startsWith('image/')) { e.preventDefault(); sendImage(f); } });
    $('dmSend').addEventListener('click', send);
    $('dmFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) sendImage(f); });
    $('dmMessages').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) { db.collection('dms').doc(D.active.id).collection('messages').doc(del.dataset.del).delete().catch(() => showSystemToast('Ошибка', 'Не удалось удалить сообщение.', 'alert-circle', 'text-red-500', 'bg-red-50')); return; }
      const retry = e.target.closest('[data-retry]');
      if (retry) { const p = D.failed.get(retry.dataset.retry); if (p) { D.failed.delete(retry.dataset.retry); write(retry.dataset.retry, p); } return; }
      const img = e.target.closest('img[data-full]');
      if (img) window.open(img.dataset.full, '_blank', 'noopener');
    });
    renderMessages(true);
    setTimeout(() => { if (window.matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true }); }, 320);
  }

  function linkify(text) {
    return String(text || '').split(/(https?:\/\/[^\s<>"'`]+)/g).map((part, i) => {
      if (i % 2 === 0) return esc(part);
      const m = part.match(/[.,!?;:)\]]+$/); const tail = m ? m[0] : ''; const url = tail ? part.slice(0, -tail.length) : part;
      const safe = safeUrl(url);
      return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${esc(url)}</a>${esc(tail)}` : esc(part);
    }).join('');
  }
  const isBigEmoji = (t) => { const s = String(t || '').trim(); return !!s && s.length <= 24 && /^[\p{Extended_Pictographic}\p{Emoji_Component}‍️\s]+$/u.test(s) && (s.match(/\p{Extended_Pictographic}/gu) || []).length <= 3; };

  function renderMessages(toBottom) {
    const box = $('dmMessages');
    if (!box || !D.active) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    const t = D.threads.get(D.active.id) || {};
    const otherRead = Number(((t.readAt || {})[D.active.other]) || 0);
    const list = [...D.messages];
    D.failed.forEach((p, id) => list.push({ id, data: p, ts: p.clientTs, failed: true }));
    if (!list.length) {
      const c = contactOf(D.active.other);
      box.innerHTML = `<div class="m-auto text-center px-8 text-gray-400">${av(c, 'w-14 h-14 mx-auto mb-3')}<p class="text-sm font-medium text-gray-700 dark:text-gray-200">${esc(c.name || 'Участник')}</p><p class="text-xs mt-1">Напишите первое сообщение — оно придёт лично.</p></div>`;
      return;
    }
    let prev = null;
    let html = '';
    list.forEach((m) => {
      const d = m.data || {};
      const mine = d.user && d.user.id === myId();
      const day = new Date(m.ts).toDateString();
      if (!prev || new Date(prev.ts).toDateString() !== day) {
        const now = new Date(); const y = new Date(); y.setDate(now.getDate() - 1);
        const label = day === now.toDateString() ? 'Сегодня' : day === y.toDateString() ? 'Вчера' : new Date(m.ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        html += `<div class="flex justify-center my-3"><span class="text-[11px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-900 px-2.5 py-0.5 rounded-full">${label}</span></div>`;
      }
      const grouped = prev && prev.data && prev.data.user && d.user && prev.data.user.id === d.user.id && m.ts - prev.ts < 5 * 60e3;
      const status = !mine ? '' : m.failed ? icon('alert-circle', 'w-3.5 h-3.5') : m.pending ? icon('clock', 'w-3.5 h-3.5') : (m.ts <= otherRead ? icon('check-check', 'w-3.5 h-3.5') : icon('check', 'w-3.5 h-3.5'));
      const time = new Date(m.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const big = !d.attachment && isBigEmoji(d.text);
      let content = '';
      if (d.attachment && d.attachment.type === 'image') {
        const url = m.preview || safeUrl(d.attachment.url);
        if (url) content += `<img src="${esc(url)}" ${m.uploading ? '' : `data-full="${esc(url)}"`} alt="" loading="lazy" class="block max-w-[240px] max-h-[300px] rounded-xl ${m.uploading ? 'opacity-60' : 'cursor-zoom-in'} mb-1">`;
      }
      if (d.text) content += big ? `<span class="text-4xl leading-tight">${esc(String(d.text).trim())}</span>` : `<span class="whitespace-pre-wrap break-words">${linkify(d.text)}</span>`;
      const bubble = big || (d.attachment && !d.text) ? 'px-0 py-0' : `px-3 py-1.5 rounded-2xl ${mine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-bl-md'}`;
      html += `<div class="group flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-2.5'}">
        <div class="relative max-w-[82%] flex flex-col ${mine ? 'items-end' : 'items-start'}">
          <div class="${bubble} text-[14px] leading-snug">${content}
            <span class="inline-flex items-center gap-0.5 float-right ml-2 mt-1.5 -mb-0.5 text-[10.5px] ${mine && !big && !(d.attachment && !d.text) ? 'text-white/70' : 'text-gray-400'}">${time}${status}</span>
          </div>
          ${m.failed ? `<button data-retry="${esc(m.id)}" class="mt-1 text-[11.5px] font-semibold text-red-600 underline">Не отправлено · Повторить</button>` : ''}
          ${mine && !m.pending && !m.failed && !m.uploading ? `<button data-del="${esc(m.id)}" class="absolute top-1/2 -translate-y-1/2 -left-8 w-7 h-7 hidden group-hover:flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Удалить" aria-label="Удалить">${icon('trash-2', 'w-3.5 h-3.5')}</button>` : ''}
        </div>
      </div>`;
      prev = m;
    });
    box.innerHTML = html;
    icons(box);
    if (toBottom || near) box.scrollTop = box.scrollHeight;
  }

  function markThreadRead() {
    if (!D.active || !panelOpen() || !pageVisible()) return;
    const t = D.threads.get(D.active.id);
    if (!t) return;
    const unread = Number(((t.unread || {})[myId()]) || 0);
    const latest = D.messages.reduce((mx, m) => (m.data.user && m.data.user.id !== myId() && m.ts > mx ? m.ts : mx), 0);
    const myRead = Number(((t.readAt || {})[myId()]) || 0);
    if (!unread && latest <= myRead) return;
    if (Date.now() - D.lastReadWrite < 3000 && !unread) return;
    D.lastReadWrite = Date.now();
    db.collection('dms').doc(D.active.id).set({ unread: { [myId()]: 0 }, readAt: { [myId()]: Date.now() } }, { merge: true }).catch(() => {});
  }

  function write(id, payload) {
    const tid = D.active.id;
    const other = D.active.other;
    const members = [myId(), other].sort();
    const c = contactOf(other);
    const tRef = db.collection('dms').doc(tid);
    const preview = payload.text ? String(payload.text).replace(/\s+/g, ' ').slice(0, 140) : '🖼 Фото';
    const batch = db.batch();
    batch.set(tRef, {
      members,
      users: { [myId()]: pub(me()), [other]: pub(c) },
      lastMessage: { text: preview, from: myId(), at: Date.now() },
      updatedAt: FV().serverTimestamp(),
      unread: { [other]: FV().increment(1), [myId()]: 0 },
      readAt: { [myId()]: Date.now() },
    }, { merge: true });
    batch.set(tRef.collection('messages').doc(id), { ...payload, timestamp: FV().serverTimestamp() });
    batch.commit().catch((err) => {
      console.error('dm send', err);
      D.failed.set(id, payload);
      renderMessages(true);
      showSystemToast('Не отправлено', err && err.code === 'permission-denied' ? 'Нужно обновить правила базы в Firebase.' : 'Проверьте интернет и нажмите «Повторить».', 'alert-circle', 'text-red-500', 'bg-red-50');
    });
  }
  const payloadBase = () => ({ text: '', user: { id: myId(), ...pub(me()) }, clientTs: Date.now() });

  function send() {
    const input = $('dmInput');
    if (!input || !D.active) return;
    const text = input.value.replace(/\s+$/g, '');
    if (!text.trim()) return;
    input.value = '';
    input.style.height = 'auto';
    write(db.collection('dms').doc().id, { ...payloadBase(), text });
    input.focus({ preventScroll: true });
  }

  async function sendImage(file) {
    if (!D.active) return;
    if (!navigator.onLine) return showSystemToast('Офлайн', 'Фото можно отправить только с интернетом.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
    if (file.size > 16 * 1024 * 1024) return showSystemToast('Слишком большой файл', 'Картинка больше 16 МБ.', 'alert-circle', 'text-red-500', 'bg-red-50');
    const id = db.collection('dms').doc().id;
    const preview = URL.createObjectURL(file);
    const temp = { id, data: { ...payloadBase(), attachment: { type: 'image' } }, ts: Date.now(), uploading: true, preview };
    D.messages.push(temp);
    renderMessages(true);
    try {
      const fd = new FormData(); fd.append('image', file);
      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data || !data.success) throw new Error('upload');
      D.messages = D.messages.filter((m) => m !== temp);
      write(id, { ...payloadBase(), attachment: { type: 'image', url: data.data.url, name: file.name } });
    } catch (e) {
      D.messages = D.messages.filter((m) => m !== temp);
      renderMessages();
      showSystemToast('Ошибка', 'Не удалось загрузить фото.', 'alert-circle', 'text-red-500', 'bg-red-50');
    } finally { setTimeout(() => URL.revokeObjectURL(preview), 30000); }
  }

  // =================================================================
  // Запуск
  // =================================================================
  function onBoards() {
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => loadPulse(false), 500);
    rebuildContacts();
    subscribeThreads();
    if (panelOpen() && !D.active) renderList();
  }

  document.addEventListener('visibilitychange', () => { if (pageVisible()) { markThreadRead(); loadPulse(false); } });
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAudio, { once: true, passive: true }));
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'blocko-open-dm' && e.data.threadId) openThread(e.data.threadId); });
  }
  setInterval(() => { if (pageVisible()) loadPulse(false); }, PULSE_TTL + 5000);

  window.BlockoHome = { onBoards, openMessages, closeMessages, openThread, refreshPulse: () => loadPulse(true), _state: D };
})();
