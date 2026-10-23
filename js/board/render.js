// ==========================================
// Blocko Pro · доска — render.js
// Делегирование событий и отрисовка доски
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// --- ENTERPRISE EVENT DELEGATION ENGINE v4.3 (Reactive Routing) ---
/**
 * Единый центр управления событиями Blocko Pro.
 * РЕШЕНО: Исправлен баг, при котором клик по карточке в колонке не открывал модальное окно просмотра.
 * Внедрена интеллектуальная фильтрация событий для поддержки интерактивных элементов внутри карточки.
 */
if (!window.blockoDelegationInited) {
  document.addEventListener('click', (e) => {
    // Находим ближайшую цель с действием
    const actionTarget = e.target.closest('[data-action]');
    
    if (actionTarget) {
      const { action, col, card, type, opt } = actionTarget.dataset;

      // Если клик внутри доски или по карточке — блокируем стандартное поведение, кроме инпутов
      if (e.target.closest('#board') || e.target.closest('.card-item')) {
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }

      switch(action) {
        case 'viewCard': 
          if (col && card) openViewModal(col, card); 
          break;
        case 'editCard': 
          openEditModal(col, card); 
          break;
        case 'saveCard': 
          saveCard(); 
          break;
        case 'deleteCard': 
          deleteCardDirectly(col, card, type); 
          break;
        case 'openTable': 
          openTableEditor(col, card); 
          break;
        case 'votePoll': 
          votePoll(col, card, parseInt(opt)); 
          break;
        case 'toggleAudio': 
          toggleAudioPlayer(actionTarget, col, card); 
          break;
        case 'editCol': 
          openColModal(col); 
          break;
        case 'moreAdd': 
          openMoreAddModal(col); 
          break;
        case 'setColSort': 
          columns = columns.map(c => c.id == col ? {...c, sortBy: opt} : c);
          persist();
          if (!isLocalBoard) render();
          break;
        case 'closeEdit': 
          closeEditModal(); 
          break;
        case 'archiveCard': 
          archiveCard(); 
          break;
      }
    } else {
      // КРИТИЧЕСКИЙ ФИКС: Если кликнули по самой карточке, но не по конкретной кнопке (edit/delete)
      const cardContainer = e.target.closest('.card-item');
      if (cardContainer && cardContainer.dataset.id) {
        const colId = cardContainer.dataset.col || cardContainer.closest('[data-id]')?.dataset.id;
        if (colId) {
          e.preventDefault();
          e.stopPropagation();
          openViewModal(colId, cardContainer.dataset.id);
        }
      }
    }
  }, true);

  document.getElementById('board')?.addEventListener('dblclick', (e) => {
    const target = e.target.closest('[data-dblaction]');
    if (!target) return;
    if (target.dataset.dblaction === 'quickAdd') quickAddCard(target.dataset.col);
  });
  
  window.blockoDelegationInited = true;
}

let renderRAF = null;

