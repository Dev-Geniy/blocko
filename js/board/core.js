// ==========================================
// Blocko Pro · доска — core.js
// Старт страницы, Markdown, сеть, поиск, горячие клавиши, drag&drop
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// Выполнить fn, когда все синхронные скрипты страницы отработали (DOMContentLoaded)
function whenScriptsLoaded(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

if (localStorage.getItem('theme') === 'light') document.documentElement.classList.remove('dark');
lucide.createIcons();

// ЭНТЕРПРАЙЗ: Регистрация Service Worker для агрессивного кэширования медиа (ImgBB)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Reg Failed:', err));
  });
}

// ЭНТЕРПРАЙЗ БЕЗОПАСНОСТЬ: Защита от BFCache (Сброс стейта при возврате кнопкой "Назад" для предотвращения утечки данных без пароля)
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});
// ЭНТЕРПРАЙЗ: Продвинутый движок рендеринга Markdown с внедрением UI-компонентов Tailwind
if (typeof marked !== 'undefined') {
  const renderer = new marked.Renderer();
  
  // 1. Премиальные интерактивные ссылки с обрезкой (Truncation) и анимациями
  renderer.link = function(href, title, text) {
    href = esc(safeUrl(href) || '#'); title = esc(title || '');
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" title="${title || href}" class="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-0.5 mb-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl font-bold no-underline hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:scale-[1.03] active:scale-95 transition-all shadow-sm border border-blue-100/50 dark:border-blue-800/30 align-middle max-w-full"><svg class="w-3.5 h-3.5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg><span class="truncate max-w-[150px] sm:max-w-[250px] inline-block align-bottom">${text}</span></a>`;
  };

  // 2. Иерархия заголовков (Градиенты и разделители)
  renderer.heading = function(text, level) {
    if (level === 1) {
      return `<h1 class="text-3xl sm:text-4xl font-black mt-8 mb-5 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-500 dark:from-white dark:to-gray-400 leading-tight">${text}</h1>`;
    } else if (level === 2) {
      return `<h2 class="text-xl sm:text-2xl font-extrabold mt-8 mb-4 text-gray-800 dark:text-gray-100 border-b border-gray-200/50 dark:border-gray-700/50 pb-2">${text}</h2>`;
    } else {
      return `<h${level} class="text-lg font-bold mt-6 mb-3 text-gray-700 dark:text-gray-300 flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div>${text}</h${level}>`;
    }
  };

  // 3. Элегантные цитаты
  renderer.blockquote = function(quote) {
    return `<blockquote class="relative p-5 my-6 bg-indigo-50/50 dark:bg-indigo-900/10 border-l-4 border-indigo-500 rounded-r-2xl italic text-gray-700 dark:text-gray-300 shadow-sm"><svg class="absolute top-4 right-4 w-10 h-10 text-indigo-500/10 dark:text-indigo-400/10 rotate-180 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.999v2H14c-1 0-2 .008-2 1.031V20c0 1 0 1 1 1z"></path></svg><div class="relative z-10">${quote}</div></blockquote>`;
  };

  // 4. Mac-Style блоки кода
  renderer.code = function(code, language) {
    return `<div class="relative my-6 group"><div class="absolute top-0 left-0 w-full h-8 bg-gray-800 dark:bg-black/60 rounded-t-2xl flex items-center px-4 gap-1.5 border-b border-white/10 z-10"><div class="w-2.5 h-2.5 rounded-full bg-red-500/80 shadow-sm"></div><div class="w-2.5 h-2.5 rounded-full bg-amber-500/80 shadow-sm"></div><div class="w-2.5 h-2.5 rounded-full bg-green-500/80 shadow-sm"></div><span class="ml-2 text-[10px] font-mono text-gray-400 font-bold uppercase">${language || 'Code'}</span></div><pre class="bg-gray-900 dark:bg-black pt-12 pb-5 px-5 rounded-2xl overflow-x-auto shadow-xl border border-gray-800/50"><code class="text-sm font-mono text-gray-300 leading-relaxed">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre></div>`;
  };

  // 5. Выделение инлайн-кода
  renderer.codespan = function(text) {
    return `<code class="px-1.5 py-0.5 mx-0.5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-mono text-[0.85em] font-bold rounded-md border border-rose-100/50 dark:border-rose-800/30">${text}</code>`;
  };

  // 6. Списки с кастомными буллитами (Векторные шевроны)
  let listDepth = 0;
  renderer.list = function(body, ordered, start) {
    const type = ordered ? 'ol' : 'ul';
    const classes = ordered ? 'list-decimal list-inside space-y-2 mb-6 ml-2 marker:text-blue-500 marker:font-black' : 'space-y-2 mb-6';
    return `<${type} class="${classes}">${body}</${type}>`;
  };

  renderer.listitem = function(text, task, checked) {
    if (task) {
      return `<li class="flex items-start gap-3 my-2 bg-gray-50/50 dark:bg-gray-800/30 p-2 rounded-xl"><div class="mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors ${checked ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 shadow-inner'}">${checked ? '<svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>' : ''}</div><span class="${checked ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}">${text.replace(/<input.*?>/, '')}</span></li>`;
    }
    // Если это ненумерованный список (ul)
    if (!text.match(/^\d+\./)) {
       return `<li class="flex items-start gap-2.5 my-1.5"><svg class="w-4 h-4 text-blue-500 flex-shrink-0 mt-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg><span class="text-gray-700 dark:text-gray-200 leading-relaxed">${text}</span></li>`;
    }
    return `<li class="text-gray-700 dark:text-gray-200 pl-1 mb-1.5">${text}</li>`;
  };

  renderer.strong = function(text) {
     return `<strong class="font-extrabold text-gray-900 dark:text-white bg-blue-50 dark:bg-blue-900/30 px-1 rounded-sm">${text}</strong>`;
  }

  marked.setOptions({
    renderer: renderer,
    breaks: true,
    gfm: true
  });
}
// --- ENTERPRISE NETWORK OBSERVER (OFFLINE-FIRST) ---
function updateBoardStatusBadge() {
  const badge = document.getElementById('boardStatusBadge');
  if (!badge) return;
  
  const isOnline = navigator.onLine;
  let dotColor, textColor, text, ping, icon, bgWrapper;
  
  if (isLocalBoard) {
    // Офлайн-доска (Device) - Статичный серый
    dotColor = 'bg-gray-400 dark:bg-gray-500';
    textColor = 'text-gray-600 dark:text-gray-400';
    bgWrapper = 'bg-gray-100 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/80 shadow-sm';
    text = 'Офлайн';
    ping = false;
    icon = 'hard-drive';
  } else {
    // Облачная доска (Cloud)
    if (isOnline) {
      // Онлайн - Пульсирующий изумрудный
      dotColor = 'bg-emerald-500';
      textColor = 'text-emerald-700 dark:text-emerald-400';
      bgWrapper = 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 shadow-sm';
      text = 'Онлайн';
      ping = true;
      icon = 'cloud';
    } else {
      // Потеря связи - Статичный желтый
      dotColor = 'bg-amber-500';
      textColor = 'text-amber-700 dark:text-amber-400';
      bgWrapper = 'bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 shadow-sm';
      text = 'Нет сети';
      ping = false;
      icon = 'wifi-off';
    }
  }
  
  badge.className = `flex items-center gap-1.5 px-2.5 py-1 ${bgWrapper} rounded-lg transition-all select-none cursor-help hover:scale-105 active:scale-95 whitespace-nowrap`;
  badge.innerHTML = `
    <span class="relative flex h-2 w-2">
      ${ping ? `<span class="animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75"></span>` : ''}
      <span class="relative inline-flex rounded-full h-2 w-2 ${dotColor}"></span>
    </span>
    <span class="text-[9px] font-black uppercase tracking-widest ${textColor} flex items-center gap-1"><i data-lucide="${esc(icon)}" class="w-3 h-3"></i> <span class="hidden sm:inline">${text}</span></span>
  `;
  lucide.createIcons({ root: badge });
}

