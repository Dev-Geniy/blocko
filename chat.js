// =====================================================================
// Blocko Pro — чат проекта (board.html)
//
// • Мгновенная отправка: сообщение появляется сразу (локальная запись Firestore),
//   статус: ⏱ отправляется → ✓ доставлено → ✓✓ прочитано; при ошибке — «Повторить».
// • Ответы (цитаты), реакции эмодзи, редактирование и удаление своих сообщений,
//   упоминания @имя, ссылки, большие эмодзи, группировка, разделители дней.
// • «Печатает…», кто в сети, счётчик непрочитанного (значок, заголовок вкладки),
//   всплывашки, звук и системные уведомления, когда вкладка свёрнута.
//
// Зависит от глобальных переменных и функций board.html:
//   db, firebase, currentUser, BOARD_ID, isLocalBoard, boardData, userPlan, IMGBB_KEY,
//   MAX_CHAT_FILE_BYTES, esc, safeUrl, jsArg, getAvatarHTML, showSystemToast,
//   openConfirmModal, SidebarManager, lucide.
// =====================================================================
(function () {
  'use strict';

  // ---------- настройки ----------
  const PAGE_SIZE = 50;
  const GROUP_WINDOW_MS = 5 * 60 * 1000;
  // Firestore на бесплатном тарифе: 20 000 записей в сутки. Поэтому «в сети» обновляем
  // раз в 2 минуты и только при открытой вкладке, а «печатает» — не чаще раза в 4 секунды.
  const HEARTBEAT_MS = 2 * 60 * 1000;
  const ONLINE_WINDOW_MS = 3.5 * 60 * 1000;
  const TYPING_WRITE_EVERY_MS = 4000;
  const TYPING_TTL_MS = 6500;
  const READ_WRITE_THROTTLE_MS = 10000;
  const MAX_TEXT = 5000;
  const REACTIONS = ['👍', '❤️', '😂', '🔥', '🎉', '😮', '😢', '✅'];
  const EMOJI_PANEL = ['😀', '😂', '😊', '😍', '🤔', '😎', '😅', '😢', '😡', '🙏', '👍', '👎', '👏', '🙌', '💪', '🤝', '👀', '🔥', '🎉', '✅', '❌', '⚡', '💡', '🚀', '📌', '📎', '⏰', '❤️', '💯', '⭐', '☕', '🍕'];
  const LEGACY_STICKERS = { 'thumbs-up': 'text-blue-500', heart: 'text-red-500', flame: 'text-amber-500', 'party-popper': 'text-blue-500', zap: 'text-amber-500', 'check-circle-2': 'text-green-500' };
  const LS = {
    read: () => `blocko_chat_read_${BOARD_ID}`,
    sound: 'blocko_chat_sound',
    notify: 'blocko_chat_notify',
    banner: 'blocko_chat_notify_banner_closed',
  };
  const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } };

  // ---------- состояние ----------
  const S = {
    started: false,
    chatCol: null,
    presenceCol: null,
    unsubMessages: null,
    unsubPresence: null,
    limit: PAGE_SIZE,
    messages: [],          // [{ id, data, ts, pending }]
    byId: new Map(),
    seen: new Set(),
    failed: new Map(),     // id → payload (не ушло на сервер)
    uploads: new Map(),    // id → { kind, name, preview }
    presence: new Map(),   // uid → { lastActive, typingUntil, lastReadAt }
    rendered: new Map(),   // key → html
    firstLoad: true,
    hasMore: false,
    lastReadTs: 0,
    notifyFloor: Date.now() - 15000,
    replyTo: null,
    editingId: null,
    activeRowId: null,
    pickerFor: null,
    lastTypingWrite: 0,
    lastHeartbeat: 0,
    lastReadWrite: 0,
    readWriteTimer: null,
    presenceDisabled: false,
    typingTimer: null,
    mention: { open: false, items: [], index: 0, start: 0 },
    openChatOnLoad: new URLSearchParams(location.search).get('chat') === '1',
    baseTitle: '',
  };

  const $ = (id) => document.getElementById(id);
  const me = () => (typeof currentUser !== 'undefined' && currentUser ? currentUser : null);
  const myId = () => (me() ? me().id : null);
  const FV = () => firebase.firestore.FieldValue;

  function isChatOpen() {
    const el = $('chatSidebar');
    return !!el && !el.classList.contains('translate-x-full') && el.style.display !== 'none';
  }
  const pageVisible = () => document.visibilityState === 'visible';

  // ---------- стили ----------
  function injectStyles() {
    if ($('blockoChatStyles')) return;
    const css = `
      #chatMessages{scroll-behavior:auto;overscroll-behavior:contain}
      .chat-row{display:flex;gap:8px;align-items:flex-end;position:relative;margin-top:10px}
      .chat-row.grouped{margin-top:2px}
      .chat-row.me{flex-direction:row-reverse}
      .chat-av{width:32px;flex:0 0 32px}
      .chat-col{display:flex;flex-direction:column;min-width:0;max-width:82%}
      .chat-row.me .chat-col{align-items:flex-end}
      .chat-name{font-size:11px;font-weight:600;color:#71717a;margin:0 0 3px 10px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .chat-bubble{position:relative;padding:7px 11px 6px;border-radius:16px;font-size:14px;line-height:1.4;word-break:break-word;overflow-wrap:anywhere;white-space:pre-wrap;max-width:100%}
      .chat-row:not(.me) .chat-bubble{background:#f4f4f5;color:#18181b;border-bottom-left-radius:6px}
      .chat-row.me .chat-bubble{background:#2563eb;color:#fff;border-bottom-right-radius:6px}
      .dark .chat-row:not(.me) .chat-bubble{background:#27272a;color:#f4f4f5}
      .chat-row.grouped:not(.me) .chat-bubble{border-top-left-radius:6px}
      .chat-row.grouped.me .chat-bubble{border-top-right-radius:6px}
      .chat-bubble.bare{background:transparent!important;padding:0;color:inherit!important}
      .chat-bubble.big-emoji{font-size:40px;line-height:1.15;padding:0;background:transparent!important}
      .chat-bubble a{text-decoration:underline;text-underline-offset:2px}
      .chat-row:not(.me) .chat-bubble a{color:#2563eb}.dark .chat-row:not(.me) .chat-bubble a{color:#60a5fa}
      .chat-mention{font-weight:600;border-radius:4px;padding:0 2px}
      .chat-row:not(.me) .chat-mention{color:#2563eb;background:rgba(37,99,235,.08)}
      .dark .chat-row:not(.me) .chat-mention{color:#93c5fd;background:rgba(96,165,250,.12)}
      .chat-row.me .chat-mention{background:rgba(255,255,255,.18)}
      .chat-mention.mine{background:rgba(245,158,11,.22)!important;color:inherit!important}
      .chat-meta{float:right;display:inline-flex;align-items:center;gap:3px;font-size:10.5px;line-height:1;margin:8px -2px -2px 10px;white-space:nowrap;user-select:none}
      .chat-row:not(.me) .chat-meta{color:#a1a1aa}
      .chat-row.me .chat-meta{color:rgba(255,255,255,.72)}
      .chat-bubble.bare .chat-meta,.chat-bubble.big-emoji .chat-meta{float:none;margin:4px 0 0;color:#a1a1aa;font-size:10.5px}
      .chat-meta svg{width:14px;height:14px}
      .chat-meta .read{color:#bfdbfe}.chat-bubble.bare .chat-meta .read{color:#3b82f6}
      .chat-quote{display:block;border-left:3px solid currentColor;padding:2px 8px;margin:1px 0 5px;border-radius:4px;font-size:12.5px;cursor:pointer;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
      .chat-row:not(.me) .chat-quote{color:#2563eb;background:rgba(37,99,235,.06)}
      .dark .chat-row:not(.me) .chat-quote{color:#93c5fd;background:rgba(96,165,250,.08)}
      .chat-row.me .chat-quote{background:rgba(255,255,255,.14)}
      .chat-quote b{display:block;font-weight:600;font-size:12px}
      .chat-quote span{color:inherit;opacity:.85}
      .chat-reacts{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
      .chat-react{display:inline-flex;align-items:center;gap:3px;height:24px;padding:0 8px;border-radius:999px;font-size:13px;border:1px solid #e4e4e7;background:#fff;color:#3f3f46;cursor:pointer;transition:background .15s}
      .dark .chat-react{background:#18181b;border-color:#3f3f46;color:#d4d4d8}
      .chat-react.on{border-color:#3b82f6;background:#eff6ff;color:#1d4ed8}
      .dark .chat-react.on{background:rgba(59,130,246,.15);color:#93c5fd}
      .chat-react small{font-size:11.5px;font-weight:600}
      .chat-actions{position:absolute;top:-14px;display:none;gap:2px;padding:2px;border-radius:10px;background:#fff;border:1px solid #e4e4e7;box-shadow:0 4px 12px -2px rgb(0 0 0 / .1);z-index:5}
      .dark .chat-actions{background:#27272a;border-color:#3f3f46}
      .chat-row:not(.me) .chat-actions{right:-6px}.chat-row.me .chat-actions{left:-6px}
      .chat-row.me .chat-col{position:relative}.chat-row:not(.me) .chat-col{position:relative}
      @media (hover:hover){.chat-row:hover .chat-actions{display:flex}}
      .chat-row.is-active .chat-actions{display:flex}
      .chat-actions button{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:8px;color:#71717a}
      .chat-actions button:hover{background:#f4f4f5;color:#18181b}.dark .chat-actions button:hover{background:#3f3f46;color:#fff}
      .chat-actions svg{width:15px;height:15px}
      .chat-picker{position:absolute;top:-52px;display:flex;gap:2px;padding:4px;border-radius:999px;background:#fff;border:1px solid #e4e4e7;box-shadow:0 8px 24px -6px rgb(0 0 0 / .15);z-index:6}
      .dark .chat-picker{background:#27272a;border-color:#3f3f46}
      .chat-row:not(.me) .chat-picker{left:0}.chat-row.me .chat-picker{right:0}
      .chat-picker button{width:34px;height:34px;font-size:20px;border-radius:999px;transition:transform .1s}
      .chat-picker button:hover{transform:scale(1.18);background:#f4f4f5}.dark .chat-picker button:hover{background:#3f3f46}
      .chat-day{display:flex;justify-content:center;margin:16px 0 4px}
      .chat-day span{font-size:11px;font-weight:600;color:#71717a;background:#f4f4f5;padding:3px 10px;border-radius:999px}
      .dark .chat-day span{background:#27272a;color:#a1a1aa}
      .chat-unread{display:flex;align-items:center;gap:8px;margin:14px 0 2px;color:#2563eb;font-size:11px;font-weight:600}
      .chat-unread:before,.chat-unread:after{content:"";flex:1;height:1px;background:currentColor;opacity:.3}
      .dark .chat-unread{color:#60a5fa}
      .chat-row.flash .chat-bubble{animation:chatFlash 1.4s ease}
      @keyframes chatFlash{0%,40%{box-shadow:0 0 0 3px rgba(59,130,246,.45)}100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}
      .chat-row.failed .chat-bubble{opacity:.75}
      .chat-fail{display:flex;gap:10px;font-size:11.5px;color:#dc2626;margin-top:3px}
      .chat-fail button{font-weight:600;text-decoration:underline}
      .chat-typing-dots{display:inline-flex;gap:3px;margin-right:6px;vertical-align:middle}
      .chat-typing-dots i{width:5px;height:5px;border-radius:50%;background:currentColor;animation:chatDot 1.2s infinite ease-in-out}
      .chat-typing-dots i:nth-child(2){animation-delay:.15s}.chat-typing-dots i:nth-child(3){animation-delay:.3s}
      @keyframes chatDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
      .chat-img{display:block;max-width:240px;max-height:320px;width:auto;border-radius:12px;cursor:zoom-in;margin:2px 0 4px;background:#e4e4e7}
      .chat-upload{position:relative;display:inline-block}
      .chat-upload:after{content:"";position:absolute;inset:0;border-radius:12px;background:rgba(0,0,0,.25)}
      .chat-spin{width:16px;height:16px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:chatSpin .8s linear infinite;display:inline-block;vertical-align:middle}
      @keyframes chatSpin{to{transform:rotate(360deg)}}
      #chatInput{resize:none;max-height:140px}
      #chatInput:focus,#chatInput:focus-visible{outline:none!important;box-shadow:none!important}
      @media (prefers-reduced-motion:reduce){.chat-typing-dots i,.chat-row.flash .chat-bubble,.chat-spin{animation:none}}
    `;
    const style = document.createElement('style');
    style.id = 'blockoChatStyles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- утилиты ----------
  function tsOf(data) {
    const t = data && data.timestamp;
    if (!t) return 0;
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t === 'number') return t;
    if (t.seconds) return t.seconds * 1000;
    const p = Date.parse(t);
    return Number.isNaN(p) ? 0 : p;
  }
  const timeLabel = (ts) => (ts ? new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');
  const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  function dayLabel(ts) {
    const d = new Date(ts);
    const today = new Date();
    const y = new Date(); y.setDate(today.getDate() - 1);
    if (dayKey(ts) === dayKey(today.getTime())) return 'Сегодня';
    if (dayKey(ts) === dayKey(y.getTime())) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }
  const members = () => (boardData && boardData.users) || {};
  function userView(u) {
    u = u || {};
    const fresh = u.id && members()[u.id];
    return fresh ? { ...u, ...fresh, id: u.id } : u;
  }
  const shortName = (name) => String(name || 'Участник').trim().split(/\s+/)[0];
  function previewText(data) {
    if (!data) return '';
    if (data.text) return String(data.text).replace(/\s+/g, ' ').slice(0, 140);
    if (data.sticker) return 'Стикер';
    if (data.attachment) return data.attachment.type === 'image' ? '🖼 Фото' : `📎 ${data.attachment.name || 'Файл'}`;
    return 'Сообщение';
  }
  const PICTO = /\p{Extended_Pictographic}/gu;
  function isBigEmoji(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 24) return false;
    if (!/^[\p{Extended_Pictographic}\p{Emoji_Component}‍️\s]+$/u.test(t)) return false;
    const n = (t.match(PICTO) || []).length;
    return n >= 1 && n <= 3;
  }

  // Текст сообщения → безопасный HTML: ссылки, упоминания, переносы строк
  function renderText(raw) {
    const text = String(raw || '');
    const parts = text.split(/(https?:\/\/[^\s<>"'`]+)/g);
    const names = Object.entries(members())
      .map(([uid, u]) => ({ uid, name: String((u && u.name) || '').trim() }))
      .filter((m) => m.name.length >= 2)
      .sort((a, b) => b.name.length - a.name.length);
    const mine = myId();
    let html = '';
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        let url = part;
        let tail = '';
        const m = url.match(/[.,!?;:)\]]+$/);
        if (m) { tail = m[0]; url = url.slice(0, -tail.length); }
        const safe = safeUrl(url);
        html += safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>${esc(tail)}` : esc(part);
        return;
      }
      let chunk = esc(part);
      names.forEach(({ uid, name }) => {
        const token = `@${esc(name)}`;
        if (chunk.includes(token)) {
          chunk = chunk.split(token).join(`<span class="chat-mention${uid === mine ? ' mine' : ''}">${token}</span>`);
        }
      });
      html += chunk;
    });
    return html;
  }

  function extractMentions(text) {
    const out = [];
    Object.entries(members()).forEach(([uid, u]) => {
      const name = String((u && u.name) || '').trim();
      if (name.length >= 2 && uid !== myId() && text.includes(`@${name}`)) out.push(uid);
    });
    return out.slice(0, 20);
  }

  function reactionsOf(data) {
    // reactions: { uid: '👍' } + старые лайки (likes: [uid]) показываем как ❤️
    const map = {};
    const r = (data && data.reactions) || {};
    Object.entries(r).forEach(([uid, emoji]) => { if (typeof emoji === 'string' && emoji) (map[emoji] = map[emoji] || new Set()).add(uid); });
    ((data && data.likes) || []).forEach((uid) => {
      if (!r[uid]) (map['❤️'] = map['❤️'] || new Set()).add(uid);
    });
    return map;
  }
  function myReaction(data) {
    const uid = myId();
    const r = (data && data.reactions) || {};
    if (r[uid]) return r[uid];
    if (((data && data.likes) || []).includes(uid)) return '❤️';
    return null;
  }

  function othersReadMax() {
    let max = 0;
    S.presence.forEach((p, uid) => { if (uid !== myId() && typeof p.lastReadAt === 'number' && p.lastReadAt > max) max = p.lastReadAt; });
    return max;
  }

  const icon = (name, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;

  // ---------- рендер одного сообщения ----------
  function messageHtml(m, opts) {
    const d = m.data || {};
    const user = userView(d.user);
    const isMe = user.id === myId();
    const big = !d.attachment && !d.sticker && !d.replyTo && isBigEmoji(d.text);
    const isOwner = boardData && boardData.owner === myId();

    // статус своего сообщения
    let status = '';
    if (isMe) {
      if (m.failed) status = icon('alert-circle');
      else if (m.pending || m.uploading) status = icon('clock');
      else if (m.ts && m.ts <= opts.readMax) status = `<span class="read">${icon('check-check')}</span>`;
      else status = icon('check');
    }
    const meta = `<span class="chat-meta" title="${esc(m.ts ? new Date(m.ts).toLocaleString('ru-RU') : '')}">${d.editedAt ? 'изм. ' : ''}${esc(timeLabel(m.ts || Date.now()))}${status}</span>`;

    let quote = '';
    if (d.replyTo && typeof d.replyTo === 'object') {
      quote = `<span class="chat-quote" data-act="jump" data-target="${esc(String(d.replyTo.id || ''))}"><b>${esc(d.replyTo.name || 'Сообщение')}</b><span>${esc(String(d.replyTo.text || '').slice(0, 140))}</span></span>`;
    }

    let body = '';
    let bubbleCls = 'chat-bubble';
    if (d.sticker && LEGACY_STICKERS[d.sticker]) {
      bubbleCls += ' bare';
      body = `<div class="p-2">${icon(d.sticker, `w-12 h-12 ${LEGACY_STICKERS[d.sticker]}`)}</div>`;
    } else if (d.attachment && d.attachment.type === 'image') {
      const url = m.preview || safeUrl(d.attachment.url);
      body = url ? `<span class="${m.uploading ? 'chat-upload' : ''}"><img class="chat-img" src="${esc(url)}" alt="${esc(d.attachment.name || 'Фото')}" loading="lazy" ${m.uploading ? '' : 'data-act="image"'}></span>` : '';
      if (!d.text) bubbleCls += ' bare';
    } else if (d.attachment) {
      body = fileHtml(m, d, isMe);
    }
    if (d.text) body += big ? esc(String(d.text).trim()) : renderText(d.text);
    if (big) bubbleCls = 'chat-bubble big-emoji';

    const reacts = reactionsOf(d);
    const mine = myReaction(d);
    const reactHtml = Object.keys(reacts).length
      ? `<div class="chat-reacts">${Object.entries(reacts).map(([emoji, set]) => {
          const names = [...set].map((uid) => shortName((members()[uid] || {}).name)).join(', ');
          return `<button class="chat-react${emoji === mine ? ' on' : ''}" data-act="react" data-emoji="${esc(emoji)}" title="${esc(names)}">${esc(emoji)}<small>${set.size}</small></button>`;
        }).join('')}</div>`
      : '';

    const canAct = !m.pending && !m.failed && !m.uploading;
    const actions = canAct ? `<div class="chat-actions" role="toolbar">
        <button data-act="picker" title="Реакция" aria-label="Реакция">${icon('smile-plus')}</button>
        <button data-act="reply" title="Ответить" aria-label="Ответить">${icon('reply')}</button>
        ${d.text ? `<button data-act="copy" title="Копировать" aria-label="Копировать">${icon('copy')}</button>` : ''}
        ${isMe && d.text && !d.sticker ? `<button data-act="edit" title="Изменить" aria-label="Изменить">${icon('pencil')}</button>` : ''}
        ${isMe || isOwner ? `<button data-act="delete" title="Удалить" aria-label="Удалить">${icon('trash-2')}</button>` : ''}
      </div>` : '';
    const picker = S.pickerFor === m.id ? `<div class="chat-picker">${REACTIONS.map((e) => `<button data-act="react" data-emoji="${e}" class="${e === mine ? 'bg-blue-50 dark:bg-blue-900/30' : ''}">${e}</button>`).join('')}</div>` : '';

    const fail = m.failed ? `<div class="chat-fail">Не отправлено <button data-act="retry">Повторить</button><button data-act="discard">Удалить</button></div>` : '';
    const avatar = isMe ? '' : `<div class="chat-av">${opts.grouped ? '' : getAvatarHTML(user, 'w-8 h-8')}</div>`;
    const name = !isMe && !opts.grouped ? `<div class="chat-name">${esc(user.name || 'Участник')}</div>` : '';

    return `<div class="chat-row${isMe ? ' me' : ''}${opts.grouped ? ' grouped' : ''}${m.failed ? ' failed' : ''}${S.activeRowId === m.id ? ' is-active' : ''}" id="msg_${esc(m.id)}" data-id="${esc(m.id)}">
      ${avatar}
      <div class="chat-col">
        ${name}${picker}${actions}
        <div class="${bubbleCls}">${quote}${body}${meta}</div>
        ${reactHtml}${fail}
      </div>
    </div>`;
  }

  function fileHtml(m, d, isMe) {
    const a = d.attachment;
    if (a.expiresAt && Date.now() > a.expiresAt) {
      return `<span class="text-xs italic opacity-80">⏳ Срок хранения файла истёк</span>`;
    }
    const isBurn = a.retention === 'burn';
    const fileUrl = safeUrl(a.url, { allowData: true });
    const fileName = String(a.name || 'file');
    const sub = isMe ? 'text-white/70' : 'text-gray-500';
    const btn = m.uploading
      ? '<span class="chat-spin"></span>'
      : isBurn
        ? `<button data-act="burn" class="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10" title="Скачать и уничтожить">${icon('download', 'w-4 h-4')}</button>`
        : (fileUrl ? `<a href="${esc(fileUrl)}" download="${esc(fileName)}" class="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 !no-underline" title="Скачать">${icon('download', 'w-4 h-4')}</a>` : '');
    return `<span class="flex items-center gap-2.5 min-w-[180px] max-w-[260px] py-0.5" style="white-space:normal">
        <span class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isMe ? 'bg-white/15' : 'bg-white dark:bg-gray-700'}">${icon(isBurn ? 'flame' : 'file-text', 'w-4 h-4')}</span>
        <span class="flex-1 min-w-0 flex flex-col">
          <span class="text-[13px] font-semibold truncate" title="${esc(fileName)}">${esc(fileName)}</span>
          <span class="text-[11px] ${sub}">${esc(a.size || '')}${isBurn ? ' · одно скачивание' : a.retention === '1day' ? ' · хранится 1 день' : a.retention === '7days' ? ' · хранится 7 дней' : ''}</span>
        </span>
        ${btn}
      </span>`;
  }

  // ---------- рендер ленты (по ключам: меняем только изменившиеся узлы) ----------
  function buildItems() {
    const list = [...S.messages];
    S.failed.forEach((payload, id) => { if (!S.byId.has(id)) list.push({ id, data: payload, ts: payload.clientTs || Date.now(), failed: true }); });
    S.uploads.forEach((u, id) => list.push({ id, data: { user: me(), text: '', attachment: { type: u.kind, name: u.name, size: u.size } }, ts: u.ts, uploading: true, preview: u.preview }));
    list.sort((a, b) => (a.ts || Infinity) - (b.ts || Infinity));

    const items = [];
    const readMax = othersReadMax();
    let prev = null;
    let unreadPlaced = false;
    const unreadFrom = S.unreadAnchor || 0;
    list.forEach((m) => {
      const ts = m.ts || Date.now();
      if (!prev || dayKey(prev.ts || Date.now()) !== dayKey(ts)) items.push({ key: `day_${dayKey(ts)}`, html: `<div class="chat-day"><span>${esc(dayLabel(ts))}</span></div>` });
      const uid = m.data && m.data.user && m.data.user.id;
      if (!unreadPlaced && unreadFrom && uid !== myId() && ts > unreadFrom && !m.pending) {
        items.push({ key: 'unread_divider', html: '<div class="chat-unread">Новые сообщения</div>' });
        unreadPlaced = true;
      }
      const grouped = !!prev && prev.data && prev.data.user && uid === prev.data.user.id
        && dayKey(prev.ts || Date.now()) === dayKey(ts) && ts - (prev.ts || ts) < GROUP_WINDOW_MS && !prev.failed;
      items.push({ key: `m_${m.id}`, html: messageHtml(m, { grouped, readMax }) });
      prev = m;
    });
    return items;
  }

  function render(opts = {}) {
    const box = $('chatMessages');
    if (!box || (typeof isLocalBoard !== 'undefined' && isLocalBoard)) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    const fromBottom = box.scrollHeight - box.scrollTop;

    const items = buildItems();
    // шапка: «показать ранее» / пустой чат
    const head = [];
    if (S.hasMore) head.push({ key: 'more', html: `<div class="flex justify-center py-2"><button data-act="more" class="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">Показать предыдущие сообщения</button></div>` });
    if (!items.length) {
      head.push({ key: 'empty', html: `<div class="flex-1 flex flex-col items-center justify-center text-center py-12 px-6 text-gray-400">
        <div class="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">${icon('messages-square', 'w-6 h-6')}</div>
        <p class="text-sm font-medium text-gray-600 dark:text-gray-300">Пока нет сообщений</p>
        <p class="text-xs mt-1">Напишите команде первым 👋</p></div>` });
    }
    const all = [...head, ...items];

    const wanted = new Set(all.map((i) => i.key));
    // удаляем лишнее
    [...box.children].forEach((el) => {
      const key = el.getAttribute('data-key');
      if (!key || !wanted.has(key)) { el.remove(); S.rendered.delete(key); }
    });
    // вставляем/обновляем по порядку
    let cursor = box.firstElementChild;
    all.forEach((item) => {
      let el = cursor && cursor.getAttribute('data-key') === item.key ? cursor : box.querySelector(`:scope > [data-key="${CSS.escape(item.key)}"]`);
      if (el && S.rendered.get(item.key) !== item.html) {
        const fresh = toNode(item);
        if (el === cursor) cursor = fresh;
        el.replaceWith(fresh);
        el = fresh;
      } else if (!el) {
        el = toNode(item);
      }
      if (el === cursor) cursor = cursor.nextElementSibling;
      else box.insertBefore(el, cursor);
      S.rendered.set(item.key, item.html);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: box });

    if (opts.keepOffset) box.scrollTop = box.scrollHeight - fromBottom;
    else if (opts.toBottom || (nearBottom && !opts.noScroll)) box.scrollTop = box.scrollHeight;
    updateScrollButton();
  }

  function toNode(item) {
    const wrap = document.createElement('div');
    wrap.innerHTML = item.html.trim();
    const node = wrap.firstElementChild || document.createElement('div');
    node.setAttribute('data-key', item.key);
    return node;
  }

  // ---------- непрочитанные, значок, заголовок ----------
  function latestTs() {
    let max = 0;
    S.messages.forEach((m) => { if (m.ts > max) max = m.ts; });
    return max;
  }
  function unreadCount() {
    return S.messages.filter((m) => m.ts > S.lastReadTs && !m.pending && m.data.user && m.data.user.id !== myId()).length;
  }
  function updateBadge() {
    const n = unreadCount();
    const badge = $('chatBadge');
    if (badge) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.classList.toggle('hidden', n === 0);
      badge.classList.remove('animate-pulse');
    }
    refreshTitle();
    updateScrollButton();
  }
  function refreshTitle() {
    const base = document.title.replace(/^\(\d+\+?\)\s/, '');
    const n = unreadCount();
    const next = n ? `(${n > 99 ? '99+' : n}) ${base}` : base;
    if (document.title !== next) document.title = next;
  }

  function markRead() {
    if (!isChatOpen() || !pageVisible()) return;
    const box = $('chatMessages');
    if (box && box.scrollHeight - box.scrollTop - box.clientHeight > 200) return; // пользователь читает историю
    const latest = latestTs();
    if (latest > S.lastReadTs) {
      S.lastReadTs = latest;
      lsSet(LS.read(), String(latest));
      scheduleReadWrite();
    }
    updateBadge();
  }

  function updateScrollButton() {
    const btn = $('chatScrollBtn');
    const box = $('chatMessages');
    if (!btn || !box) return;
    const far = box.scrollHeight - box.scrollTop - box.clientHeight > 300;
    btn.classList.toggle('hidden', !far);
    const n = unreadCount();
    const c = $('chatScrollCount');
    if (c) { c.textContent = n > 99 ? '99+' : String(n); c.classList.toggle('hidden', !n); }
  }

  // ---------- уведомления ----------
  let audioCtx = null;
  function unlockAudio() {
    if (audioCtx || !(window.AudioContext || window.webkitAudioContext)) return;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  function playSound() {
    if (lsGet(LS.sound, '1') !== '1' || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      [[880, 0], [1320, 0.09]].forEach(([freq, delay]) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t + delay);
        g.gain.exponentialRampToValueAtTime(0.12, t + delay + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.18);
        o.connect(g).connect(audioCtx.destination);
        o.start(t + delay);
        o.stop(t + delay + 0.2);
      });
    } catch (e) { /* звук не обязателен */ }
  }

  const notifySupported = () => 'Notification' in window;
  const notifyEnabled = () => notifySupported() && Notification.permission === 'granted' && lsGet(LS.notify, '1') === '1';

  async function showSystemNotification(m) {
    if (!notifyEnabled()) return;
    const user = userView(m.data.user);
    const title = `${user.name || 'Участник'} · ${(boardData && boardData.title) || 'Blocko'}`;
    const options = {
      body: previewText(m.data),
      tag: `chat-${BOARD_ID}`,
      renotify: true,
      icon: safeUrl(user.customAvatar) || safeUrl(user.avatar) || undefined,
      data: { url: `board.html?b=${encodeURIComponent(BOARD_ID)}&chat=1`, boardId: BOARD_ID, type: 'chat' },
    };
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg && reg.showNotification) { await reg.showNotification(title, options); return; }
    } catch (e) { /* ниже — запасной вариант */ }
    try {
      const n = new Notification(title, options);
      n.onclick = () => { window.focus(); openChat(); n.close(); };
    } catch (e) { /* Android без SW не умеет new Notification */ }
  }

  function notifyAbout(newOnes) {
    if (!newOnes.length) return;
    const visibleAndOpen = pageVisible() && isChatOpen();
    const last = newOnes[newOnes.length - 1];
    const mentioned = newOnes.some((m) => (m.data.mentions || []).includes(myId()));
    if (visibleAndOpen) {
      const box = $('chatMessages');
      if (box && box.scrollHeight - box.scrollTop - box.clientHeight > 300) playSound();
      return;
    }
    playSound();
    if (pageVisible()) {
      const user = userView(last.data.user);
      const text = previewText(last.data);
      showSystemToast(`${mentioned ? '@ Вас упомянули · ' : ''}${user.name || 'Сообщение'}`, text.length > 70 ? `${text.slice(0, 70)}…` : text, mentioned ? 'at-sign' : 'message-square', 'text-blue-500', 'bg-blue-50 dark:bg-blue-900/30');
      const badge = $('chatBadge');
      if (badge) { badge.classList.add('animate-pulse'); setTimeout(() => badge.classList.remove('animate-pulse'), 2400); }
    } else {
      showSystemNotification(last);
    }
  }

  function renderNotifyButtons() {
    const bell = $('chatNotifyBtn');
    if (bell) {
      const on = notifyEnabled();
      bell.innerHTML = icon(on ? 'bell' : 'bell-off', 'w-4 h-4');
      bell.title = on ? 'Уведомления включены' : 'Включить уведомления';
      bell.classList.toggle('text-blue-600', on);
      bell.classList.toggle('dark:text-blue-400', on);
    }
    const snd = $('chatSoundBtn');
    if (snd) {
      const on = lsGet(LS.sound, '1') === '1';
      snd.innerHTML = icon(on ? 'volume-2' : 'volume-x', 'w-4 h-4');
      snd.title = on ? 'Звук включён' : 'Звук выключен';
    }
    const banner = $('chatNotifyBanner');
    if (banner) {
      const show = notifySupported() && Notification.permission === 'default' && lsGet(LS.banner) !== '1' && !isLocalBoard;
      banner.classList.toggle('hidden', !show);
    }
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: $('chatSidebar') });
  }

  async function toggleNotifications() {
    unlockAudio();
    if (!notifySupported()) {
      return showSystemToast('Не поддерживается', 'Этот браузер не умеет показывать уведомления. На iPhone добавьте сайт на экран «Домой».', 'bell-off', 'text-amber-500', 'bg-amber-50');
    }
    if (Notification.permission === 'denied') {
      return showSystemToast('Уведомления запрещены', 'Разрешите их в настройках браузера: значок замка слева от адреса сайта → Уведомления.', 'bell-off', 'text-amber-500', 'bg-amber-50');
    }
    if (Notification.permission === 'default') {
      let res = 'default';
      try { res = await Notification.requestPermission(); } catch (e) { res = Notification.permission; }
      lsSet(LS.banner, '1');
      if (res === 'granted') {
        lsSet(LS.notify, '1');
        showSystemToast('Уведомления включены', 'Мы сообщим о новых сообщениях, даже если вкладка свёрнута.', 'bell', 'text-green-500', 'bg-green-50');
      }
      renderNotifyButtons();
      return;
    }
    const next = lsGet(LS.notify, '1') === '1' ? '0' : '1';
    lsSet(LS.notify, next);
    showSystemToast(next === '1' ? 'Уведомления включены' : 'Уведомления выключены', next === '1' ? 'Будем сообщать о новых сообщениях.' : 'Значок с числом новых сообщений останется.', next === '1' ? 'bell' : 'bell-off', 'text-blue-500', 'bg-blue-50');
    renderNotifyButtons();
  }
  function toggleSound() {
    unlockAudio();
    lsSet(LS.sound, lsGet(LS.sound, '1') === '1' ? '0' : '1');
    renderNotifyButtons();
    if (lsGet(LS.sound, '1') === '1') playSound();
  }
  function closeNotifyBanner() { lsSet(LS.banner, '1'); renderNotifyButtons(); }

  // ---------- присутствие: «в сети» и «печатает» ----------
  function presenceWrite(fields) {
    if (S.presenceDisabled || !S.presenceCol || !myId()) return;
    S.presenceCol.doc(myId()).set(fields, { merge: true }).catch((err) => {
      if (err && err.code === 'permission-denied') S.presenceDisabled = true; // правила ещё не обновлены
    });
  }
  function heartbeat(force) {
    if (!pageVisible() && !force) return;
    const now = Date.now();
    if (!force && now - S.lastHeartbeat < HEARTBEAT_MS - 1000) return;
    S.lastHeartbeat = now;
    presenceWrite({ lastActive: now });
  }
  function scheduleReadWrite() {
    if (S.readWriteTimer) return;
    const wait = Math.max(0, READ_WRITE_THROTTLE_MS - (Date.now() - S.lastReadWrite));
    S.readWriteTimer = setTimeout(() => {
      S.readWriteTimer = null;
      S.lastReadWrite = Date.now();
      S.lastHeartbeat = Date.now();
      presenceWrite({ lastReadAt: S.lastReadTs, lastActive: Date.now() });
    }, wait);
  }
  function onTyping() {
    const now = Date.now();
    if (now - S.lastTypingWrite < TYPING_WRITE_EVERY_MS) return;
    S.lastTypingWrite = now;
    S.lastHeartbeat = now;
    presenceWrite({ typingUntil: now + TYPING_TTL_MS, lastActive: now });
  }
  function stopTyping() {
    if (Date.now() - S.lastTypingWrite > TYPING_TTL_MS) return;
    S.lastTypingWrite = 0;
    presenceWrite({ typingUntil: 0 });
  }

  function renderPresence() {
    const now = Date.now();
    const online = [];
    const typing = [];
    S.presence.forEach((p, uid) => {
      if (uid === myId()) return;
      const name = shortName((members()[uid] || {}).name);
      if (typeof p.lastActive === 'number' && now - p.lastActive < ONLINE_WINDOW_MS) online.push(name);
      if (typeof p.typingUntil === 'number' && p.typingUntil > now) typing.push(name);
    });
    const sub = $('chatSubtitle');
    if (sub) {
      if (isLocalBoard) sub.innerHTML = 'Только в облачных проектах';
      else if (online.length) {
        const names = online.length <= 2 ? online.join(', ') : `${online.slice(0, 2).join(', ')} и ещё ${online.length - 2}`;
        sub.innerHTML = `<span class="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1 align-middle"></span>${esc(names)} в сети`;
      } else {
        const count = Object.keys(members()).length;
        sub.textContent = count > 1 ? `${count} участн${count % 10 === 1 && count % 100 !== 11 ? 'ик' : (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? 'ика' : 'иков')}` : 'Только вы';
      }
    }
    const line = $('chatTyping');
    if (line) {
      if (typing.length) {
        const who = typing.length === 1 ? `${typing[0]} печатает` : typing.length === 2 ? `${typing.join(' и ')} печатают` : 'Несколько человек печатают';
        line.innerHTML = `<span class="chat-typing-dots"><i></i><i></i><i></i></span>${esc(who)}…`;
        line.classList.remove('invisible');
      } else {
        line.classList.add('invisible');
      }
    }
    clearTimeout(S.typingTimer);
    if (typing.length) S.typingTimer = setTimeout(renderPresence, 1500);
  }

  // ---------- подписки ----------
  function subscribeMessages() {
    if (S.unsubMessages) S.unsubMessages();
    S.unsubMessages = S.chatCol.orderBy('timestamp').limitToLast(S.limit + 1)
      .onSnapshot({ includeMetadataChanges: true }, (snap) => {
        const docs = snap.docs;
        S.hasMore = docs.length > S.limit;
        const slice = S.hasMore ? docs.slice(docs.length - S.limit) : docs;
        const fresh = [];
        S.messages = slice.map((doc) => {
          const data = doc.data({ serverTimestamps: 'estimate' });
          const m = { id: doc.id, data, ts: tsOf(data), pending: doc.metadata.hasPendingWrites };
          if (!S.seen.has(doc.id)) {
            S.seen.add(doc.id);
            if (!S.firstLoad && data.user && data.user.id !== myId() && !m.pending && m.ts > S.notifyFloor && m.ts > S.lastReadTs) fresh.push(m);
          }
          S.failed.delete(doc.id);
          return m;
        });
        S.byId = new Map(S.messages.map((m) => [m.id, m]));
        const wasFirst = S.firstLoad;
        S.firstLoad = false;
        if (wasFirst) {
          const stored = Number(lsGet(LS.read(), '0')) || 0;
          if (stored) S.lastReadTs = stored;
          else S.lastReadTs = latestTs(); // первый визит: старое не считаем непрочитанным
          S.unreadAnchor = unreadCount() ? S.lastReadTs : 0;
        }
        const mineNew = snap.docChanges().some((c) => c.type === 'added' && c.doc.metadata.hasPendingWrites);
        render({ toBottom: wasFirst || mineNew, keepOffset: S.keepOffsetOnce });
        S.keepOffsetOnce = false;
        notifyAbout(fresh);
        markRead();
        updateBadge();
        if (wasFirst && S.openChatOnLoad) { S.openChatOnLoad = false; openChat(); }
      }, (err) => {
        console.error('chat listener', err);
        if (err && err.code === 'permission-denied') {
          const box = $('chatMessages');
          if (box) box.innerHTML = '<div class="text-center text-xs text-gray-400 mt-6 px-6">Нет доступа к чату этого проекта.</div>';
        }
      });
  }

  function subscribePresence() {
    if (S.unsubPresence) S.unsubPresence();
    S.unsubPresence = S.presenceCol.onSnapshot((snap) => {
      S.presence = new Map(snap.docs.map((d) => [d.id, d.data()]));
      renderPresence();
      render({ noScroll: true }); // галочки «прочитано»
    }, (err) => {
      S.presenceDisabled = true;
      console.warn('presence listener', err && err.code);
    });
  }

  function init(docRef) {
    injectStyles();
    if (S.started) return;
    S.started = true;
    S.chatCol = docRef.collection('chat');
    S.presenceCol = docRef.collection('presence');
    subscribeMessages();
    subscribePresence();
    heartbeat(true);
    setInterval(() => heartbeat(false), HEARTBEAT_MS);
    setInterval(renderPresence, 30000);
    document.addEventListener('visibilitychange', () => {
      if (pageVisible()) { heartbeat(false); markRead(); } else stopTyping();
    });
    renderNotifyButtons();
  }

  // ---------- отправка ----------
  function buildPayload(fields) {
    const u = me();
    const payload = {
      text: '',
      user: { id: u.id, name: u.name || 'Участник', avatar: u.avatar || null, customAvatar: u.customAvatar || null, badgeStatus: u.badgeStatus || null, badgeConfig: u.badgeConfig || null },
      likes: [],
      clientTs: Date.now(),
      ...fields,
    };
    if (S.replyTo) {
      payload.replyTo = S.replyTo;
      S.replyTo = null;
    }
    return payload;
  }

  function writeMessage(id, payload) {
    const ref = S.chatCol.doc(id);
    S.seen.add(id);
    ref.set({ ...payload, timestamp: FV().serverTimestamp() }).catch((err) => {
      console.error('chat send failed', err);
      S.failed.set(id, payload);
      render({ toBottom: true });
      showSystemToast('Не отправлено', err && err.code === 'permission-denied' ? 'Нет прав писать в этот чат.' : 'Проверьте интернет и нажмите «Повторить».', 'alert-circle', 'text-red-500', 'bg-red-50');
    });
  }

  function send() {
    if (isLocalBoard || !S.chatCol) return;
    const input = $('chatInput');
    if (!input) return;
    const text = input.value.replace(/\s+$/g, '').replace(/^\s*\n/g, '');
    if (!text.trim()) return;
    if (text.length > MAX_TEXT) return showSystemToast('Слишком длинно', `Максимум ${MAX_TEXT} символов.`, 'alert-circle', 'text-amber-500', 'bg-amber-50');

    if (S.editingId) {
      const id = S.editingId;
      const old = S.byId.get(id);
      cancelCompose();
      setInput('');
      if (old && old.data.text === text) return;
      S.chatCol.doc(id).update({ text, editedAt: Date.now(), mentions: extractMentions(text) })
        .catch(() => showSystemToast('Ошибка', 'Не удалось изменить сообщение.', 'alert-circle', 'text-red-500', 'bg-red-50'));
      return;
    }

    const id = S.chatCol.doc().id;
    const payload = buildPayload({ text, mentions: extractMentions(text) });
    setInput('');
    hideReplyBar();
    stopTyping();
    writeMessage(id, payload);
    input.focus();
  }

  function sendSticker(name) {
    if (isLocalBoard || !S.chatCol) return showSystemToast('Офлайн', 'Чат доступен только в облачных проектах.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
    if (!LEGACY_STICKERS[name]) return;
    closeEmoji();
    writeMessage(S.chatCol.doc().id, buildPayload({ sticker: name }));
    hideReplyBar();
  }

  function react(id, emoji) {
    const m = S.byId.get(id);
    if (!m || !myId()) return;
    const uid = myId();
    const current = myReaction(m.data);
    const update = {};
    const reactionsPath = new firebase.firestore.FieldPath('reactions', uid);
    const remove = current === emoji;
    // старый лайк убираем, если пользователь меняет реакцию
    if (((m.data.likes || []).includes(uid))) update.likes = FV().arrayRemove(uid);
    S.pickerFor = null;
    const args = [reactionsPath, remove ? FV().delete() : emoji];
    if (update.likes) args.push('likes', update.likes);
    S.chatCol.doc(id).update(...args).catch((err) => {
      console.error('reaction failed', err);
      showSystemToast('Ошибка', 'Не удалось поставить реакцию.', 'alert-circle', 'text-red-500', 'bg-red-50');
    });
  }

  // ---------- композер ----------
  function setInput(value) {
    const input = $('chatInput');
    if (!input) return;
    input.value = value;
    autosize();
    updateComposerButtons();
  }
  function autosize() {
    const input = $('chatInput');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  }
  function updateComposerButtons() {
    const input = $('chatInput');
    const has = !!(input && input.value.trim());
    const mic = $('chatMicBtn');
    const sendBtn = $('chatSendBtn');
    const speech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    if (mic) mic.classList.toggle('hidden', has || !speech || !!S.editingId);
    if (sendBtn) sendBtn.classList.toggle('hidden', !has && speech && !S.editingId);
    const counter = $('chatCounter');
    if (counter) {
      const len = input ? input.value.length : 0;
      counter.textContent = `${len}/${MAX_TEXT}`;
      counter.classList.toggle('hidden', len < MAX_TEXT - 500);
      counter.classList.toggle('text-red-500', len > MAX_TEXT);
    }
  }

  function showBar(kind, title, text) {
    const bar = $('chatReplyBar');
    if (!bar) return;
    $('chatReplyIcon').innerHTML = icon(kind === 'edit' ? 'pencil' : 'reply', 'w-4 h-4');
    $('chatReplyTitle').textContent = title;
    $('chatReplyText').textContent = text;
    bar.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: bar });
  }
  function hideReplyBar() { const bar = $('chatReplyBar'); if (bar) bar.classList.add('hidden'); }
  function cancelCompose() {
    if (S.editingId) setInput('');
    S.replyTo = null;
    S.editingId = null;
    hideReplyBar();
    updateComposerButtons();
  }

  function startReply(id) {
    const m = S.byId.get(id);
    if (!m) return;
    const user = userView(m.data.user);
    S.editingId = null;
    S.replyTo = { id, uid: user.id || null, name: user.name || 'Участник', text: previewText(m.data) };
    showBar('reply', `Ответ ${user.id === myId() ? 'себе' : user.name || ''}`, previewText(m.data));
    focusInput();
  }
  function startEdit(id) {
    const m = S.byId.get(id);
    if (!m || !m.data.user || m.data.user.id !== myId() || !m.data.text) return;
    S.replyTo = null;
    S.editingId = id;
    showBar('edit', 'Редактирование', previewText(m.data));
    setInput(m.data.text);
    focusInput(true);
  }
  function focusInput(toEnd) {
    const input = $('chatInput');
    if (!input) return;
    input.focus();
    if (toEnd) input.setSelectionRange(input.value.length, input.value.length);
  }

  function insertAtCaret(text) {
    const input = $('chatInput');
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    input.setSelectionRange(pos, pos);
    autosize();
    updateComposerButtons();
    input.focus();
  }

  // ---------- упоминания ----------
  function updateMention() {
    const input = $('chatInput');
    const box = $('chatMentionBox');
    if (!input || !box) return;
    const before = input.value.slice(0, input.selectionStart || 0);
    const match = before.match(/(^|\s)@([^\s@]{0,30})$/);
    if (!match) { closeMention(); return; }
    const q = match[2].toLowerCase();
    const items = Object.entries(members())
      .filter(([uid, u]) => uid !== myId() && u && u.name && u.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map(([uid, u]) => ({ uid, user: { ...u, id: uid } }));
    if (!items.length) { closeMention(); return; }
    S.mention = { open: true, items, index: Math.min(S.mention.index, items.length - 1), start: before.length - match[2].length - 1 };
    box.innerHTML = items.map((it, i) => `<button type="button" data-mention="${i}" class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm rounded-lg ${i === S.mention.index ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'}">${getAvatarHTML(it.user, 'w-6 h-6')}<span class="truncate text-gray-800 dark:text-gray-100">${esc(it.user.name)}</span></button>`).join('');
    box.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: box });
  }
  function closeMention() {
    S.mention.open = false;
    S.mention.index = 0;
    const box = $('chatMentionBox');
    if (box) box.classList.add('hidden');
  }
  function pickMention(i) {
    const it = S.mention.items[i];
    const input = $('chatInput');
    if (!it || !input) return;
    const caret = input.selectionStart || 0;
    const insert = `@${it.user.name} `;
    input.value = input.value.slice(0, S.mention.start) + insert + input.value.slice(caret);
    const pos = S.mention.start + insert.length;
    input.setSelectionRange(pos, pos);
    closeMention();
    autosize();
    updateComposerButtons();
    input.focus();
  }

  // ---------- эмодзи ----------
  function toggleEmoji() {
    const panel = $('chatEmojiPanel');
    if (!panel) return;
    if (!panel.dataset.ready) {
      panel.innerHTML = `<div class="grid grid-cols-8 gap-0.5">${EMOJI_PANEL.map((e) => `<button type="button" data-emoji-insert="${e}" class="h-9 text-xl rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">${e}</button>`).join('')}</div>
        <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          ${Object.entries(LEGACY_STICKERS).map(([name, cls]) => `<button type="button" data-sticker="${name}" class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Отправить стикер">${icon(name, `w-6 h-6 ${cls}`)}</button>`).join('')}
        </div>`;
      panel.dataset.ready = '1';
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: panel });
    }
    panel.classList.toggle('hidden');
  }
  function closeEmoji() { const p = $('chatEmojiPanel'); if (p) p.classList.add('hidden'); }

  // ---------- вложения ----------
  function handleAttachment(e) {
    const target = e && e.target;
    const file = target && target.files && target.files[0];
    if (target && 'value' in target) { try { target.value = ''; } catch (err) { /* объект-заглушка */ } }
    if (isLocalBoard) {
      return showSystemToast('Ограничение', 'Вложения доступны только в облачных проектах.', 'shield-alert', 'text-amber-500', 'bg-amber-50');
    }
    if (!file) return;
    if (file.type.startsWith('image/')) { uploadImage(file); return; }
    if (file.size > MAX_CHAT_FILE_BYTES) {
      return showSystemToast('Лимит превышен', 'Файл слишком большой. Максимум 700 КБ.', 'alert-circle', 'text-red-500', 'bg-red-50');
    }
    window.pendingChatFile = file;
    const el = $('fileTypeModal');
    if (el) { el.classList.remove('hidden'); setTimeout(() => el.classList.remove('opacity-0'), 10); }
  }

  async function uploadImage(file) {
    if (!navigator.onLine) {
      return showSystemToast('Офлайн', 'Отправка картинок недоступна без интернета.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
    }
    if (file.size > 16 * 1024 * 1024) return showSystemToast('Лимит превышен', 'Картинка больше 16 МБ.', 'alert-circle', 'text-red-500', 'bg-red-50');
    const id = S.chatCol.doc().id;
    const preview = URL.createObjectURL(file);
    const replyTo = S.replyTo;
    S.replyTo = null;
    hideReplyBar();
    S.uploads.set(id, { kind: 'image', name: file.name, preview, ts: Date.now() });
    render({ toBottom: true });
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data || !data.success) throw new Error('Не удалось загрузить картинку.');
      S.uploads.delete(id);
      if (replyTo) S.replyTo = replyTo;
      writeMessage(id, buildPayload({ attachment: { type: 'image', url: data.data.url, name: file.name } }));
    } catch (err) {
      S.uploads.delete(id);
      render();
      showSystemToast('Ошибка', (err && err.message) || 'Не удалось загрузить картинку.', 'alert-circle', 'text-red-500', 'bg-red-50');
    } finally {
      setTimeout(() => URL.revokeObjectURL(preview), 30000);
    }
  }

  async function confirmFile(retentionType) {
    if (retentionType === 'burn' && userPlan !== 'pro' && userPlan !== 'infinity') {
      if (typeof closeFileTypeModal === 'function') closeFileTypeModal();
      return showSystemToast('Функция тарифа Company', 'Сгорающие файлы доступны на тарифе Company и выше.', 'lock', 'text-amber-500', 'bg-amber-50');
    }
    const file = window.pendingChatFile;
    window.pendingChatFile = null;
    if (!file) return;
    if (typeof closeFileTypeModal === 'function') closeFileTypeModal();
    const id = S.chatCol.doc().id;
    const size = `${(file.size / 1024).toFixed(1)} KB`;
    S.uploads.set(id, { kind: 'file', name: file.name, size, ts: Date.now() });
    render({ toBottom: true });
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      let expiresAt = null;
      if (retentionType === '1day') expiresAt = Date.now() + 864e5;
      if (retentionType === '7days') expiresAt = Date.now() + 7 * 864e5;
      S.uploads.delete(id);
      writeMessage(id, buildPayload({ attachment: { type: 'file', url: base64, name: file.name, size, retention: retentionType, expiresAt } }));
    } catch (err) {
      S.uploads.delete(id);
      render();
      showSystemToast('Ошибка', 'Не удалось обработать файл.', 'alert-circle', 'text-red-500', 'bg-red-50');
    }
  }

  function downloadAndBurn(id) {
    const m = S.byId.get(id);
    if (!m || !m.data.attachment) return;
    const url = safeUrl(m.data.attachment.url, { allowData: true });
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = String(m.data.attachment.name || 'file');
    document.body.appendChild(a);
    a.click();
    a.remove();
    S.chatCol.doc(id).delete().catch(() => {});
  }

  // ---------- действия с сообщениями ----------
  function deleteMessage(id) {
    const run = () => S.chatCol.doc(id).delete().catch(() => showSystemToast('Ошибка', 'Не удалось удалить сообщение.', 'alert-circle', 'text-red-500', 'bg-red-50'));
    if (typeof openConfirmModal === 'function') openConfirmModal('Удалить сообщение?', 'Сообщение исчезнет у всех участников.', 'Удалить', true, run);
    else run();
  }
  function jumpTo(id) {
    const row = $(`msg_${id}`);
    if (!row) return showSystemToast('Сообщение не загружено', 'Нажмите «Показать предыдущие сообщения» вверху чата.', 'info', 'text-blue-500', 'bg-blue-50');
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
  }

  function onMessagesClick(e) {
    const actEl = e.target.closest('[data-act]');
    const row = e.target.closest('.chat-row');
    const id = row && row.getAttribute('data-id');
    if (actEl) {
      const act = actEl.getAttribute('data-act');
      e.preventDefault();
      if (act === 'more') { S.limit += PAGE_SIZE; S.keepOffsetOnce = true; subscribeMessages(); return; }
      if (!id) return;
      if (act === 'picker') { S.pickerFor = S.pickerFor === id ? null : id; S.activeRowId = id; render({ noScroll: true }); return; }
      if (act === 'react') { S.activeRowId = null; react(id, actEl.getAttribute('data-emoji')); return; }
      if (act === 'reply') { S.activeRowId = null; S.pickerFor = null; render({ noScroll: true }); startReply(id); return; }
      if (act === 'edit') { S.activeRowId = null; render({ noScroll: true }); startEdit(id); return; }
      if (act === 'copy') {
        const m = S.byId.get(id);
        if (m && navigator.clipboard) navigator.clipboard.writeText(m.data.text || '').then(() => showSystemToast('Скопировано', 'Текст сообщения в буфере обмена.', 'copy', 'text-blue-500', 'bg-blue-50'));
        S.activeRowId = null; render({ noScroll: true });
        return;
      }
      if (act === 'delete') { S.activeRowId = null; render({ noScroll: true }); deleteMessage(id); return; }
      if (act === 'jump') { jumpTo(actEl.getAttribute('data-target')); return; }
      if (act === 'image') { const src = actEl.getAttribute('src'); if (src) window.open(src, '_blank', 'noopener'); return; }
      if (act === 'burn') { downloadAndBurn(id); return; }
      if (act === 'retry') {
        const payload = S.failed.get(id);
        if (payload) { S.failed.delete(id); render(); writeMessage(id, payload); }
        return;
      }
      if (act === 'discard') { S.failed.delete(id); render(); return; }
      return;
    }
    if (e.target.closest('a')) return;
    // Нажатие на сообщение (телефон): показать панель действий
    if (row && !row.classList.contains('failed')) {
      const same = S.activeRowId === id;
      S.activeRowId = same ? null : id;
      if (S.pickerFor) { S.pickerFor = null; render({ noScroll: true }); return; }
      $('chatMessages').querySelectorAll('.chat-row.is-active').forEach((el) => el.classList.remove('is-active'));
      if (!same) row.classList.add('is-active');
    } else if (S.activeRowId || S.pickerFor) {
      S.activeRowId = null; S.pickerFor = null; render({ noScroll: true });
    }
  }

  // ---------- открыть чат ----------
  function openChat() {
    if (!isChatOpen() && typeof window.toggleChat === 'function') window.toggleChat();
  }
  function onOpened() {
    unlockAudio();
    renderNotifyButtons();
    renderPresence();
    const box = $('chatMessages');
    if (box) {
      // Разделитель «Новые сообщения» показываем с того места, где остановились
      S.unreadAnchor = unreadCount() ? S.lastReadTs : 0;
      render({ toBottom: true });
      const divider = box.querySelector('[data-key="unread_divider"]');
      if (divider) divider.scrollIntoView({ block: 'start' });
    }
    setTimeout(() => { markRead(); if (window.matchMedia('(pointer: fine)').matches) focusInput(); }, 60);
  }

  // ---------- голосовой ввод ----------
  let recognition = null;
  let listening = false;
  function toggleVoice() {
    if (isLocalBoard) return showSystemToast('Офлайн', 'Голосовой ввод недоступен в локальных досках.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
    const micBtn = $('chatMicBtn');
    const input = $('chatInput');
    if (listening && recognition) { recognition.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return showSystemToast('Не поддерживается', 'Голосовой ввод не поддерживается этим браузером.', 'mic-off', 'text-red-500', 'bg-red-50');
    recognition = new SR();
    recognition.lang = 'ru-RU';
    recognition.interimResults = true;
    const initial = input.value ? `${input.value} ` : '';
    recognition.onstart = () => { listening = true; micBtn.classList.add('text-red-500', 'animate-pulse'); };
    recognition.onresult = (event) => {
      let t = '';
      for (let i = event.resultIndex; i < event.results.length; i++) t += event.results[i][0].transcript;
      input.value = initial + t;
      autosize();
    };
    recognition.onend = () => {
      listening = false;
      micBtn.classList.remove('text-red-500', 'animate-pulse');
      updateComposerButtons();
    };
    try { recognition.start(); } catch (e) { console.error(e); }
  }

  // ---------- привязка к DOM ----------
  function bindDom() {
    injectStyles();
    const input = $('chatInput');
    const box = $('chatMessages');
    if (!input || !box || input.dataset.bound) return;
    input.dataset.bound = '1';
    const coarse = window.matchMedia('(pointer: coarse)').matches;

    input.addEventListener('keydown', (e) => {
      if (S.mention.open) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const n = S.mention.items.length;
          S.mention.index = (S.mention.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
          updateMention();
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(S.mention.index); return; }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMention(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !coarse) { e.preventDefault(); send(); return; }
      if (e.key === 'Escape' && (S.replyTo || S.editingId)) { e.preventDefault(); e.stopPropagation(); cancelCompose(); return; }
      if (e.key === 'ArrowUp' && !input.value) {
        const lastMine = [...S.messages].reverse().find((m) => m.data.user && m.data.user.id === myId() && m.data.text && !m.data.sticker);
        if (lastMine) { e.preventDefault(); startEdit(lastMine.id); }
      }
    });
    input.addEventListener('input', () => {
      autosize();
      updateComposerButtons();
      updateMention();
      if (input.value.trim() && !S.editingId) onTyping();
    });
    input.addEventListener('click', updateMention);
    input.addEventListener('blur', () => setTimeout(closeMention, 150));
    input.addEventListener('paste', (e) => {
      const files = e.clipboardData && e.clipboardData.files;
      if (files && files.length && files[0].type.startsWith('image/')) {
        e.preventDefault();
        handleAttachment({ target: { files: [files[0]] } });
      }
    });

    box.addEventListener('click', onMessagesClick);
    box.addEventListener('dblclick', (e) => {
      const row = e.target.closest('.chat-row');
      if (!row || e.target.closest('[data-act],a') || row.classList.contains('failed')) return;
      const id = row.getAttribute('data-id');
      if (S.byId.has(id) && !myReaction(S.byId.get(id).data)) react(id, '❤️');
    });
    box.addEventListener('scroll', () => { updateScrollButton(); if (box.scrollHeight - box.scrollTop - box.clientHeight < 60) markRead(); }, { passive: true });

    const mention = $('chatMentionBox');
    if (mention) mention.addEventListener('mousedown', (e) => { const b = e.target.closest('[data-mention]'); if (b) { e.preventDefault(); pickMention(Number(b.getAttribute('data-mention'))); } });
    const emoji = $('chatEmojiPanel');
    if (emoji) {
      emoji.addEventListener('click', (e) => {
        const ins = e.target.closest('[data-emoji-insert]');
        if (ins) { insertAtCaret(ins.getAttribute('data-emoji-insert')); return; }
        const st = e.target.closest('[data-sticker]');
        if (st) sendSticker(st.getAttribute('data-sticker'));
      });
    }
    document.addEventListener('click', (e) => {
      if (!document.body.contains(e.target)) return; // узел уже перерисован
      const panel = $('chatEmojiPanel');
      if (panel && !panel.classList.contains('hidden') && !e.target.closest('#chatEmojiPanel,#chatEmojiBtn')) closeEmoji();
      if ((S.activeRowId || S.pickerFor) && !e.target.closest('#chatMessages')) { S.activeRowId = null; S.pickerFor = null; render({ noScroll: true }); }
    });
    ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAudio, { once: true, passive: true }));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'blocko-open-chat' && (!e.data.boardId || e.data.boardId === BOARD_ID)) openChat();
      });
    }

    if (typeof isLocalBoard !== 'undefined' && isLocalBoard) {
      input.disabled = true;
      input.placeholder = 'Чат доступен в облачных проектах';
      box.innerHTML = `<div class="flex-1 flex flex-col items-center justify-center text-center py-12 px-6 text-gray-400">
        <div class="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">${icon('cloud-off', 'w-6 h-6')}</div>
        <p class="text-sm font-medium text-gray-600 dark:text-gray-300">Это локальная доска</p>
        <p class="text-xs mt-1">Чат команды работает в облачных проектах.</p></div>`;
      ['chatSendBtn', 'chatMicBtn', 'chatEmojiBtn', 'chatAttachBtn'].forEach((bid) => { const b = $(bid); if (b) { b.setAttribute('disabled', ''); b.classList.add('opacity-40', 'pointer-events-none'); } });
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: box });
    }
    updateComposerButtons();
    renderNotifyButtons();
    renderPresence();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindDom);
  else bindDom();

  // ---------- публичный API ----------
  window.BlockoChat = {
    init, send, sendSticker, react, onOpened, openChat, refreshTitle,
    toggleNotifications, toggleSound, closeNotifyBanner, toggleEmoji, cancelCompose,
    scrollToBottom: () => { const box = $('chatMessages'); if (box) { box.scrollTop = box.scrollHeight; markRead(); } },
    _state: S,
  };

  // Совместимость со старыми вызовами из board.html
  window.initChatListener = init;
  window.sendChatMessage = send;
  window.sendChatSticker = sendSticker;
  window.toggleMessageLike = (id) => react(id, '❤️');
  window.handleChatAttachment = handleAttachment;
  window.confirmFileUpload = confirmFile;
  window.uploadImageToImgbb = uploadImage;
  window.downloadAndBurn = downloadAndBurn;
  window.toggleChatVoiceInput = toggleVoice;
})();