function render() {
  if (renderRAF) cancelAnimationFrame(renderRAF);

  renderRAF = requestAnimationFrame(() => {
    const board = document.getElementById('board');
    if (!board) return;

    // --- ENTERPRISE SMART DIFFING: Сохраняем состояние скролла перед рендером ---
    const scrollStates = new Map();
    document.querySelectorAll('[id^="cards-"]').forEach(el => {
      scrollStates.set(el.id, el.scrollTop);
    });
    const mainScrollLeft = document.getElementById('mainScroll')?.scrollLeft || 0;
    const activeElementId = document.activeElement ? document.activeElement.id : null;
    // -----------------------------------------------------------------------

    // 1. Очистка старых инстансов SortableJS для предотвращения утечек памяти
    sortableInstances.forEach(inst => {
      if (typeof inst.destroy === 'function') inst.destroy();
    });
    sortableInstances = [];

    const searchQuery = document.getElementById('boardSearch')?.value.toLowerCase() || "";
    const filterTag = document.getElementById('tagFilter')?.value || "all";
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Определяем права доступа
    const myRole = boardData.users && boardData.users[currentUser.id] ? boardData.users[currentUser.id].role : 'editor';
    const isViewer = myRole === 'viewer' && !isLocalBoard;

    const addColBtn = document.getElementById('addColumnBtn');
    if (addColBtn) addColBtn.style.display = isViewer ? 'none' : 'flex';
    
    // ЭНТЕРПРАЙЗ: Мощный фильтр колонок по активному пространству.
        // Обеспечивает обратную совместимость со старыми колонками.
        const activeColumns = columns.filter(col => (col.spaceId || 'default') === currentSpaceId);

        if (!activeColumns || activeColumns.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = "w-full text-center flex flex-col items-center justify-center py-20 text-gray-400 font-medium animate-fade-in-up h-full";
            emptyState.innerHTML = `<div class="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner border border-blue-100 dark:border-blue-800"><i data-lucide="layout-template" class="w-10 h-10"></i></div><h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Чистый лист</h3><p class="mb-6 max-w-md text-sm text-gray-500">В этой вкладке пока нет колонок. Создайте первую, чтобы начать управлять процессами.</p><button onclick="addColumn()" class="px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg hover:from-blue-500 hover:to-indigo-500 active:scale-95 transition-all text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Добавить колонку</button>`;
            board.replaceChildren(emptyState);
            lucide.createIcons({ root: emptyState });
            return;
        }

        const fragment = document.createDocumentFragment();

        activeColumns.forEach(col => {
      const colorStyle = BOARD_UI_COLORS[col.color] || BOARD_UI_COLORS['default'];
      const safeCards = col.cards || [];
      const wipLimit = col.wipLimit || 0;
      
      // Считаем только активные (неархивные) карточки для WIP-лимита
      const activeCardsCount = safeCards.filter(c => !c.archived).length;
      const isOverWip = wipLimit > 0 && activeCardsCount > wipLimit;
      
      const overWipBg = isOverWip ? 'bg-red-50/50 dark:bg-red-900/10 border-red-300 dark:border-red-800/80 shadow-red-500/10' : `bg-gray-100 dark:bg-gray-800/60 ${colorStyle.border}`;

      const wrap = document.createElement('div');
      wrap.dataset.id = col.id; 
      wrap.className = `flex-shrink-0 w-[320px] rounded-2xl border flex flex-col max-h-full shadow-sm transition-all duration-300 ${overWipBg}`;

      const filteredCards = safeCards.filter(card => {
        const matchesSearch = card.title.toLowerCase().includes(searchQuery) || (card.description || "").toLowerCase().includes(searchQuery);
        const matchesTag = filterTag === "all" || (card.tags && card.tags.includes(filterTag));
        return matchesSearch && matchesTag && !card.archived; 
      });

      // ЭНТЕРПРАЙЗ: Интеллектуальная система Auto-Sorting внутри колонки
      let sortedCards = [...filteredCards];
      const sortBy = col.sortBy || 'manual';
      
      if (sortBy === 'date_desc') {
          sortedCards.sort((a,b) => {
              const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return tb - ta || String(b.id).localeCompare(String(a.id));
          });
      } else if (sortBy === 'deadline') {
          sortedCards.sort((a,b) => {
              if (!a.dueDate && !b.dueDate) return 0;
              if (!a.dueDate) return 1;
              if (!b.dueDate) return -1;
              return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          });
      } else if (sortBy === 'sp_desc') {
          sortedCards.sort((a,b) => {
              const sa = parseInt(a.storyPoints) || 0;
              const sb = parseInt(b.storyPoints) || 0;
              return sb - sa;
          });
      } else if (sortBy === 'priority_desc') {
          const pMap = { 'critical': 4, 'high': 3, 'normal': 2, 'low': 1, '': 0, undefined: 0 };
          sortedCards.sort((a,b) => (pMap[b.priority] || 0) - (pMap[a.priority] || 0));
      } else {
          // Manual Drag and Drop Order
          sortedCards.sort((a,b) => (a.order || 0) - (b.order || 0));
      }

      const cardsHtml = sortedCards.map(c => {
        const displayTitle = highlightText(c.title, searchQuery);
        // ЭНТЕРПРАЙЗ: Динамическая резолюция пользователя. Берем актуальный профиль из меты доски, а не старый слепок
        const actualAuthor = (c.author && boardData.users && boardData.users[c.author.id]) ? boardData.users[c.author.id] : c.author;
        const authorAvatar = actualAuthor ? getAvatarHTML(actualAuthor, 'w-5 h-5 pointer-events-none') : '';
        const commentsCountText = c.comments && c.comments.length > 0 
            ? `<span class="flex items-center gap-1 pointer-events-none"><i data-lucide="message-square" class="w-3 h-3"></i> ${c.comments.length}</span>` 
            : '';
        
        if (c.type === 'table') {
          return `
            <div data-id="${esc(c.id)}" data-action="viewCard" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="card-item bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900/30 p-3.5 rounded-xl ${isViewer ? 'cursor-pointer' : 'cursor-grab'} shadow-sm hover:shadow-md transition-all group relative select-none cursor-pointer">
              ${isViewer ? '' : `<button data-action="deleteCard" data-type="таблицу" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 bg-white dark:bg-gray-800 p-1.5 rounded-lg border dark:border-gray-700 shadow-sm z-10 transition-opacity"><i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i></button>`}
              <div class="flex items-center gap-2 mb-2 pointer-events-none">
                <i data-lucide="table" class="w-3 h-3 text-blue-500"></i>
                <span class="text-[9px] font-black uppercase tracking-widest text-blue-500">Таблица</span>
              </div>
              <div class="font-bold text-sm leading-tight mb-3 text-gray-900 dark:text-white pr-6 pointer-events-none">${displayTitle}</div>
              <div class="flex items-center gap-1.5 p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl mb-2 border border-blue-100/50 dark:border-blue-800/30 pointer-events-none">
                 <i data-lucide="layout" class="w-4 h-4 text-blue-400"></i>
                 <span class="text-[10px] font-bold text-gray-500">${c.cols} x ${c.rows} ячеек</span>
              </div>
              <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/50 pointer-events-none">
                <div class="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <span>Excel</span>
                  ${commentsCountText ? `<span class="opacity-30">|</span> ${commentsCountText}` : ''}
                </div>
                ${authorAvatar}
              </div>
            </div>
          `;
        }

        if (c.type === 'poll') {
          const totalVotes = c.options.reduce((sum, o) => sum + o.votes.length, 0);
          const optionsHtml = c.options.map((opt, i) => {
            const percent = totalVotes === 0 ? 0 : Math.round((opt.votes.length / totalVotes) * 100);
            const myVote = opt.votes.includes(currentUser.id);
            const barColor = myVote ? 'bg-purple-500' : 'bg-purple-200 dark:bg-purple-900/50';
            const textColor = myVote ? 'text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-gray-300';
            return `
              <div data-action="votePoll" data-col="${esc(col.id)}" data-card="${esc(c.id)}" data-opt="${esc(i)}" 
                   class="relative overflow-hidden rounded-xl bg-purple-50/30 dark:bg-purple-900/10 border border-purple-100/50 dark:border-purple-800/30 p-2.5 cursor-pointer group/opt mb-2 transition-all active:scale-[0.98]">
                <div class="absolute left-0 top-0 bottom-0 ${barColor} opacity-20 transition-all duration-500 pointer-events-none" style="width: ${percent}%"></div>
                <div class="relative z-10 flex justify-between items-center text-[11px] font-bold ${textColor} pointer-events-none">
                  <span class="flex items-center gap-1.5 truncate pr-2">${esc(opt.text)} ${myVote ? '<i data-lucide="check-circle-2" class="w-3 h-3 text-purple-500"></i>' : ''}</span>
                  <span class="flex-shrink-0">${percent}%</span>
                </div>
              </div>`;
          }).join('');

          return `
            <div data-id="${esc(c.id)}" data-action="viewCard" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="card-item bg-white dark:bg-gray-800 border border-purple-100 dark:border-purple-900/30 p-3.5 rounded-xl ${isViewer ? 'cursor-pointer' : 'cursor-grab'} shadow-sm hover:shadow-md transition-all group relative select-none">
              ${isViewer ? '' : `<button data-action="deleteCard" data-type="опрос" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 bg-white dark:bg-gray-800 p-1.5 rounded-lg border dark:border-gray-700 shadow-sm z-10 transition-opacity"><i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i></button>`}
              <div class="flex items-center gap-2 mb-2 pointer-events-none">
                <i data-lucide="bar-chart-3" class="w-3 h-3 text-purple-500"></i>
                <span class="text-[9px] font-black uppercase tracking-widest text-purple-500">Опрос</span>
              </div>
              <div class="font-bold text-sm leading-tight mb-3 text-gray-900 dark:text-white pr-6 pointer-events-none">${displayTitle}</div>
              <div class="space-y-1 mb-2 relative z-20 pointer-events-auto">${optionsHtml}</div>
              <div class="flex justify-between items-center mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/50 pointer-events-none">
                <div class="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  <span><i data-lucide="users" class="w-3 h-3 inline pb-0.5 mr-0.5"></i> ${totalVotes}</span>
                  <span class="opacity-50">|</span>
                  ${commentsCountText ? `${commentsCountText} <span class="opacity-50">|</span> ` : ''}
                  <span>${c.isAnonymous ? 'Анон' : 'Публ'}</span>
                </div>
                ${authorAvatar}
              </div>
            </div>`;
        }

        if (c.type === 'audio') {
          return `
            <div data-id="${esc(c.id)}" data-action="viewCard" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="card-item bg-white dark:bg-gray-800 border border-emerald-100 dark:border-emerald-900/30 p-3.5 rounded-xl ${isViewer ? 'cursor-pointer' : 'cursor-grab'} shadow-sm hover:shadow-md transition-all group relative select-none cursor-pointer">
              ${isViewer ? '' : `<button data-action="deleteCard" data-type="заметку" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 bg-white dark:bg-gray-800 p-1.5 rounded-lg border dark:border-gray-700 shadow-sm z-10 transition-opacity"><i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i></button>`}
              <div class="flex items-center gap-2 mb-2 pointer-events-none">
                <i data-lucide="mic" class="w-3 h-3 text-emerald-500"></i>
                <span class="text-[9px] font-black uppercase tracking-widest text-emerald-500">Аудио</span>
              </div>
              <div class="font-bold text-sm leading-tight mb-3 text-gray-900 dark:text-white pr-6 pointer-events-none">${displayTitle}</div>
              <div class="flex items-center gap-3 bg-emerald-50/50 dark:bg-emerald-900/20 p-2 rounded-xl mb-2 border border-emerald-100/50 dark:border-emerald-800/30 pointer-events-none">
                <button data-action="toggleAudio" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="w-8 h-8 flex-shrink-0 bg-emerald-500 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-sm pointer-events-auto">
                  <i data-lucide="play" class="w-4 h-4 fill-current ml-0.5 btn-icon pointer-events-none"></i>
                </button>
                <div class="flex-1 h-1.5 bg-emerald-200 dark:bg-emerald-800 rounded-full overflow-hidden relative pointer-events-none">
                  <div class="audio-progress bg-emerald-500 h-full w-0 transition-all duration-100"></div>
                </div>
              </div>
              <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/50 pointer-events-none">
                <div class="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <span>Аудио</span>
                  ${commentsCountText ? `<span class="opacity-30">|</span> ${commentsCountText}` : ''}
                </div>
                ${authorAvatar}
              </div>
            </div>`;
        }

        if (c.type === 'timer') {
          const target = new Date(c.targetDate).getTime();
          const now = new Date().getTime();
          const diff = target - now;
          let timeHtml = '';
          if (diff > 0) {
            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            timeHtml = `<div class="text-2xl font-black text-rose-500">${d}д ${h}ч ${m}м</div>`;
          } else {
            timeHtml = `<div class="text-sm font-black text-gray-500 uppercase tracking-widest">Время вышло</div>`;
          }

          return `
            <div data-id="${esc(c.id)}" data-action="viewCard" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="card-item bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-rose-100 dark:border-rose-900/30 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all group relative select-none">
               ${isViewer ? '' : `<button data-action="deleteCard" data-type="таймер" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 bg-white dark:bg-gray-800 p-1.5 rounded-lg border dark:border-gray-700 shadow-sm z-10 transition-opacity"><i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i></button>`}
               <div class="flex items-center gap-2 mb-3 pointer-events-none">
                 <div class="p-1.5 bg-rose-100 dark:bg-rose-900/30 rounded-md text-rose-500"><i data-lucide="timer" class="w-3.5 h-3.5"></i></div>
                 <span class="text-[10px] font-black uppercase tracking-widest text-rose-500">Таймер</span>
               </div>
               <div class="font-bold text-sm leading-tight mb-3 text-gray-900 dark:text-white pr-6 pointer-events-none">${displayTitle}</div>
               <div class="p-3 bg-rose-50/50 dark:bg-rose-900/10 rounded-xl text-center border border-rose-100/50 dark:border-rose-800/30 pointer-events-none">
                 ${timeHtml}
               </div>
               <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/50 pointer-events-none">
                 <div class="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                   <span>Ожидание</span>
                   ${commentsCountText ? `<span class="opacity-30">|</span> ${commentsCountText}` : ''}
                 </div>
                 ${authorAvatar}
               </div>
            </div>`;
        }

        if (c.type === 'todo') {
          const doneCount = c.checklist.filter(i => i.isCompleted).length;
          const percent = Math.round((doneCount / c.checklist.length) * 100) || 0;
          const itemsHtml = c.checklist.map((item, idx) => `
            <div onclick="event.stopPropagation(); toggleBoardTodo(${jsArg(col.id)}, ${jsArg(c.id)}, ${idx})" class="flex items-start gap-3 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50 hover:border-cyan-200 dark:hover:border-cyan-800 transition-colors mb-2 last:mb-0 relative z-20 pointer-events-auto group/chk cursor-pointer">
              <div class="w-5 h-5 flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${item.isCompleted ? 'bg-cyan-500 border-cyan-500' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'}">
                ${item.isCompleted ? '<i data-lucide="check" class="w-3.5 h-3.5 text-white"></i>' : ''}
              </div>
              <span class="text-xs font-medium ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'} leading-snug select-none flex-1">${esc(item.text)}</span>
            </div>
          `).join('');

          return `
            <div data-id="${esc(c.id)}" data-action="viewCard" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="card-item bg-white dark:bg-gray-800 border border-cyan-100 dark:border-cyan-900/30 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all group relative select-none cursor-pointer">
              ${isViewer ? '' : `<button data-action="deleteCard" data-type="чек-лист" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 bg-white dark:bg-gray-800 p-1.5 rounded-lg border dark:border-gray-700 shadow-sm z-10 transition-opacity"><i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i></button>`}
              <div class="flex items-center justify-between mb-3 pointer-events-none">
                <div class="flex items-center gap-2">
                  <div class="p-1.5 bg-cyan-100 dark:bg-cyan-900/30 rounded-md text-cyan-500"><i data-lucide="list-todo" class="w-3.5 h-3.5"></i></div>
                  <span class="text-[10px] font-black uppercase tracking-widest text-cyan-500">Чек-лист</span>
                </div>
                <span class="text-[10px] font-bold text-gray-400">${percent}%</span>
              </div>
              <div class="font-bold text-sm leading-tight mb-3 text-gray-900 dark:text-white pr-6 pointer-events-none">${displayTitle}</div>
              <div class="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full mb-3 overflow-hidden pointer-events-none">
                <div class="bg-cyan-500 h-full transition-all" style="width: ${percent}%"></div>
              </div>
              <div class="space-y-1">${itemsHtml}</div>
              <div class="flex justify-between items-center mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/50 pointer-events-none">
                 <div class="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                   <span>Задачи</span>
                   ${commentsCountText ? `<span class="opacity-30">|</span> ${commentsCountText}` : ''}
                 </div>
                 ${authorAvatar}
               </div>
            </div>`;
        }

        if (c.type === 'link') {
          return `
            <div data-id="${esc(c.id)}" data-action="viewCard" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="card-item bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all group relative select-none cursor-pointer">
              ${isViewer ? '' : `<button data-action="deleteCard" data-type="ссылку" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 bg-white dark:bg-gray-800 p-1.5 rounded-lg border dark:border-gray-700 shadow-sm z-10 transition-opacity"><i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i></button>`}
              <div class="flex items-center gap-2 mb-3 pointer-events-none">
                <div class="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-md text-gray-500 dark:text-gray-400"><i data-lucide="link" class="w-3.5 h-3.5"></i></div>
                <span class="text-[10px] font-black uppercase tracking-widest text-gray-500">Закладка</span>
              </div>
              <div class="font-bold text-sm leading-tight mb-2 text-gray-900 dark:text-white pr-6 pointer-events-none">${displayTitle}</div>
              <a href="${esc(safeUrl(c.url) || '#')}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="flex items-center justify-between gap-2 text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 px-4 py-3 rounded-xl hover:bg-white dark:hover:bg-gray-800 relative z-20 pointer-events-auto transition-colors mt-3 shadow-sm">
                <span class="truncate">${c.url.replace(/^https?:\/\//, '')}</span>
                <i data-lucide="external-link" class="w-4 h-4 flex-shrink-0 text-blue-500"></i>
              </a>
              <div class="flex justify-between items-center mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/50 pointer-events-none">
                 <div class="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                   <span>Web</span>
                 </div>
                 ${authorAvatar}
               </div>
            </div>`;
        }

        const isOverdue = c.dueDate && c.dueDate < todayStr;
        const overdueClass = isOverdue ? 'deadline-overdue' : '';
        let checklistHtml = '';
        if (c.checklist && c.checklist.length > 0) {
          const done = c.checklist.filter(i => i.isCompleted).length;
          const percent = Math.round((done / c.checklist.length) * 100);
          checklistHtml = `
            <div class="mt-3 mb-1 pointer-events-none">
              <div class="flex justify-between items-center text-[10px] font-bold text-gray-400 mb-1.5">
                <span class="flex items-center gap-1"><i data-lucide="check-square" class="w-3 h-3"></i> ${done}/${c.checklist.length}</span>
                <span>${percent}%</span>
              </div>
              <div class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div class="${done === c.checklist.length ? 'bg-green-500' : 'bg-blue-500'} h-full transition-all" style="width: ${percent}%"></div>
              </div>
            </div>`;
        }
        let dueDateHtml = c.dueDate ? `<div class="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md ${isOverdue ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'} pointer-events-none"><i data-lucide="clock" class="w-3 h-3"></i> ${new Date(c.dueDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</div>` : '';
        
        // ЭНТЕРПРАЙЗ МИКРО-УЛУЧШЕНИЕ: Текстовые читаемые теги
        const tagsHtml = c.tags?.length ? `<div class="flex flex-wrap gap-1 pointer-events-none mb-1">${c.tags.map(tId => { const t = getBoardTags().find(tag => tag.id === tId); return t ? `<span class="px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-widest border shadow-sm ${esc(t.color)}">${esc(t.name)}</span>` : ''; }).join('')}</div>` : '';
        const normalComments = c.comments?.length ? `<div class="flex items-center gap-1 text-[11px] font-medium text-gray-400 pointer-events-none"><i data-lucide="message-square" class="w-3.5 h-3.5"></i> ${c.comments.length}</div>` : '';
        
        let priorityHtml = '';
        if (c.priority === 'low') {
          priorityHtml = `<div class="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800" title="Приоритет: Низкий"><i data-lucide="arrow-down-to-line" class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400"></i></div>`;
        } else if (c.priority === 'high') {
          priorityHtml = `<div class="flex items-center justify-center w-6 h-6 rounded-lg bg-orange-50 dark:bg-orange-900/30 border border-orange-100 dark:border-orange-800" title="Приоритет: Высокий"><i data-lucide="arrow-up-from-line" class="w-3.5 h-3.5 text-orange-500 dark:text-orange-400"></i></div>`;
        } else if (c.priority === 'critical') {
          priorityHtml = `<div class="flex items-center justify-center w-6 h-6 rounded-lg bg-red-100 dark:bg-red-900 border border-red-200 dark:border-red-700 animate-pulse" title="Приоритет: КРИТИЧНЫЙ"><i data-lucide="zap" class="w-3.5 h-3.5 text-red-600 dark:text-red-400 fill-current"></i></div>`;
        }        
        const spHtml = c.storyPoints ? `<span class="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black px-1.5 py-0.5 rounded-md" title="Story Points">${c.storyPoints}</span>` : '';
        
        // ЭНТЕРПРАЙЗ МИКРО-УЛУЧШЕНИЕ: Понятный индикатор видео вместо красного квадрата
        const ytBadgeHtml = c.youtubeEmbed ? `<div class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 shadow-sm" title="Прикреплено видео"><i data-lucide="play-circle" class="w-3 h-3"></i><span class="text-[8px] font-black uppercase tracking-wider">Видео</span></div>` : '';

        return `
          <div data-id="${esc(c.id)}" data-action="viewCard" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="card-item ${overdueClass} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3.5 rounded-xl ${isViewer ? 'cursor-pointer' : 'cursor-grab'} shadow-sm hover:shadow-md transition-all group relative select-none flex flex-col justify-between">
            ${isViewer ? '' : `<button data-action="editCard" data-col="${esc(col.id)}" data-card="${esc(c.id)}" class="absolute top-2 right-2 text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 bg-white dark:bg-gray-800 p-1.5 rounded-lg border dark:border-gray-700 shadow-sm z-10 transition-opacity"><i data-lucide="pencil" class="w-3.5 h-3.5 pointer-events-none"></i></button>`}
            
            <!-- ЭНТЕРПРАЙЗ МИКРО-УЛУЧШЕНИЕ: Легковесное сжатое превью для ускорения рендеринга доски -->
            ${c.image ? `<div class="compact-hide mb-3 w-full h-32 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700/50 pointer-events-none flex-shrink-0 bg-gray-50 dark:bg-gray-900/50"><img src="${esc(safeUrl(c.imageThumb, {allowData:true}) || safeUrl(c.image, {allowData:true}))}" alt="" referrerpolicy="no-referrer" loading="lazy" decoding="async" fetchpriority="low" style="content-visibility: auto;" class="w-full h-full object-cover block scale-105" /></div>` : ''}
            
            <div class="flex flex-col items-start w-full pointer-events-none">
              ${tagsHtml}
              <div class="font-bold text-sm leading-tight mb-2 text-gray-900 dark:text-white pr-6 line-clamp-3">${displayTitle}</div>
            </div>
            
            <div class="flex items-center justify-between w-full mt-auto pt-2 border-t border-gray-100 dark:border-gray-700/50 pointer-events-none">
              <div class="flex items-center gap-1.5">${dueDateHtml}${checklistHtml || normalComments}</div>
              <div class="flex items-center gap-1.5 justify-end flex-shrink-0">${priorityHtml}${spHtml}${ytBadgeHtml}</div>
            </div>
          </div>`;
      }).join('');
      
      // ЭНТЕРПРАЙЗ: Заглушка занимает всё свободное пространство пустой колонки, становясь огромным "магнитом"
      const emptyStateHtml = filteredCards.length === 0 
        ? `<div class="empty-state-placeholder w-full min-h-[100px] flex-1 border-2 border-dashed border-gray-300 dark:border-gray-700/50 rounded-xl flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 text-xs font-bold gap-2 select-none opacity-50 pointer-events-none mt-0 mb-auto"><i data-lucide="download-cloud" class="w-5 h-5 pointer-events-none"></i> Перетащите сюда</div>` 
        : '';
        
      const countColor = isOverWip ? 'text-red-600 bg-red-100 dark:bg-red-900/40 border-red-200 dark:border-red-800' : 'text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-black/20 border-gray-200/50 dark:border-gray-700/50';
        const wipText = wipLimit > 0 ? `${filteredCards.length} / ${wipLimit}` : `${filteredCards.length}`;
        const warningIcon = isOverWip ? `<i data-lucide="alert-triangle" class="w-3 h-3 text-red-500 animate-pulse ml-0.5"></i>` : '';

        const activeSortIcon = sortBy === 'date_desc' ? 'sparkles' : sortBy === 'deadline' ? 'clock' : sortBy === 'priority_desc' ? 'flame' : sortBy === 'sp_desc' ? 'scale' : 'arrow-up-down';
        const isSorted = sortBy !== 'manual';
        const sortBtnClass = isSorted ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800/50' : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-800 border-transparent';

        wrap.innerHTML = `
          <div class="p-4 border-b border-gray-200/50 dark:border-gray-700/50 flex justify-between items-center col-handle ${isViewer ? '' : 'cursor-grab'} select-none relative z-20">
            <div class="flex items-center gap-2 pointer-events-none">
              <div class="w-3 h-3 rounded-full shadow-sm" style="background-color: ${colorStyle.hex}"></div>
              <h2 class="font-bold text-sm text-gray-900 dark:text-white truncate max-w-[120px]" title="${esc(col.name)}">${esc(col.name)}</h2>
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full border ${countColor} flex items-center shadow-sm transition-colors" title="${wipLimit > 0 ? 'Задач / Лимит (WIP)' : 'Количество задач'}">${wipText} ${warningIcon}</span>
            </div>
            ${isViewer ? '' : `
            <div class="flex items-center gap-0.5 ml-auto relative">
                <button onclick="document.querySelectorAll('.col-sort-menu').forEach(m => m !== this.nextElementSibling && m.classList.add('hidden')); this.nextElementSibling.classList.toggle('hidden'); event.stopPropagation();" class="p-1.5 rounded-lg border transition-all ${sortBtnClass}" title="Авто-сортировка задач">
                    <i data-lucide="${esc(activeSortIcon)}" class="w-4 h-4 pointer-events-none"></i>
                </button>
                <div class="col-sort-menu hidden absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden transform origin-top-right transition-all">
                    <div class="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 text-[9px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                      <i data-lucide="arrow-up-down" class="w-3 h-3"></i> Сортировка колонки
                    </div>
                    <div class="p-1.5 flex flex-col gap-0.5">
                        <button data-action="setColSort" data-col="${esc(col.id)}" data-opt="manual" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${sortBy === 'manual' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : ''}">
                            <div class="flex items-center gap-2"><i data-lucide="hand" class="w-3.5 h-3.5 text-gray-400"></i> Вручную (DnD)</div>
                            ${sortBy === 'manual' ? '<i data-lucide="check" class="w-3.5 h-3.5"></i>' : ''}
                        </button>
                        <button data-action="setColSort" data-col="${esc(col.id)}" data-opt="date_desc" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${sortBy === 'date_desc' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : ''}">
                            <div class="flex items-center gap-2"><i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-500"></i> Новые сверху</div>
                            ${sortBy === 'date_desc' ? '<i data-lucide="check" class="w-3.5 h-3.5"></i>' : ''}
                        </button>
                        <button data-action="setColSort" data-col="${esc(col.id)}" data-opt="deadline" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${sortBy === 'deadline' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : ''}">
                            <div class="flex items-center gap-2"><i data-lucide="clock" class="w-3.5 h-3.5 text-rose-500"></i> Дедлайны</div>
                            ${sortBy === 'deadline' ? '<i data-lucide="check" class="w-3.5 h-3.5"></i>' : ''}
                        </button>
                        <button data-action="setColSort" data-col="${esc(col.id)}" data-opt="priority_desc" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${sortBy === 'priority_desc' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : ''}">
                            <div class="flex items-center gap-2"><i data-lucide="flame" class="w-3.5 h-3.5 text-red-500"></i> По приоритету</div>
                            ${sortBy === 'priority_desc' ? '<i data-lucide="check" class="w-3.5 h-3.5"></i>' : ''}
                        </button>
                        <button data-action="setColSort" data-col="${esc(col.id)}" data-opt="sp_desc" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${sortBy === 'sp_desc' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : ''}">
                            <div class="flex items-center gap-2"><i data-lucide="scale" class="w-3.5 h-3.5 text-indigo-500"></i> По весу (SP)</div>
                            ${sortBy === 'sp_desc' ? '<i data-lucide="check" class="w-3.5 h-3.5"></i>' : ''}
                        </button>
                    </div>
                </div>
                <button data-action="editCol" data-col="${esc(col.id)}" class="text-gray-400 hover:text-blue-500 p-1.5 rounded-lg transition-colors"><i data-lucide="more-horizontal" class="w-4 h-4 pointer-events-none"></i></button>
            </div>
            `}
          </div>
        <div id="cards-${esc(col.id)}" ${isViewer ? '' : `data-dblaction="quickAdd" data-col="${esc(col.id)}"`} class="p-3 flex-1 overflow-y-auto hide-scroll gap-3 min-h-[120px] flex flex-col ${isViewer ? '' : 'cursor-pointer'} relative z-10">
          ${cardsHtml}
          ${emptyStateHtml}
        </div>
        ${isViewer ? '' : `
        <div class="p-3 pt-0 flex gap-2 mt-auto">
          <button data-action="editCard" data-col="${esc(col.id)}" class="flex-[4] py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-white/50 dark:hover:bg-black/20 transition-colors border border-transparent dark:border-gray-700/50 border-dashed">
            <i data-lucide="plus" class="w-4 h-4 pointer-events-none"></i> Карточка
          </button>
          <button data-action="moreAdd" data-col="${esc(col.id)}" class="flex-1 py-2.5 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-white/50 dark:hover:bg-black/20 rounded-xl transition-colors border border-transparent dark:border-gray-700/50">
            <i data-lucide="more-horizontal" class="w-5 h-5 pointer-events-none"></i>
          </button>
        </div>`}
      `;
      // Вместо прямой вставки в board, добавляем в DocumentFragment
      fragment.appendChild(wrap);
      
      // Инициализация SortableJS для текущей колонки (Enterprise Smart Invert Physics)
      const colEl = wrap.querySelector(`#cards-${col.id}`);
      sortableInstances.push(new Sortable(colEl, { 
        group: 'shared', 
        sort: !isSorted, // ЭНТЕРПРАЙЗ: Отключаем ручную сортировку (DnD внутри колонки), если активна умная сортировка
        animation: 250, 
        easing: "cubic-bezier(0.25, 1, 0.5, 1)", 
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        
        // ЭНТЕРПРАЙЗ: Оптимизация Drag and Drop. Отключаем forceFallback для десктопов, 
        // чтобы работал нативный HTML5 Drag API (он идеально следует за курсором), 
        // но оставляем fallback для мобилок (fallbackTolerance защищает клики от ложных свайпов).
        forceFallback: /Mobi|Android/i.test(navigator.userAgent), 
        fallbackClass: 'sortable-fallback',
        fallbackOnBody: true, 
        fallbackTolerance: 5, 
        
        // ВЕРНУЛИ КАК БЫЛО: Фикс для карточек разного размера (Аудио над Картинкой)
        invertSwap: true, 
        direction: 'vertical', 
        swapThreshold: 0.6, 
        
        disabled: isViewer,
        delay: /Mobi|Android/i.test(navigator.userAgent) ? 150 : 0, // Задержка только на мобильных, на десктопе клики проходят мгновенно
        filter: '.empty-state-placeholder', 
        emptyInsertThreshold: 100, 
        
        // Умная зона прокрутки
        scroll: true, 
        scrollSensitivity: 150, 
        scrollSpeed: 30, 
        bubbleScroll: true,
        
        // Интерактивная подсветка скролл-зон
        onStart: function (evt) {
          document.body.classList.add('is-dragging-card');
        },
        onEnd: async function (evt) {
          document.body.classList.remove('is-dragging-card');
          const cardId = evt.item.dataset.id;
          const fromColId = evt.from.id.replace('cards-', '');
          const toColId = evt.to.id.replace('cards-', '');
          
          // Получаем актуальный срез DOM-элементов для обеих колонок
          const toItems = Array.from(evt.to.querySelectorAll('.card-item'));
          const fromItems = Array.from(evt.from.querySelectorAll('.card-item'));

          if (isLocalBoard) {
            // ЛОКАЛЬНАЯ ЛОГИКА: Глубокая пересортица массивов
            let cardObj = null;
            columns.forEach(col => {
              if (col.id == fromColId) {
                const idx = col.cards.findIndex(c => c.id == cardId);
                if (idx !== -1) [cardObj] = col.cards.splice(idx, 1);
              }
            });

            if (cardObj) {
              cardObj.columnId = toColId;
              const targetCol = columns.find(c => c.id == toColId);
              if (targetCol) {
                targetCol.cards.push(cardObj);
                // Синхронизируем order с фактическим положением в DOM
                const syncOrder = (items, col) => {
                  items.forEach((el, idx) => {
                    const c = col.cards.find(card => card.id == el.dataset.id);
                    if (c) c.order = idx;
                  });
                  col.cards.sort((a, b) => a.order - b.order);
                };
                syncOrder(toItems, targetCol);
                if (fromColId !== toColId) {
                  const sourceCol = columns.find(c => c.id == fromColId);
                  if (sourceCol) syncOrder(fromItems, sourceCol);
                }
              }
              persist();
              render();
            }
          } else {
            // CLOUD ЛОГИКА: Атомарный Batch-коммит для исключения Race Condition
            try {
              const batch = db.batch();
              const cardsRef = db.collection("boards").doc(BOARD_ID).collection("cards");
              const ts = firebase.firestore.FieldValue.serverTimestamp();

              // Обновляем целевую колонку (включая смену columnId для перемещенной карты)
              toItems.forEach((el, idx) => {
                batch.update(cardsRef.doc(String(el.dataset.id)), {
                  order: idx,
                  columnId: toColId,
                  updatedAt: ts
                });
              });

              // Если был межколоночный перенос, латаем дыры в исходной колонке
              if (fromColId !== toColId) {
                fromItems.forEach((el, idx) => {
                  batch.update(cardsRef.doc(String(el.dataset.id)), {
                    order: idx,
                    updatedAt: ts
                  });
                });
                
                // ЭНТЕРПРАЙЗ: Аудит-лог при перемещении (Activity Log)
                const cardTitle = evt.item.querySelector('.font-bold')?.innerText || 'Задачу';
                const fromColName = columns.find(c => c.id == fromColId)?.name || '...';
                const toColName = columns.find(c => c.id == toColId)?.name || '...';
                logActivity(`Переместил(а) "${cardTitle}" из "${fromColName}" в "${toColName}"`, 'move');
              }

              await batch.commit();
            } catch (err) {
              console.error("Sortable Batch Error:", err);
              showSystemToast('Ошибка синхронизации', 'Порядок задач может быть нарушен. Перезагрузите страницу.', 'alert-triangle', 'text-red-500', 'bg-red-50');
            }
          }
        } 
      }));
    });
    
    board.replaceChildren(fragment);

    // --- ВОССТАНОВЛЕНИЕ СОСТОЯНИЯ (State Retention) ---
    scrollStates.forEach((scrollTop, id) => {
      const el = document.getElementById(id);
      if (el) el.scrollTop = scrollTop;
    });
    if (document.getElementById('mainScroll')) {
      document.getElementById('mainScroll').scrollLeft = mainScrollLeft;
    }
    if (activeElementId) {
      const elToFocus = document.getElementById(activeElementId);
      if (elToFocus) elToFocus.focus();
    }
    // ----------------------------------------------------

    // Инициализация SortableJS для Колонок (Enterprise Horizontal DnD + Edge Snapping)
    sortableInstances.push(new Sortable(board, { 
      animation: 300, 
      easing: "cubic-bezier(0.25, 1, 0.5, 1)", 
      handle: '.col-handle', 
      ghostClass: 'sortable-ghost', 
      dragClass: 'sortable-drag', 
      forceFallback: /Mobi|Android/i.test(navigator.userAgent), 
      fallbackClass: 'sortable-fallback',
      fallbackOnBody: true,
      fallbackTolerance: 5,
      invertSwap: true, 
      swapThreshold: 0.8,
      disabled: isViewer,
      delay: /Mobi|Android/i.test(navigator.userAgent) ? 150 : 0,
      
      // ЭНТЕРПРАЙЗ: Огромная зона горизонтального листания
      scroll: true,
      scrollSensitivity: 180, 
      scrollSpeed: 30,
      
      onStart: function (evt) {
        // Активируем Focus Mode и неоновые зоны в CSS
        document.body.classList.add('is-dragging-column');
        if (navigator.vibrate) navigator.vibrate(50); // Haptic feedback на смартфонах
      },
      onEnd: function (evt) { 
        document.body.classList.remove('is-dragging-column');
        if (evt.oldIndex !== evt.newIndex) {
            const movedCol = columns.splice(evt.oldIndex, 1)[0];
            columns.splice(evt.newIndex, 0, movedCol); 
            persist(); 
            // Даем DOM время на плавную установку колонки, затем мягко рендерим данные
            setTimeout(() => render(), 50);
        }
      } 
    }));

    lucide.createIcons();

    if (typeof checkDeadlines === 'function') {
      checkDeadlines(columns);
    }
  });
}
let quickAddTargetColId = null;
function quickAddCard(colId) { quickAddTargetColId = colId; toggleModal('quickAddModal', true); setTimeout(() => document.getElementById('quickAddInput').focus(), 10); }
function closeQuickAdd() { toggleModal('quickAddModal', false); setTimeout(() => { document.getElementById('quickAddInput').value = ''; document.getElementById('quickAddDesc').value = ''; quickAddTargetColId = null; }, 300); }
function confirmQuickAdd() {
  const title = document.getElementById('quickAddInput').value.trim(); 
  const description = document.getElementById('quickAddDesc').value.trim();
  if (!title || !quickAddTargetColId) return;
  
  // ЭНТЕРПРАЙЗ: Адаптивное назначение тега. Берем базовый тег доски вместо жестко вшитого.
  const currentTags = getBoardTags();
  const defaultTag = currentTags.length > 0 ? [currentTags[0].id] : [];
  
  const cardId = 'card_' + Date.now();
  const newCard = { 
    id: cardId, title, description, tags: defaultTag, 
    comments: [], author: currentUser, dueDate: "", 
    columnId: quickAddTargetColId, archived: false, order: allCards.length 
  };
  
  if (isLocalBoard) {
    const col = columns.find(c => c.id == quickAddTargetColId);
    if (col) { 
        if(!col.cards) col.cards = [];
        col.cards.push(newCard); 
        persist(); 
        render();
    } 
  } else {
    db.collection("boards").doc(BOARD_ID).collection("cards").doc(cardId).set({
      ...newCard,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const colName = columns.find(c => c.id == quickAddTargetColId)?.name || '...';
    logActivity(`Создал(а) быструю задачу "${title}" в "${colName}"`, 'plus-circle');
  }
  closeQuickAdd();
}

document.getElementById('boardBgUpload').addEventListener('change', async (e) => {
  // ПРОВЕРКА ТАРИФА
  if (userPlan === 'free') {
    e.target.value = '';
    return showSystemToast('Премиум функция', 'Загрузка своих обоев доступна на тарифах Freelancer и Company.', 'lock', 'text-amber-500', 'bg-amber-50');
  }

  if (!navigator.onLine) {
    e.target.value = '';
    return showSystemToast('Офлайн', 'Смена обоев недоступна без интернета.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
  }

  const file = e.target.files[0]; if(!file) return;
  const statusEl = document.getElementById('bgUploadStatus'); statusEl.innerText = 'Загрузка обоев...';
  try {
    const fd = new FormData(); fd.append('image', file); 
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method:'POST', body: fd }); 
    const data = await res.json(); 
    if(data.success) { updateBoardData({ background: data.data.url }); statusEl.innerText = 'Готово! 🎉'; setTimeout(() => statusEl.innerText = '', 3000); } 
    else { statusEl.innerText = 'Ошибка загрузки :('; }
  } catch(err) { statusEl.innerText = 'Ошибка соединения'; } e.target.value = '';
});

function resetBoardBackground() {
  if(isLocalBoard) { const local = JSON.parse(localStorage.getItem('blocko_local_boards')); delete local[BOARD_ID].background; localStorage.setItem('blocko_local_boards', JSON.stringify(local)); boardData = local[BOARD_ID]; processBoardData(boardData); }
  else { db.collection("boards").doc(BOARD_ID).update({ background: firebase.firestore.FieldValue.delete() }); }
}