window.addEventListener('online', () => {
  showSystemToast('Подключение восстановлено', 'Синхронизация с облаком возобновлена.', 'wifi', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/30');
  updateBoardStatusBadge();
});

window.addEventListener('offline', () => {
  showSystemToast('Отсутствует интернет', 'Вы работаете в офлайн-режиме. Данные сохранятся локально.', 'wifi-off', 'text-amber-500', 'bg-amber-50 dark:bg-amber-900/30');
  updateBoardStatusBadge();
});

// --- 1. ОПТИМИЗАЦИЯ ПОИСКА (Debounce) ---
function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}
const debouncedSearch = debounce(() => render());

// --- 2. ГОРЯЧИЕ КЛАВИШИ ---
document.addEventListener('keydown', (e) => {
  // Ctrl+Z -> Отмена удаления (Undo)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (window.pendingUndoAction) {
      e.preventDefault();
      window.pendingUndoAction();
      window.pendingUndoAction = null;
      document.getElementById('globalToast').classList.add('translate-y-24', 'opacity-0');
    }
  }
  // Ctrl+K -> Поиск
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('boardSearch').focus();
  }
  // Ctrl+Enter -> Сохранить карточку
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const editModal = document.getElementById('editCardModal');
    if (!editModal.classList.contains('hidden')) saveCard();
  }
  // N -> Быстрая задача (если модалки закрыты и мы не печатаем текст)
  if (e.key && e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT' && !e.target.isContentEditable) {
    const activeModals = document.querySelectorAll('.glass-modal:not(.hidden)');
    const spaceCols = getSpaceColumns();
    if (activeModals.length === 0 && spaceCols.length > 0) quickAddCard(spaceCols[0].id);
  }
});

