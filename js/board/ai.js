// ==========================================
// Blocko Pro · доска — ai.js
// AI-ассистент и автопилот
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// ==========================================
// ЭНТЕРПРАЙЗ: Встроенный AI-Ассистент (Polinations Integration + Commands)
// ==========================================

function toggleAiSidebar() {
  if (window.event) window.event.stopPropagation();
  closeOtherSidebars('aiSidebar');
  const sidebar = document.getElementById('aiSidebar');
  sidebar.classList.toggle('translate-x-full');
  
  const btn = document.getElementById('aiFloatingBtn');
  if (!sidebar.classList.contains('translate-x-full')) {
    if(btn) btn.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => document.getElementById('aiChatInput').focus(), 100);
  } else {
    if(btn) btn.classList.remove('opacity-0', 'pointer-events-none');
  }
}

// ЭНТЕРПРАЙЗ: Интерактивный Onboarding по возможностям AI (Премиальные карточки)
function showAiHelp(type) {
  const chatBox = document.getElementById('aiChatMessages');
  let text = '';
  
  if (type === 'how_it_works') {
    text = `
      <div class="mb-3 flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-black tracking-wide uppercase text-[10px]"><i data-lucide="cpu" class="w-4 h-4"></i> Под капотом AI-Движка</div>
      <p class="mb-4 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">Я работаю на базе передовой NLP-модели, превращая ваши слова в реальные архитектурные объекты доски.</p>
      <div class="space-y-2.5 text-xs text-gray-600 dark:text-gray-300">
        <div class="flex items-start gap-3 bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800"><i data-lucide="mic" class="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0"></i> <div><b class="text-gray-800 dark:text-white">1. Захват контекста:</b> Вы произносите команду голосом или пишете текст в чат.</div></div>
        <div class="flex items-start gap-3 bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800"><i data-lucide="brain-circuit" class="w-4 h-4 mt-0.5 text-purple-500 flex-shrink-0"></i> <div><b class="text-gray-800 dark:text-white">2. Анализ намерений:</b> Нейросеть разбивает сложный запрос на атомарные технические команды.</div></div>
        <div class="flex items-start gap-3 bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800"><i data-lucide="mouse-pointer-click" class="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0"></i> <div><b class="text-gray-800 dark:text-white">3. Генерация:</b> В чате появляются умные кнопки для безопасного создания/изменения объектов.</div></div>
        <div class="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-900/20 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-800/50"><i data-lucide="zap" class="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0"></i> <div><b class="text-emerald-700 dark:text-emerald-400">4. Автопилот (Auto-Mode):</b> Если тумблер <b>"АВТО"</b> включен, я пропускаю этап подтверждения кнопками и мгновенно перестраиваю доску в фоне!</div></div>
      </div>`;
  } else if (type === 'capabilities') {
    text = `
      <div class="mb-3 flex items-center gap-2 text-amber-600 dark:text-amber-400 font-black tracking-wide uppercase text-[10px]"><i data-lucide="star" class="w-4 h-4"></i> Мой арсенал возможностей</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-pink-300 transition-colors">
          <div class="font-bold text-xs flex items-center gap-1.5 mb-1.5 text-gray-900 dark:text-white"><i data-lucide="layout-template" class="w-3.5 h-3.5 text-pink-500"></i> Структура Доски</div>
          <div class="text-[10px] text-gray-500 leading-relaxed">Создание, удаление, перекрашивание и переименование колонок.</div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-blue-300 transition-colors">
          <div class="font-bold text-xs flex items-center gap-1.5 mb-1.5 text-gray-900 dark:text-white"><i data-lucide="layers" class="w-3.5 h-3.5 text-blue-500"></i> Задачи & Логистика</div>
          <div class="text-[10px] text-gray-500 leading-relaxed">Генерация карточек с чек-листами, умное перемещение карточек между этапами (UP, DOWN, TOP).</div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-purple-300 transition-colors">
          <div class="font-bold text-xs flex items-center gap-1.5 mb-1.5 text-gray-900 dark:text-white"><i data-lucide="bar-chart-3" class="w-3.5 h-3.5 text-purple-500"></i> Опросы & Таблицы</div>
          <div class="text-[10px] text-gray-500 leading-relaxed">Сбор мнений команды и генерация аналитических таблиц-сравнений Excel-формата.</div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-rose-300 transition-colors">
          <div class="font-bold text-xs flex items-center gap-1.5 mb-1.5 text-gray-900 dark:text-white"><i data-lucide="timer" class="w-3.5 h-3.5 text-rose-500"></i> Дедлайны & Ссылки</div>
          <div class="text-[10px] text-gray-500 leading-relaxed">Установка таймеров обратного отсчета и сохранение важных веб-закладок.</div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800 sm:col-span-2 hover:border-emerald-300 transition-colors">
          <div class="font-bold text-xs flex items-center gap-1.5 mb-1.5 text-gray-900 dark:text-white"><i data-lucide="image" class="w-3.5 h-3.5 text-emerald-500"></i> Дизайн и Глобальное управление</div>
          <div class="text-[10px] text-gray-500 leading-relaxed">Смена обоев доски, переименование всего проекта и удаление объектов без единого клика.</div>
        </div>
      </div>`;
  } else if (type === 'commands') {
    text = `
      <div class="mb-3 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-black tracking-wide uppercase text-[10px]"><i data-lucide="terminal" class="w-4 h-4"></i> Словарь Команд</div>
      <p class="mb-3 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">Произносите эти фразы в микрофон или пишите в чат. В режиме <b>Автопилота</b> они выполнятся мгновенно.</p>
      <div class="space-y-2">
        <div class="p-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
          <div class="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 mb-1 tracking-wider"><i data-lucide="plus-circle" class="w-3 h-3 inline pb-0.5"></i> Создание объектов</div>
          <div class="text-[11px] text-gray-700 dark:text-gray-300 font-mono leading-relaxed space-y-1">
            <div>💬 "Создай колонку [Имя]"</div>
            <div>💬 "Напиши задачу [Имя] и добавь чек-лист"</div>
            <div>💬 "Сделай таблицу [Тема]" / "Создай опрос [Вопрос]"</div>
          </div>
        </div>
        <div class="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
          <div class="text-[10px] font-black uppercase text-blue-700 dark:text-blue-400 mb-1 tracking-wider"><i data-lucide="move" class="w-3 h-3 inline pb-0.5"></i> Логистика (Перемещение)</div>
          <div class="text-[11px] text-gray-700 dark:text-gray-300 font-mono leading-relaxed space-y-1">
            <div>💬 "Перемести карточку [Имя] в колонку [Имя]"</div>
            <div>💬 "Сдвинь карточку [Имя] вверх / вниз / в начало"</div>
          </div>
        </div>
        <div class="p-2.5 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800/50">
          <div class="text-[10px] font-black uppercase text-red-700 dark:text-red-400 mb-1 tracking-wider"><i data-lucide="trash-2" class="w-3 h-3 inline pb-0.5"></i> Деструктивные команды</div>
          <div class="text-[11px] text-gray-700 dark:text-gray-300 font-mono leading-relaxed space-y-1">
            <div>💬 "Удали колонку [Имя]" (Потребует ответа "Да")</div>
            <div>💬 "Удали карточку [Имя]"</div>
          </div>
        </div>
        <div class="p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800/50">
          <div class="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 mb-1 tracking-wider"><i data-lucide="palette" class="w-3 h-3 inline pb-0.5"></i> Дизайн и Настройки</div>
          <div class="text-[11px] text-gray-700 dark:text-gray-300 font-mono leading-relaxed space-y-1">
            <div>💬 "Перекрась колонку [Имя] в [Цвет]"</div>
            <div>💬 "Переименуй проект в [Новое имя]"</div>
            <div>💬 "Смени обои проекта"</div>
          </div>
        </div>
      </div>`;
  }

  chatBox.innerHTML += `
    <div class="flex gap-3 mt-4 animate-fade-in-up">
      <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0 border border-indigo-200 dark:border-indigo-800/50 shadow-sm"><i data-lucide="bot" class="w-4 h-4 text-indigo-500"></i></div>
      <div class="bg-white dark:bg-gray-800 p-1 rounded-2xl text-sm text-gray-700 dark:text-gray-300 rounded-tl-sm w-full shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden">
        <div class="p-4">${text}</div>
      </div>
    </div>
  `;
  lucide.createIcons({ root: chatBox });
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ЭНТЕРПРАЙЗ: Контроллер Автопилота AI
let isAiAutoMode = localStorage.getItem('blocko_ai_auto') === 'true';

function toggleAiAutoMode() {
  isAiAutoMode = !isAiAutoMode;
  localStorage.setItem('blocko_ai_auto', isAiAutoMode);
  updateAiAutoModeUI();
  showSystemToast('Автопилот AI', isAiAutoMode ? 'Включен. AI будет выполнять задачи без подтверждения.' : 'Выключен. Задачи требуют подтверждения.', 'zap', isAiAutoMode ? 'text-emerald-500' : 'text-gray-500', isAiAutoMode ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-gray-50 dark:bg-gray-800');
}

function updateAiAutoModeUI() {
  const btn = document.getElementById('aiAutoModeBtn');
  if (!btn) return;
  if (isAiAutoMode) {
    btn.classList.add('text-emerald-600', 'bg-emerald-100', 'dark:text-emerald-400', 'dark:bg-emerald-900/50');
    btn.classList.remove('text-gray-500', 'hover:bg-indigo-100', 'hover:text-indigo-600', 'dark:hover:bg-indigo-900/50', 'dark:hover:text-indigo-400');
  } else {
    btn.classList.remove('text-emerald-600', 'bg-emerald-100', 'dark:text-emerald-400', 'dark:bg-emerald-900/50');
    btn.classList.add('text-gray-500', 'hover:bg-indigo-100', 'hover:text-indigo-600', 'dark:hover:bg-indigo-900/50', 'dark:hover:text-indigo-400');
  }
}

// Инициализация UI Автопилота при загрузке
setTimeout(updateAiAutoModeUI, 100);

async function sendAiMessage() {
  const input = document.getElementById('aiChatInput');
  const text = input.value.trim();
  if (!text) return;
  
  if (!navigator.onLine) return showSystemToast('Офлайн', 'AI недоступен без интернета.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
  if (!(await checkAILimit())) return;

  input.value = '';
  input.style.height = ''; 
  
  const chatBox = document.getElementById('aiChatMessages');
  
  // Отображаем сообщение пользователя
  chatBox.innerHTML += `
    <div class="flex gap-3 flex-row-reverse mt-2 animate-fade-in-up">
      ${getAvatarHTML(currentUser, 'w-8 h-8 flex-shrink-0')}
      <div class="bg-indigo-600 text-white shadow-md px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words max-w-[85%] rounded-tr-sm">
        ${esc(text)}
      </div>
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  // Показываем лоадер "Анализирую..."
  const loadId = 'ai_load_' + Date.now();
  chatBox.innerHTML += `
    <div id="${esc(loadId)}" class="flex gap-3 mt-4 animate-fade-in-up">
      <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0 border border-indigo-200 dark:border-indigo-800/50"><i data-lucide="sparkles" class="w-4 h-4 text-indigo-500 animate-pulse"></i></div>
      <div class="bg-gray-100 dark:bg-gray-800 px-4 py-2.5 rounded-2xl text-sm text-gray-500 dark:text-gray-400 rounded-tl-sm w-fit flex items-center gap-2 border border-gray-200/50 dark:border-gray-700/50">
        <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Анализирую...
      </div>
    </div>
  `;
  lucide.createIcons({ root: chatBox });
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    // ЭНТЕРПРАЙЗ: Ультимативный системный промпт с глобальным переименованием (Проект + Колонки)
    const systemPrompt = `Ты — гениальный AI-менеджер задач в системе Blocko Pro. 
Твоя цель: управлять доской (создавать, удалять, перемещать, менять дизайн и переименовывать объекты).

СТРОГОЕ ПРАВИЛО: Для любого действия ты ОБЯЗАН использовать технический код с разделителями "|||" и "END_ACTION".

Доступные форматы (Генерируй их точно):
1. СОЗДАТЬ ЗАДАЧУ: [BLOCKO_ACTION:TASK ||| Название задачи ||| Описание ||| END_ACTION]
2. ОПРОС: [BLOCKO_ACTION:POLL ||| Вопрос ||| Вариант 1, Вариант 2 ||| END_ACTION]
3. ТАБЛИЦА: [BLOCKO_ACTION:TABLE ||| Название ||| Кол1, Кол2 | Данные 1, Данные 2 ||| END_ACTION]
4. TODO СПИСОК: [BLOCKO_ACTION:TODO ||| Название ||| Пункт 1\nПункт 2 ||| END_ACTION]
5. ТАЙМЕР: [BLOCKO_ACTION:TIMER ||| Название ||| 2026-12-31T23:59 ||| END_ACTION]
6. СОЗДАТЬ КОЛОНКУ: [BLOCKO_ACTION:COLUMN ||| Название колонки ||| #6366f1 ||| END_ACTION]
7. УДАЛИТЬ КОЛОНКУ: [BLOCKO_ACTION:DELETE_COLUMN ||| Название колонки ||| Удаление ||| END_ACTION]
8. УДАЛИТЬ КАРТОЧКУ/ТАБЛИЦУ/ТАЙМЕР: [BLOCKO_ACTION:DELETE_CARD ||| Название карточки ||| Удаление ||| END_ACTION]
9. ПЕРЕМЕСТИТЬ КАРТОЧКУ: [BLOCKO_ACTION:MOVE_CARD ||| Точное название карточки ||| Название колонки (ИЛИ слова: UP, DOWN, TOP, BOTTOM) ||| END_ACTION]
10. ИЗМЕНИТЬ ЦВЕТ КОЛОНКИ: [BLOCKO_ACTION:CHANGE_COL_COLOR ||| Название колонки ||| #ff0000 ||| END_ACTION]
11. СМЕНИТЬ ОБОИ ПРОЕКТА: [BLOCKO_ACTION:CHANGE_BG ||| Обои ||| RANDOM ||| END_ACTION]
12. ПЕРЕИМЕНОВАТЬ ПРОЕКТ: [BLOCKO_ACTION:RENAME_BOARD ||| Новое название ||| Описание ||| END_ACTION]
13. ПЕРЕИМЕНОВАТЬ КОЛОНКУ: [BLOCKO_ACTION:RENAME_COLUMN ||| Старое название ||| Новое название ||| END_ACTION]

Отвечай кратко, профессионально. Запрос пользователя: `;
    
    const response = await fetch(`${AI_ENDPOINT}${encodeURIComponent(systemPrompt + text)}?model=openai`);
    let replyText = await response.text();
    
    document.getElementById(loadId)?.remove();

    // КРИТИЧЕСКИЙ ФИКС: Regex расширен для RENAME_BOARD и RENAME_COLUMN
    const actionRegex = /\[BLOCKO_ACTION:(TASK|POLL|LINK|TIMER|TABLE|TODO|COLUMN|DELETE_COLUMN|DELETE_CARD|MOVE_CARD|CHANGE_COL_COLOR|CHANGE_BG|RENAME_BOARD|RENAME_COLUMN)\s*\|\|\|\s*(.*?)\s*\|\|\|\s*([\s\S]*?)\s*\|\|\|\s*END_ACTION\]/g;
    const actions = [];
    
    replyText = replyText.replace(actionRegex, (fullMatch, type, title, data) => {
      const safeTitle = encodeURIComponent(title.trim());
      const safeData = encodeURIComponent(data.trim());
      actions.push({ type: type.trim(), title: title.trim(), safeTitle, safeData });
      return ''; 
    });

    let formattedText = sanitizeHTML(marked.parse(replyText.trim()));

    if (actions.length > 0) {
      if (isAiAutoMode) {
        // ЭНТЕРПРАЙЗ: РЕЖИМ АВТОПИЛОТА
        formattedText += `<div class="mt-4 flex flex-col gap-2 border-t border-emerald-200/50 dark:border-emerald-700/50 pt-4">
          <div class="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mb-1"><i data-lucide="zap" class="w-3.5 h-3.5"></i> Автопилот выполнил:</div>`;
        actions.forEach(act => {
          let labelText = esc(act.title);
          if (act.type === 'DELETE_COLUMN' || act.type === 'DELETE_CARD') labelText = `Удаление: ${esc(act.title)}`;
          if (act.type === 'MOVE_CARD') labelText = `Перемещение: ${esc(act.title)}`;
          if (act.type === 'RENAME_BOARD' || act.type === 'RENAME_COLUMN') labelText = `Переименование: ${esc(act.title)}`;
          
          formattedText += `<div class="text-[11px] text-gray-600 dark:text-gray-300 flex items-center gap-1.5 font-medium"><i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-500"></i> ${labelText}</div>`;
          setTimeout(() => aiExecuteAction(act.type, act.safeTitle, act.safeData, true), 100);
        });
        formattedText += `</div>`;
      } else {
        // ОБЫЧНЫЙ РЕЖИМ (Кнопки)
        formattedText += `<div class="mt-4 flex flex-col gap-2 border-t border-gray-200 dark:border-gray-700 pt-4">`;
        actions.forEach(act => {
          let icon = 'plus';
          let label = 'Выполнить действие';
          let colorClass = 'text-indigo-600 dark:text-indigo-400';
          let bgClass = 'bg-indigo-100 dark:bg-indigo-900/50';
          
          if (act.type === 'POLL') { icon = 'bar-chart-3'; label = 'Создать опрос'; colorClass = 'text-purple-600 dark:text-purple-400'; bgClass = 'bg-purple-100 dark:bg-purple-900/50'; }
          else if (act.type === 'LINK') { icon = 'link'; label = 'Добавить закладку'; colorClass = 'text-gray-600 dark:text-gray-400'; bgClass = 'bg-gray-100 dark:bg-gray-800'; }
          else if (act.type === 'TIMER') { icon = 'timer'; label = 'Поставить таймер'; colorClass = 'text-rose-600 dark:text-rose-400'; bgClass = 'bg-rose-100 dark:bg-rose-900/50'; }
          else if (act.type === 'TABLE') { icon = 'table'; label = 'Сгенерировать таблицу'; colorClass = 'text-blue-600 dark:text-blue-400'; bgClass = 'bg-blue-100 dark:bg-blue-900/50'; }
          else if (act.type === 'TODO') { icon = 'list-todo'; label = 'Быстрый список'; colorClass = 'text-cyan-600 dark:text-cyan-400'; bgClass = 'bg-cyan-100 dark:bg-cyan-900/50'; }
          else if (act.type === 'COLUMN') { icon = 'layout-template'; label = 'Создать колонку'; colorClass = 'text-pink-600 dark:text-pink-400'; bgClass = 'bg-pink-100 dark:bg-pink-900/50'; }
          else if (act.type === 'DELETE_COLUMN' || act.type === 'DELETE_CARD') { icon = 'trash-2'; label = 'Удалить объект'; colorClass = 'text-red-600 dark:text-red-400'; bgClass = 'bg-red-100 dark:bg-red-900/50'; }
          else if (act.type === 'MOVE_CARD') { icon = 'move'; label = 'Переместить карточку'; colorClass = 'text-blue-600 dark:text-blue-400'; bgClass = 'bg-blue-100 dark:bg-blue-900/50'; }
          else if (act.type === 'CHANGE_COL_COLOR') { icon = 'palette'; label = 'Сменить цвет'; colorClass = 'text-amber-600 dark:text-amber-400'; bgClass = 'bg-amber-100 dark:bg-amber-900/50'; }
          else if (act.type === 'CHANGE_BG') { icon = 'image'; label = 'Случайные обои'; colorClass = 'text-emerald-600 dark:text-emerald-400'; bgClass = 'bg-emerald-100 dark:bg-emerald-900/50'; }
          else if (act.type === 'RENAME_BOARD' || act.type === 'RENAME_COLUMN') { icon = 'edit-3'; label = 'Переименовать'; colorClass = 'text-violet-600 dark:text-violet-400'; bgClass = 'bg-violet-100 dark:bg-violet-900/50'; }

          formattedText += `
            <button onclick="aiExecuteAction(${jsArg(act.type)}, ${jsArg(act.safeTitle)}, ${jsArg(act.safeData)})" class="flex items-center gap-3 w-full text-left px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all shadow-sm hover:shadow-md group active:scale-95">
              <div class="${bgClass} p-2 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="${esc(icon)}" class="w-4 h-4 ${colorClass}"></i></div>
              <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5"><i data-lucide="zap" class="w-3 h-3 text-amber-500"></i> ${label}</div>
                <div class="text-[11px] text-gray-500 truncate font-medium mt-0.5">${esc(act.title)}</div>
              </div>
            </button>
          `;
        });
        formattedText += `</div>`;
      }
    }

    // Выводим финальный ответ AI
    chatBox.innerHTML += `
      <div class="flex gap-3 mt-4 animate-fade-in-up">
        <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0 border border-indigo-200 dark:border-indigo-800/50 shadow-sm"><i data-lucide="bot" class="w-4 h-4 text-indigo-500"></i></div>
        <div class="bg-white dark:bg-gray-800 px-5 py-4 rounded-2xl text-sm text-gray-700 dark:text-gray-300 rounded-tl-sm w-full prose dark:prose-invert prose-sm leading-relaxed max-w-none shadow-sm border border-gray-100 dark:border-gray-700/50">
          ${formattedText}
        </div>
      </div>
    `;

  } catch (err) {
    document.getElementById(loadId)?.remove();
    chatBox.innerHTML += `
      <div class="flex gap-3 mt-4 animate-fade-in-up">
        <div class="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0"><i data-lucide="alert-triangle" class="w-4 h-4 text-red-500"></i></div>
        <div class="bg-red-50 dark:bg-red-900/20 px-4 py-2.5 rounded-2xl text-sm text-red-600 dark:text-red-400 rounded-tl-sm">
          Ошибка соединения с нейросетью. Попробуй еще раз.
        </div>
      </div>
    `;
  }
  
  lucide.createIcons({ root: chatBox });
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Исполнитель команд от AI: Мульти-форматный диспетчер (с поддержкой Автопилота и Деструкции)
function aiExecuteAction(type, safeTitle, safeData, isAuto = false) {
  const myRole = boardData.users && boardData.users[currentUser.id] ? boardData.users[currentUser.id].role : 'editor';
  if (myRole === 'viewer' && !isLocalBoard) {
    if (!isAuto) showSystemToast('Отказ в доступе', 'Только редакторы могут изменять доску.', 'shield-alert', 'text-red-500', 'bg-red-50 dark:bg-red-900/20');
    return;
  }

  const title = decodeURIComponent(safeTitle);
  const data = decodeURIComponent(safeData);

  // --- КОНСТРУКТОР ДОСКИ И ДИЗАЙН ---
  if (type === 'RENAME_BOARD') {
    boardData.title = title;
    updateBoardData({ title: title }); // локально сразу перерисует заголовок
    if (!isAuto) { showSystemToast('Успех', `Доска переименована в "${title}"!`, 'edit-3', 'text-violet-500', 'bg-violet-50 dark:bg-violet-900/30'); toggleAiSidebar(); }
    return;
  }

  if (type === 'RENAME_COLUMN') {
    const col = columns.find(c => c.name.toLowerCase() === title.toLowerCase());
    if (!col) return !isAuto && showSystemToast('Ошибка', `Колонка "${title}" не найдена.`, 'alert-circle', 'text-red-500', 'bg-red-50 dark:bg-red-900/20');
    col.name = data.trim();
    persist(); render();
    if (!isAuto) { showSystemToast('Успех', `Колонка переименована в "${col.name}".`, 'edit-3', 'text-violet-500', 'bg-violet-50 dark:bg-violet-900/30'); toggleAiSidebar(); }
    return;
  }

  if (type === 'CHANGE_BG') {
    setRandomBackground();
    if (!isAuto) { showSystemToast('Успех', 'Обои проекта изменены!', 'image', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/30'); toggleAiSidebar(); }
    return;
  }

  if (type === 'CHANGE_COL_COLOR') {
    const col = columns.find(c => c.name.toLowerCase() === title.toLowerCase());
    if (!col) return !isAuto && showSystemToast('Ошибка', `Колонка "${title}" не найдена.`, 'alert-circle', 'text-red-500', 'bg-red-50 dark:bg-red-900/20');
    const colorMatch = data.match(/#[0-9A-Fa-f]{6}/i);
    if (colorMatch) col.color = hexToColorKey(colorMatch[0]);
    persist(); render();
    if (!isAuto) { showSystemToast('Успех', `Цвет колонки изменен.`, 'palette', 'text-amber-500', 'bg-amber-50 dark:bg-amber-900/30'); toggleAiSidebar(); }
    return;
  }

  if (type === 'COLUMN') {
    const newColId = 'col_' + Date.now();
    const colorMatch = data.match(/#[0-9A-Fa-f]{6}/i);
    const colColor = colorMatch ? hexToColorKey(colorMatch[0]) : 'purple'; 
    columns.push({ id: newColId, name: title, color: colColor, sortBy: 'manual', spaceId: currentSpaceId, cards: [] });
    persist(); render();
    if (!isAuto) { if(typeof fireConfetti === 'function') fireConfetti(); showSystemToast('Успех', `Колонка создана!`, 'layout-template', 'text-pink-500', 'bg-pink-50 dark:bg-pink-900/30'); toggleAiSidebar(); }
    return; 
  }

  // --- ДЕСТРУКТОР (Удаление) ---
  if (type === 'DELETE_COLUMN') {
    const col = columns.find(c => c.name.toLowerCase() === title.toLowerCase());
    if (!col) return !isAuto && showSystemToast('Ошибка', `Колонка "${title}" не найдена.`, 'alert-circle', 'text-red-500', 'bg-red-50 dark:bg-red-900/20');
    
    // ВСЕГДА запрашиваем подтверждение для удаления колонки, даже в Авторежиме!
    openConfirmModal(`Удалить колонку "${col.name}"?`, 'AI запрашивает разрешение на удаление. Вы можете сказать "Да" или "Нет" в микрофон.', 'Удалить', true, () => {
      columns = columns.filter(c => c.id !== col.id);
      persist(); render();
      purgeCloudCards([col.id]);
      showSystemToast('Уничтожено', `Колонка удалена.`, 'trash-2', 'text-red-500', 'bg-red-50 dark:bg-red-900/20');
    });
    if (!isAuto) toggleAiSidebar();
    return;
  }

  if (type === 'DELETE_CARD') {
    const card = allCards.find(c => c.title.toLowerCase() === title.toLowerCase());
    if (!card) return !isAuto && showSystemToast('Ошибка', `Объект "${title}" не найден.`, 'alert-circle', 'text-red-500', 'bg-red-50 dark:bg-red-900/20');
    
    if (isLocalBoard) {
      columns.forEach(col => { if(col.cards) col.cards = col.cards.filter(c => c.id !== card.id); });
      persist(); render();
    } else {
      db.collection("boards").doc(BOARD_ID).collection("cards").doc(String(card.id)).delete();
    }
    if (!isAuto) { showSystemToast('Уничтожено', `Объект удален.`, 'trash-2', 'text-red-500', 'bg-red-50 dark:bg-red-900/20'); toggleAiSidebar(); }
    return;
  }

  // --- ЛОГИСТИКА (Перемещение) ---
  if (type === 'MOVE_CARD') {
    const card = allCards.find(c => c.title.toLowerCase() === title.toLowerCase());
    if (!card) return !isAuto && showSystemToast('Ошибка', `Карточка "${title}" не найдена.`, 'alert-circle', 'text-red-500', 'bg-red-50 dark:bg-red-900/20');
    
    const targetAction = data.trim().toUpperCase();
    let targetColId = card.columnId;
    let newOrder = card.order;
    const colCards = allCards.filter(c => c.columnId === targetColId).sort((a,b) => a.order - b.order);
    const currIdx = colCards.findIndex(c => c.id === card.id);

    if (targetAction === 'UP' && currIdx > 0) newOrder = colCards[currIdx - 1].order - 1;
    else if (targetAction === 'DOWN' && currIdx < colCards.length - 1) newOrder = colCards[currIdx + 1].order + 1;
    else if (targetAction === 'TOP') newOrder = (colCards[0]?.order || 0) - 1000;
    else if (targetAction === 'BOTTOM') newOrder = (colCards[colCards.length - 1]?.order || 0) + 1000;
    else {
      const destCol = columns.find(c => c.name.toLowerCase() === data.trim().toLowerCase());
      if (destCol) {
        targetColId = destCol.id;
        const destColCards = allCards.filter(c => c.columnId === targetColId).sort((a,b) => a.order - b.order);
        newOrder = destColCards.length > 0 ? destColCards[destColCards.length - 1].order + 1000 : 0;
      }
    }

    if (isLocalBoard) {
      let srcCol = columns.find(c => c.id === card.columnId);
      let dstCol = columns.find(c => c.id === targetColId);
      if (srcCol && dstCol) {
        const cObj = srcCol.cards.find(c => c.id === card.id);
        srcCol.cards = srcCol.cards.filter(c => c.id !== card.id);
        cObj.order = newOrder;
        dstCol.cards.push(cObj);
        dstCol.cards.sort((a,b) => a.order - b.order);
        persist(); render();
      }
    } else {
      db.collection("boards").doc(BOARD_ID).collection("cards").doc(String(card.id)).update({ columnId: targetColId, order: newOrder, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    if (!isAuto) { showSystemToast('Логистика', `Перемещение завершено!`, 'move', 'text-blue-500', 'bg-blue-50 dark:bg-blue-900/30'); toggleAiSidebar(); }
    return;
  }
  
  // --- СОЗДАНИЕ ОБЪЕКТОВ ---
  if (!columns || columns.length === 0) {
    if (!isAuto) showSystemToast('Ошибка', 'Создайте хотя бы одну колонку на доске.', 'alert-circle', 'text-red-500', 'bg-red-50 dark:bg-red-900/20');
    return;
  }
  
  const spaceCols = getSpaceColumns();
  const targetColId = (spaceCols[0] || columns[0]).id; 
  const cardId = 'card_' + Date.now();
  
  let newCard = { id: cardId, title, author: currentUser, columnId: targetColId, archived: false, order: allCards.length, comments: [] };

  if (type === 'TASK') {
    const lines = data.split('\n');
    const checklist = [];
    const cleanDescLines = [];
    lines.forEach(line => {
      if (line.trim().startsWith('- [ ]') || line.trim().startsWith('- [x]')) {
        const isCompleted = line.trim().startsWith('- [x]');
        const text = line.replace(/^- \[[ x]\] /, '').trim();
        if (text) checklist.push({ id: Date.now() + Math.random(), text, isCompleted });
      } else cleanDescLines.push(line);
    });
    newCard.type = 'task'; newCard.description = cleanDescLines.join('\n').trim(); newCard.tags = ['tag_feat']; newCard.dueDate = ""; newCard.checklist = checklist;
  } 
  else if (type === 'POLL') {
    const optionsRaw = data.split(',');
    newCard.type = 'poll'; newCard.isAnonymous = false; newCard.options = optionsRaw.map(opt => ({ text: opt.trim(), votes: [] })).filter(o => o.text !== '');
  }
  else if (type === 'LINK') { newCard.type = 'link'; newCard.url = data.trim(); }
  else if (type === 'TIMER') { newCard.type = 'timer'; newCard.targetDate = data.trim(); }
  else if (type === 'TABLE') {
    newCard.type = 'table';
    const rowsRaw = data.split('|').map(r => r.trim()).filter(r => r !== '');
    const headersRaw = rowsRaw.shift(); 
    const headers = headersRaw ? headersRaw.split(',').map(h => h.trim()) : ['Колонка 1', 'Колонка 2'];
    newCard.cols = headers.length; newCard.rows = rowsRaw.length > 0 ? rowsRaw.length : 1; newCard.colHeaders = headers; newCard.rowHeaders = Array.from({length: newCard.rows}, (_, i) => `${i + 1}`);
    const tableData = {};
    if (rowsRaw.length > 0) rowsRaw.forEach((rowStr, rIdx) => { tableData[rIdx] = Array.from({length: headers.length}, (_, cIdx) => rowStr.split(',').map(c => c.trim())[cIdx] || ''); });
    else tableData[0] = Array(headers.length).fill("");
    newCard.tableData = tableData;
  }
  else if (type === 'TODO') {
    newCard.type = 'todo';
    newCard.checklist = data.split('\n').map(i => i.trim()).filter(i => i !== '').map(text => ({ id: Date.now() + Math.random(), text, isCompleted: false }));
  }
  
  if (isLocalBoard) {
    const col = columns.find(c => c.id == targetColId);
    if (col) { if(!col.cards) col.cards = []; col.cards.push(newCard); persist(); render(); } 
  } else {
    db.collection("boards").doc(BOARD_ID).collection("cards").doc(cardId).set({ ...newCard, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }
  
  if (!isAuto) {
    if(typeof fireConfetti === 'function') fireConfetti();
    showSystemToast('AI Магия', 'Объект успешно добавлен!', 'sparkles', 'text-indigo-500', 'bg-indigo-50 dark:bg-indigo-900/30');
    toggleAiSidebar(); 
  }
}