// --- 3. MARKDOWN HELPER & VOICE DICTATION ---
function insertMarkdown(prefix, suffix) {
  const textarea = document.getElementById('editDescription');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);
  
  textarea.value = text.substring(0, start) + prefix + selected + suffix + text.substring(end);
  
  textarea.focus();
  const newCursorPos = start + prefix.length + selected.length;
  textarea.setSelectionRange(newCursorPos, newCursorPos);
  
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

let descSpeechRecognition = null;
let isDescListening = false;

function toggleDescVoiceInput() {
  if (isLocalBoard) return showSystemToast('Офлайн', 'Голосовой ввод недоступен без интернета.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
  
  const micBtn = document.getElementById('descMicBtn');
  const input = document.getElementById('editDescription');
  
  if (isDescListening && descSpeechRecognition) {
    descSpeechRecognition.stop();
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return showSystemToast('Ошибка', 'Голосовой ввод не поддерживается вашим браузером.', 'mic-off', 'text-red-500', 'bg-red-50');
  }
  
  descSpeechRecognition = new SpeechRecognition();
  descSpeechRecognition.lang = 'ru-RU';
  descSpeechRecognition.interimResults = true;
  
  const initialText = input.value ? input.value + (input.value.endsWith(' ') || input.value.endsWith('\n') ? '' : ' ') : '';
  
  descSpeechRecognition.onstart = () => {
    isDescListening = true;
    micBtn.classList.remove('text-gray-400', 'bg-white', 'dark:bg-gray-800');
    micBtn.classList.add('text-red-500', 'bg-red-50', 'dark:bg-red-900/20', 'animate-pulse', 'border-red-200', 'dark:border-red-800');
  };
  
  descSpeechRecognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    input.value = initialText + transcript;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  
  descSpeechRecognition.onend = () => {
    isDescListening = false;
    micBtn.classList.add('text-gray-400', 'bg-white', 'dark:bg-gray-800');
    micBtn.classList.remove('text-red-500', 'bg-red-50', 'dark:bg-red-900/20', 'animate-pulse', 'border-red-200', 'dark:border-red-800');
  };
  
  try { descSpeechRecognition.start(); } catch (e) { console.error(e); }
}

// --- 4. ГЛОБАЛЬНЫЙ DRAG AND DROP ---
let dragCounter = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1) document.getElementById('dropOverlay').classList.remove('hidden');
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) document.getElementById('dropOverlay').classList.add('hidden');
});

window.addEventListener('dragover', (e) => e.preventDefault());

window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragCounter = 0;
  document.getElementById('dropOverlay').classList.add('hidden');
  
  const file = e.dataTransfer.files[0];
  if (!file) return;

  // Логика маршрутизации файла: куда он был сброшен
  const isChatOpen = !document.getElementById('chatSidebar').classList.contains('translate-x-full');
  if (isChatOpen) {
    // Если открыт чат — шлем в чат
    handleChatAttachment({ target: { files: [file] } });
  } 
  else if (!document.getElementById('editCardModal').classList.contains('hidden') && file.type.startsWith('image/')) {
    // Если открыта карточка и это картинка — ставим обложкой
    handleImageSelection(file);
  }
});
  
