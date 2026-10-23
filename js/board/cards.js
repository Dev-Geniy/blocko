// ==========================================
// Blocko Pro · доска — cards.js
// Модалка карточки: просмотр, редактор, медиа, клонирование
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// ЭКСПЕРТНОЕ РЕШЕНИЕ: УНИФИЦИРОВАННЫЙ КОНТРОЛЛЕР МОДАЛЬНЫХ ОКОН
function openViewModal(colId, cardId) {
    const col = columns.find(c => c.id == colId);
    if (!col) return; // БЕЗОПАСНОСТЬ: если колонка не найдена
    
    const card = col.cards?.find(c => c.id == cardId);
    if (!card) return; // БЕЗОПАСНОСТЬ: если карточка не найдена

    activeContentView = { colId, cardId, type: card.type || 'task' };
    viewingCard = card; 
    currentColumn = colId;

    const body = document.getElementById('cvBody');
    const header = document.getElementById('cvHeader');
    document.getElementById('cvTitle').innerText = card.title;
    
    // ЭНТЕРПРАЙЗ: Динамический аватар автора в модалке
    const actualAuthor = (card.author && boardData.users && boardData.users[card.author.id]) ? boardData.users[card.author.id] : card.author;
    if (actualAuthor) {
       const avatarWrap = document.getElementById('viewAuthorAvatarWrap');
       const nameEl = document.getElementById('viewAuthorName');
       
       if (avatarWrap) avatarWrap.innerHTML = getAvatarHTML(actualAuthor, 'w-6 h-6');
       if (nameEl) nameEl.innerText = actualAuthor.name;
    }

    if (card.type === 'poll') {
            header.innerHTML = `<div class="flex items-center gap-2 text-purple-500 mb-2"><i data-lucide="bar-chart-3" class="w-4 h-4"></i><span class="text-[10px] font-black uppercase tracking-widest">Результаты опроса</span></div>`;
            body.innerHTML = renderPollResults(card);
        } else if (card.type === 'audio') {
            header.innerHTML = `<div class="flex items-center gap-2 text-emerald-500 mb-2"><i data-lucide="mic" class="w-4 h-4"></i><span class="text-[10px] font-black uppercase tracking-widest">Голосовая заметка</span></div>`;
            body.innerHTML = `<div class="bg-emerald-50/50 dark:bg-emerald-900/20 p-8 rounded-[2rem] border border-emerald-100 dark:border-emerald-800/50 flex flex-col items-center">
                <button onclick="toggleAudioPlayer(this, ${jsArg(colId)}, ${jsArg(card.id)})" class="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-transform mb-4">
                    <i data-lucide="play" class="w-10 h-10 fill-current ml-1 btn-icon"></i>
                </button>
                <div class="w-full h-2 bg-emerald-200 dark:bg-emerald-800 rounded-full overflow-hidden"><div class="audio-progress bg-emerald-500 h-full w-0"></div></div>
            </div>`;
        } else if (card.type === 'table') {
            header.innerHTML = `<div class="flex items-center gap-2 text-blue-500 mb-2"><i data-lucide="table" class="w-4 h-4"></i><span class="text-[10px] font-black uppercase tracking-widest">Таблица данных</span></div>`;
            
            let tableRows = '';
            const previewRows = Math.min(card.rows, 5);
            const previewCols = Math.min(card.cols, 4);

            for (let r = 0; r < previewRows; r++) {
               let colsHtml = '';
               for (let c = 0; c < previewCols; c++) {
                  const val = card.tableData[r] && card.tableData[r][c] ? card.tableData[r][c] : '';
                  colsHtml += `<td class="p-3 border-r border-gray-100 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 truncate max-w-[100px]">${esc(val)}</td>`;
               }
               if (card.cols > previewCols) colsHtml += `<td class="p-3 text-xs text-gray-400 italic bg-gray-50/50 dark:bg-gray-800/50">...</td>`;
               tableRows += `<tr class="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">${colsHtml}</tr>`;
            }
            if (card.rows > previewRows) tableRows += `<tr><td colspan="${previewCols + 1}" class="p-3 text-xs text-gray-400 italic text-center bg-gray-50/50 dark:bg-gray-800/50">И еще ${card.rows - previewRows} строк... Нажмите «Изменить» для просмотра.</td></tr>`;

            body.innerHTML = `<div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-[2rem] overflow-hidden shadow-sm">
                <div class="flex justify-between items-center bg-gray-50 dark:bg-gray-800/80 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <span class="text-sm font-bold text-gray-700 dark:text-gray-200">Структура таблицы</span>
                  <span class="text-[10px] font-black bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-800">${Number(card.cols) || 0}x${Number(card.rows) || 0}</span>
                </div>
                <div class="overflow-x-auto hide-scroll">
                  <table class="w-full text-left border-collapse">
                    <tbody>${tableRows}</tbody>
                  </table>
                </div>
            </div>`;
        } else if (card.type === 'timer') {
            header.innerHTML = `<div class="flex items-center gap-2 text-rose-500 mb-2"><i data-lucide="timer" class="w-4 h-4"></i><span class="text-[10px] font-black uppercase tracking-widest">Таймер</span></div>`;
            const target = new Date(card.targetDate).getTime();
            const now = new Date().getTime();
            const diff = target - now;
            let timeHtml = '';
            if (diff > 0) {
                const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                timeHtml = `<div class="text-4xl font-black text-rose-500 mb-2">${d}д ${h}ч ${m}м</div>`;
            } else {
                timeHtml = `<div class="text-2xl font-black text-gray-500 uppercase tracking-widest mb-2">Время вышло</div>`;
            }
            body.innerHTML = `<div class="bg-rose-50/50 dark:bg-rose-900/20 p-8 rounded-[2rem] border border-rose-100 dark:border-rose-800/50 flex flex-col items-center text-center">
                ${timeHtml}
                <div class="text-sm font-bold text-gray-600 dark:text-gray-300">Окончание: ${new Date(card.targetDate).toLocaleString('ru-RU')}</div>
            </div>`;
        } else if (card.type === 'todo') {
            header.innerHTML = `<div class="flex items-center gap-2 text-cyan-500 mb-2"><i data-lucide="list-todo" class="w-4 h-4"></i><span class="text-[10px] font-black uppercase tracking-widest">Быстрый чек-лист</span></div>`;
            const doneCount = card.checklist.filter(i => i.isCompleted).length;
            const percent = Math.round((doneCount / card.checklist.length) * 100) || 0;
            const itemsHtml = card.checklist.map((item, idx) => `
                <div onclick="event.stopPropagation(); toggleBoardTodo(${jsArg(colId)}, ${jsArg(card.id)}, ${idx}); setTimeout(()=>openViewModal(${jsArg(colId)}, ${jsArg(card.id)}), 150)" class="flex items-start gap-3 p-4 bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 transition-colors hover:border-cyan-300 dark:hover:border-cyan-700 shadow-sm cursor-pointer">
                  <div class="w-6 h-6 flex-shrink-0 mt-0.5 rounded-lg border-2 flex items-center justify-center transition-all ${item.isCompleted ? 'bg-cyan-500 border-cyan-500' : 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600'}">
                    ${item.isCompleted ? '<i data-lucide="check" class="w-4 h-4 text-white"></i>' : ''}
                  </div>
                  <span class="text-sm font-medium ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'} leading-relaxed select-none flex-1">${esc(item.text)}</span>
                </div>
            `).join('');
            body.innerHTML = `<div class="bg-cyan-50/50 dark:bg-cyan-900/20 p-6 rounded-[2rem] border border-cyan-100 dark:border-cyan-800/50">
                <div class="flex justify-between items-center mb-3"><span class="text-xs font-bold text-gray-500 uppercase tracking-widest">Прогресс</span><span class="text-cyan-500 font-black">${percent}%</span></div>
                <div class="w-full h-2 bg-white dark:bg-gray-800 rounded-full mb-6 overflow-hidden"><div class="bg-cyan-500 h-full transition-all" style="width: ${percent}%"></div></div>
                <div class="space-y-3">${itemsHtml}</div>
            </div>`;
        } else if (card.type === 'link') {
            header.innerHTML = `<div class="flex items-center gap-2 text-gray-500 mb-2"><i data-lucide="link" class="w-4 h-4"></i><span class="text-[10px] font-black uppercase tracking-widest">Закладка</span></div>`;
            body.innerHTML = `<div class="bg-gray-50 dark:bg-gray-800/50 p-8 rounded-[2rem] border border-gray-200 dark:border-gray-700 text-center">
                <div class="w-20 h-20 bg-white dark:bg-gray-900 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-md border border-gray-100 dark:border-gray-800"><i data-lucide="external-link" class="w-10 h-10 text-gray-400"></i></div>
                <a href="${esc(safeUrl(card.url))}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 dark:text-blue-400 font-black text-xl break-all hover:underline mb-3 block leading-tight">${esc(card.url)}</a>
                <p class="text-sm text-gray-500 font-medium">Нажмите на ссылку, чтобы перейти на сайт.</p>
            </div>`;
        } else {
            header.innerHTML = `<div class="flex items-center gap-2 text-blue-500 mb-2"><i data-lucide="layers" class="w-4 h-4"></i><span class="text-[10px] font-black uppercase tracking-widest">Задача проекта</span></div>`;        let taskHtml = '';
            // ЭНТЕРПРАЙЗ МИКРО-УЛУЧШЕНИЕ: Интерактивный Hover и Полноэкранный вызов для оригинала
            const safeImage = safeUrl(card.image);
            const safeYt = safeYoutubeEmbed(card.youtubeEmbed);
            if (safeImage) taskHtml += `
              <div class="relative group mb-6 cursor-zoom-in overflow-hidden rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-700" onclick="openFullscreenImage(${jsArg(safeImage)})">
                <img src="${esc(safeImage)}" class="w-full h-64 object-cover transition-transform duration-500 group-hover:scale-105">
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                  <i data-lucide="maximize-2" class="w-10 h-10 text-white drop-shadow-lg pointer-events-none"></i>
                </div>
              </div>`;
            if (safeYt) taskHtml += `<div class="relative w-full overflow-hidden rounded-[2rem] mb-6 border border-gray-100 dark:border-gray-800 shadow-md bg-black"><iframe src="${esc(safeYt)}" class="w-full aspect-video rounded-[2rem] pointer-events-auto" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
            if (card.description) taskHtml += `<div class="md-content mb-8 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group"><div class="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-80"></div>${sanitizeHTML(marked.parse(String(card.description)))}</div>`;
            if (card.checklist && card.checklist.length) {
                taskHtml += `<div class="space-y-3 mb-6">${card.checklist.map((item, i) => `
                    <div onclick="toggleChecklistView(${i}); event.stopPropagation();" class="flex items-start gap-3 p-4 bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer group">
                        <div class="w-6 h-6 rounded-lg border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${item.isCompleted ? 'bg-blue-500 border-blue-500' : 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600'}">
                            ${item.isCompleted ? '<i data-lucide="check" class="w-4 h-4 text-white"></i>' : ''}
                        </div>
                        <span class="text-sm font-medium flex-1 ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'} leading-relaxed select-none">${esc(item.text)}</span>
                    </div>`).join('')}</div>`;
            }
            body.innerHTML = taskHtml || `<div class="p-10 text-center text-gray-400 italic">Описание и подзадачи отсутствуют</div>`;
        }

    renderContentComments(card.comments);
    toggleModal('contentViewModal', true);
}

function renderPollResults(card) {
    if (card.isAnonymous) return `<div class="p-10 bg-gray-50 dark:bg-gray-900/50 rounded-[2rem] border border-dashed border-gray-200 dark:border-gray-700 text-center text-gray-500 text-sm font-medium"><i data-lucide="ghost" class="w-8 h-8 mx-auto mb-3 opacity-20"></i>Анонимный опрос. Имена скрыты.</div>`;
    return card.options.map(opt => `
        <div class="bg-gray-50/50 dark:bg-gray-900/30 p-5 rounded-[2rem] border border-gray-100 dark:border-gray-800 mb-4 transition-all hover:bg-white dark:hover:bg-gray-800">
            <div class="flex justify-between font-bold text-sm mb-4"><span class="dark:text-white">${esc(opt.text)}</span><span class="text-purple-500 font-black">${(opt.votes || []).length}</span></div>
            <div class="flex flex-wrap gap-2">${(opt.votes||[]).map(uid => getAvatarHTML((boardData.users||{})[uid] || {name:'User', avatar:''}, 'w-8 h-8')).join('') || '<span class="text-[10px] text-gray-400 italic">Голосов нет</span>'}</div>
        </div>`).join('');
}

function copyDeepLinkFromView() {
  if (!activeContentView) return;
  const url = window.location.origin + window.location.pathname + '?b=' + BOARD_ID + '&c=' + activeContentView.cardId;
  navigator.clipboard.writeText(url);
  showSystemToast('Ссылка скопирована!', 'Прямая ссылка на этот объект скопирована в буфер обмена.', 'link', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/30');
}

function addColumn() { 
  const newName = "Новая колонка";
  // ЭНТЕРПРАЙЗ: Привязываем новую колонку к активной вкладке (пространству)
  columns.push({ id: Date.now(), name: newName, color: 'default', sortBy: 'manual', spaceId: currentSpaceId, cards: [] }); 
  persist(); 
  if (!isLocalBoard) logActivity(`Создал(а) колонку "${newName}"`, 'layout-template');
  render(); // Обновляем UI после добавления
}

function openColModal(id) { 
  editingColId = id; 
  const col = columns.find(c => c.id == id); 
  if (!col) return;
  selectedColColor = col.color || 'default'; 
  document.getElementById('colNameInput').value = col.name; 
  document.getElementById('colWipInput').value = col.wipLimit || 0; 
  document.getElementById('colSortInput').value = col.sortBy || 'manual';
  renderColorPicker(); 
  toggleModal('colModal', true); 
}

function closeColModal() { toggleModal('colModal', false); }

function saveColumn() { 
  const newName = document.getElementById('colNameInput').value.trim();
  const wipLimit = parseInt(document.getElementById('colWipInput').value) || 0;
  const sortBy = document.getElementById('colSortInput').value;
  
  const col = columns.find(c => c.id == editingColId);
  const oldName = col ? col.name : "";

  columns = columns.map(c => c.id == editingColId ? {...c, name: newName, color: selectedColColor, wipLimit: wipLimit, sortBy: sortBy} : c); 
  persist(); 
  
  if (!isLocalBoard) {
    if (oldName !== newName) {
      logActivity(`Переименовал(а) колонку "${oldName}" в "${newName}"`, 'type');
    } else {
      logActivity(`Изменил(а) настройки колонки "${newName}"`, 'settings-2');
    }
  }
  
  closeColModal(); 
  render(); 
}

function deleteColumn() { 
  const col = columns.find(c => c.id == editingColId);
  const colName = col ? col.name : "колонку";

  openConfirmModal('Удалить колонку?', 'Все задачи внутри будут удалены. Доступна отмена (5 сек).', 'Удалить', true, () => {
    const colCopy = JSON.parse(JSON.stringify(columns.find(c => c.id == editingColId)));
    const colIndex = columns.findIndex(c => c.id == editingColId);
    
    const deletedColId = editingColId;
    columns = columns.filter(c => c.id != editingColId); 
    persist(); 
    if (!isLocalBoard) logActivity(`Удалил(а) колонку "${colName}" и весь её контент`, 'layout-x');
    // Карточки облака удаляем после окна отмены, если колонку так и не вернули
    if (!isLocalBoard) setTimeout(() => {
      if (!columns.some(c => c.id == deletedColId)) purgeCloudCards([deletedColId]);
    }, 8000);
    closeColModal(); 
    render(); 
    
    setUndoAction(() => {
       columns.splice(colIndex, 0, colCopy);
       persist();
       render();
       showSystemToast('Восстановлено', `Колонка "${colName}" возвращена.`, 'refresh-cw', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/30');
    }, `Колонка "${colName}" удалена`);
  });
}

// ЭНТЕРПРАЙЗ: Массовая архивация всех карточек колонки (Sprint Clear)
async function archiveAllCardsInColumn() {
  const col = columns.find(c => c.id == editingColId);
  if (!col || !col.cards || col.cards.length === 0) {
    return showSystemToast('Внимание', 'В этой колонке нет задач для архивации.', 'info', 'text-blue-500', 'bg-blue-50 dark:bg-blue-900/30');
  }
  
  openConfirmModal('Архивировать все?', `Все активные задачи (${col.cards.length} шт.) будут перенесены в Архив проекта.`, 'В архив', false, async () => {
    closeColModal();
    showSystemToast('Архивация...', 'Переносим задачи в хранилище.', 'loader-2', 'text-amber-500 animate-spin', 'bg-amber-50 dark:bg-amber-900/20');
    
    if (isLocalBoard) {
      columns = columns.map(c => {
        if (c.id == editingColId) {
          c.cards = c.cards.map(card => ({ ...card, archived: true }));
        }
        return c;
      });
      persist();
      render();
      showSystemToast('Готово', 'Все задачи колонки заархивированы.', 'archive', 'text-amber-500', 'bg-amber-50 dark:bg-amber-900/30');
    } else {
      // Пакетное обновление для Cloud
      const batch = db.batch();
      col.cards.forEach(card => {
        const cardRef = db.collection("boards").doc(BOARD_ID).collection("cards").doc(String(card.id));
        batch.update(cardRef, { 
          archived: true,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
      showSystemToast('Готово', 'Все задачи колонки заархивированы.', 'archive', 'text-amber-500', 'bg-amber-50 dark:bg-amber-900/30');
    }
  });
}

  function renderColorPicker() { document.getElementById('colorPicker').innerHTML = Object.entries(BOARD_UI_COLORS).map(([key, data]) => `<button onclick="selectedColColor=${jsArg(key)}; renderColorPicker()" class="w-10 h-10 rounded-full border-4 transition-all shadow-sm ${selectedColColor === key ? 'border-gray-900 dark:border-white scale-110 shadow-md' : 'border-transparent'}" style="background-color: ${data.hex};"></button>`).join(''); }

  function openEditModal(colId, cardId = null) {
  currentColumn = colId; 
  
  // FIX: Используем нестрогое сравнение (==) для корректного поиска ID (строка vs число)
  const targetCol = columns.find(c => c.id == colId);
  editingCard = (cardId && targetCol) ? targetCol.cards.find(c => c.id == cardId) : null;
  
  activeTags = editingCard ? [...(editingCard.tags || [])] : []; 
  pendingImageFile = null;
  activeChecklist = editingCard && editingCard.checklist ? [...editingCard.checklist] : [];
  
  document.getElementById('editTitle').value = editingCard?.title || ''; 
  document.getElementById('editDescription').value = editingCard?.description || '';
  document.getElementById('editDueDate').value = editingCard?.dueDate || '';
  document.getElementById('editPriority').value = editingCard?.priority || 'normal';
  document.getElementById('editStoryPoints').value = editingCard?.storyPoints || '';
  document.getElementById('uploadStatus').innerText = '';
  document.getElementById('aiImagePrompt').value = ''; // Сброс промпта при открытии
  document.getElementById('editYoutubeLink').value = editingCard?.youtubeRaw || ''; // Восстанавливаем ссылку на видео
  
  const imgPreview = document.getElementById('editImagePreview');
  const ytPreview = document.getElementById('editYoutubePreview');
  const removeBtn = document.getElementById('removeImageBtn');

  // Сброс состояния превью
  imgPreview.classList.add('hidden');
  if (ytPreview) ytPreview.classList.add('hidden');
  document.getElementById('dropzoneText').classList.remove('opacity-0');
  if (removeBtn) removeBtn.classList.add('hidden');

  if (editingCard?.youtubeEmbed) {
    if (ytPreview) {
      ytPreview.src = editingCard.youtubeEmbed;
      ytPreview.classList.remove('hidden');
    }
    document.getElementById('dropzoneText').classList.add('opacity-0');
    if (removeBtn) removeBtn.classList.remove('hidden');
  } else if (editingCard?.image) { 
    imgPreview.src = editingCard.image; 
    imgPreview.classList.remove('hidden'); 
    document.getElementById('dropzoneText').classList.add('opacity-0'); 
    if (removeBtn) removeBtn.classList.remove('hidden');
  }
  
  // ЭНТЕРПРАЙЗ: Управление видимостью кнопок клонирования и ссылки
  const btnDup = document.getElementById('btnDuplicateCard');
  const btnLink = document.getElementById('btnCopyDeepLink');
  if (editingCard) {
      if(btnDup) btnDup.classList.remove('hidden');
      if(btnLink) btnLink.classList.remove('hidden');
  } else {
      if(btnDup) btnDup.classList.add('hidden');
      if(btnLink) btnLink.classList.add('hidden');
  }
  
  renderTagsPicker(); 
  renderChecklistEdit(); 
  toggleModal('editCardModal', true);
}
  
function closeEditModal() { toggleModal('editCardModal', false); }

// ЭНТЕРПРАЙЗ: Глубокие ссылки и умное клонирование карточек
function duplicateCard() {
  if (!editingCard) return;
  openConfirmModal('Дублировать задачу?', 'Будет создана точная копия этой карточки в текущей колонке.', 'Создать копию', false, async () => {
    const newCardId = 'card_' + Date.now();
    const clonedCard = JSON.parse(JSON.stringify(editingCard)); // Глубокое клонирование
    clonedCard.id = newCardId;
    clonedCard.title = clonedCard.title + ' (Копия)';
    clonedCard.order = allCards.length;
    // ЭНТЕРПРАЙЗ: Очищаем комментарии при клонировании, чтобы диалоги не дублировались
    clonedCard.comments = []; 
    clonedCard.createdAt = new Date().toISOString();
    
    if (isLocalBoard) {
        const col = columns.find(c => c.id == currentColumn);
        if (col) {
            if(!col.cards) col.cards = [];
            col.cards.push(clonedCard);
            persist();
            render();
        }
    } else {
        await db.collection("boards").doc(BOARD_ID).collection("cards").doc(newCardId).set({
          ...clonedCard,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    closeEditModal();
    if(typeof fireConfetti === 'function') fireConfetti();
    showSystemToast('Скопировано', 'Точная копия задачи добавлена на доску.', 'copy', 'text-indigo-500', 'bg-indigo-50 dark:bg-indigo-900/30');
  });
}

function copyCardDeepLink() {
  if (!editingCard) return;
  const url = window.location.origin + window.location.pathname + '?b=' + BOARD_ID + '&c=' + editingCard.id;
  navigator.clipboard.writeText(url);
  showSystemToast('Ссылка скопирована!', 'Прямая ссылка на эту задачу скопирована в буфер обмена.', 'link', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/30');
}

const dropzone = document.getElementById('dropzoneLabel');
dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20'); };
dropzone.ondragleave = (e) => { e.preventDefault(); dropzone.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20'); };
dropzone.ondrop = (e) => { e.preventDefault(); dropzone.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20'); handleImageSelection(e.dataTransfer.files[0]); };
document.getElementById('editImage').addEventListener('change', e => handleImageSelection(e.target.files[0]));

function handleImageSelection(file) {
  if(file && file.type.startsWith('image/')) { 
    pendingImageFile = file; 
    document.getElementById('editImagePreview').src = URL.createObjectURL(file); 
    document.getElementById('editImagePreview').classList.remove('hidden'); 
    const ytPreview = document.getElementById('editYoutubePreview');
    if (ytPreview) { ytPreview.classList.add('hidden'); ytPreview.src = ''; }
    document.getElementById('dropzoneText').classList.add('opacity-0'); 
    const removeBtn = document.getElementById('removeImageBtn');
    if (removeBtn) removeBtn.classList.remove('hidden');
  }
}

// ЭНТЕРПРАЙЗ: Универсальный сброс медиа (Картинки и YouTube)
function removeMedia() {
  pendingImageFile = null;
  if (editingCard) {
    editingCard.image = null;
    editingCard.youtubeRaw = null;
    editingCard.youtubeEmbed = null;
  }
  
  const imgPreview = document.getElementById('editImagePreview');
  imgPreview.classList.add('hidden');
  imgPreview.src = '';
  
  const ytPreview = document.getElementById('editYoutubePreview');
  if (ytPreview) {
    ytPreview.classList.add('hidden');
    ytPreview.src = '';
  }

  const ytInput = document.getElementById('editYoutubeLink');
  if (ytInput) ytInput.value = '';
  
  document.getElementById('dropzoneText').classList.remove('opacity-0');
  const removeBtn = document.getElementById('removeImageBtn');
  if (removeBtn) removeBtn.classList.add('hidden');
}

function extractYoutubePreview(event) {
  if (event) event.preventDefault();
  let ytVal = document.getElementById('editYoutubeLink').value.trim();
  let ytEmbedUrl = null;
  if (ytVal) {
    const ytMatch = ytVal.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (ytMatch && ytMatch[1]) ytEmbedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
  }
  
  if (ytEmbedUrl) {
    document.getElementById('dropzoneText').classList.add('opacity-0');
    const iframe = document.getElementById('editYoutubePreview');
    if (iframe) {
        iframe.src = ytEmbedUrl;
        iframe.classList.remove('hidden');
    }
    document.getElementById('editImagePreview').classList.add('hidden');
    const removeBtn = document.getElementById('removeImageBtn');
    if (removeBtn) removeBtn.classList.remove('hidden');
  } else if (ytVal !== '') {
    showSystemToast('Ошибка', 'Некорректная ссылка на YouTube', 'alert-circle', 'text-red-500', 'bg-red-50');
  }
}
  
// ЭНТЕРПРАЙЗ: Генерация обложки карточки через Pollinations AI и перехват в Pipeline
async function generateCardCover() {
  if (!navigator.onLine) return showSystemToast('Офлайн', 'Генерация обложек недоступна без интернета.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
  if (!(await checkAILimit())) return;

  const promptInput = document.getElementById('aiImagePrompt');
  const prompt = promptInput.value.trim();
  if (!prompt) return showSystemToast('Внимание', 'Опишите, какую картинку вы хотите создать.', 'alert-circle', 'text-indigo-500', 'bg-indigo-50');

  const btn = document.getElementById('btnGenerateCover');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Рисую...';
  lucide.createIcons({ root: btn.parentElement });

  const statusEl = document.getElementById('uploadStatus');
  statusEl.innerText = 'AI создает шедевр...';

  try {
    // Используем seed для уникальности, nologo для чистоты изображения
    const seed = Math.floor(Math.random() * 100000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=400&nologo=true&seed=${seed}`;
    
    // Скачиваем изображение как Blob для создания виртуального File
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Network response was not ok");
    
    const blob = await response.blob();
    const file = new File([blob], `ai_cover_${seed}.jpg`, { type: 'image/jpeg' });
    
    // Инжектим сгенерированный файл в стандартный конвейер (будет загружен на ImgBB при сохранении)
    handleImageSelection(file);
    
    statusEl.innerText = '';
    showSystemToast('AI Магия', 'Обложка сгенерирована! Не забудьте сохранить карточку.', 'sparkles', 'text-indigo-500', 'bg-indigo-50 dark:bg-indigo-900/30');
    if(typeof fireConfetti === 'function') fireConfetti();
  } catch (err) {
    statusEl.innerText = '';
    showSystemToast('Ошибка', 'Сбой при генерации картинки. Попробуйте еще раз.', 'alert-triangle', 'text-red-500', 'bg-red-50');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
    lucide.createIcons({ root: btn.parentElement });
  }
}

function renderTagsPicker() { document.getElementById('editTagsContainer').innerHTML = getBoardTags().map(t => `<button onclick="toggleTag(${jsArg(t.id)})" class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${activeTags.includes(t.id) ? 'border-transparent shadow-sm ' + esc(t.color) : 'border-gray-200 dark:border-gray-700 text-gray-500'}">${esc(t.name)}</button>`).join(''); }
function toggleTag(tagId) { activeTags.includes(tagId) ? activeTags = activeTags.filter(t => t !== tagId) : activeTags.push(tagId); renderTagsPicker(); }

// GRANULAR WRITE: Сохранение отдельного документа в подколлекцию
// ГЛОБАЛЬНЫЙ КОНТРОЛЛЕР ПОЛНОЭКРАННЫХ ИЗОБРАЖЕНИЙ (Lightbox API)
function openFullscreenImage(url) {
  const overlay = document.getElementById('fullscreenImageOverlay');
  const img = document.getElementById('fullscreenImageSrc');
  img.src = url;
  overlay.classList.remove('hidden');
  setTimeout(() => {
     overlay.classList.remove('opacity-0');
     img.classList.remove('scale-95');
     img.classList.add('scale-100');
  }, 10);
}

function closeFullscreenImage() {
  const overlay = document.getElementById('fullscreenImageOverlay');
  const img = document.getElementById('fullscreenImageSrc');
  overlay.classList.add('opacity-0');
  img.classList.remove('scale-100');
  img.classList.add('scale-95');
  setTimeout(() => { overlay.classList.add('hidden'); img.src = ''; }, 300);
}

// ЭНТЕРПРАЙЗ: Оптимизатор медиа на стороне клиента (Client-Side Compression).
// Сжимает картинки в 5-10 раз ДО отправки на сервер. Экономит трафик, память Firebase и рендеринг DOM.
function compressImageClientSide(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Рендерим изображение на холст
        ctx.drawImage(img, 0, 0, width, height);
        
        // Конвертируем обратно в File с агрессивным сжатием JPEG
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Canvas is empty'));
          const safeName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
          resolve(new File([blob], safeName, { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', quality);
      };
      img.onerror = error => reject(error);
    };
    reader.onerror = error => reject(error);
  });
}

async function saveCard() {
  const titleVal = document.getElementById('editTitle').value.trim();
  const descVal = document.getElementById('editDescription').value;
  const dateVal = document.getElementById('editDueDate').value;
  const priorityVal = document.getElementById('editPriority').value;
  const spVal = document.getElementById('editStoryPoints').value;
  
  // ЭНТЕРПРАЙЗ: Интеллектуальный парсинг и валидация YouTube ссылок
  let ytVal = document.getElementById('editYoutubeLink').value.trim();
  let ytEmbedUrl = null;
  if (ytVal) {
    const ytMatch = ytVal.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (ytMatch && ytMatch[1]) ytEmbedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
  }
  
  // КРИТИЧЕСКИЙ ФИКС: Защита от undefined полей, из-за которых Firestore отклоняет транзакцию
  let imageUrl = editingCard && editingCard.image !== undefined ? editingCard.image : null;
  let imageThumbUrl = editingCard && editingCard.imageThumb !== undefined ? editingCard.imageThumb : (imageUrl || null);

  // UX: Блокировка кнопки сохранения для предотвращения двойных кликов и ощущения зависания
  const saveBtn = document.querySelector('#editCardModal button[onclick="saveCard()"]');
  const ogSaveBtnHtml = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) {
     saveBtn.disabled = true;
     saveBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> <span class="hidden sm:inline">Сохранение...</span>';
     lucide.createIcons({ root: saveBtn.parentNode });
  }

  if (pendingImageFile) { 
    if (!navigator.onLine) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = ogSaveBtnHtml; lucide.createIcons({ root: saveBtn.parentNode }); }
      return showSystemToast('Офлайн', 'Загрузка обложек недоступна без интернета. Сохраните задачу без картинки.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
    }
    showSystemToast('Оптимизация...', 'Сжимаем и сохраняем обложку', 'loader-2', 'text-blue-500 animate-spin', 'bg-blue-50');
    try {
      // ЭНТЕРПРАЙЗ: Клиентская компрессия (Canvas) перед отправкой! Снижает вес в 5-10 раз!
      const compressedFile = await compressImageClientSide(pendingImageFile, 800, 0.7);
      
      const fd = new FormData(); 
      fd.append('image', compressedFile); 
      
      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: fd }); 
      const data = await res.json(); 
      
      imageUrl = data.data.url;
      // Берем оптимизированную миниатюру от ImgBB для моментального рендера в ленте доски
      imageThumbUrl = data.data.thumb?.url || data.data.display_url || data.data.url;
    } catch(e) { 
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = ogSaveBtnHtml; lucide.createIcons({ root: saveBtn.parentNode }); }
      return showSystemToast('Ошибка', 'Сбой загрузки обложки', 'x-circle', 'text-red-500', 'bg-red-50'); 
    }
  }
  
  const cardId = editingCard ? editingCard.id : 'card_' + Date.now();
  
  // Тщательная санация объекта от возможных undefined (превращаем в null или дефолт)
  const cardData = { 
    title: titleVal || 'Без названия', 
    description: descVal || "", 
    tags: activeTags || [], 
    image: imageUrl || null,
    imageThumb: imageThumbUrl || null,
    youtubeRaw: ytVal || null,
    youtubeEmbed: ytEmbedUrl || null,
    comments: editingCard && editingCard.comments ? editingCard.comments : [], 
    author: editingCard && editingCard.author ? editingCard.author : currentUser, 
    dueDate: dateVal || "", 
    priority: priorityVal || 'normal',
    storyPoints: spVal || null,
    checklist: activeChecklist || [],
    columnId: currentColumn,
    order: editingCard && editingCard.order !== undefined ? editingCard.order : allCards.length,
    archived: editingCard && editingCard.archived !== undefined ? editingCard.archived : false
  };
  
  try {
    if (isLocalBoard) {
      columns = columns.map(col => {
        if (col.id == currentColumn) {
          const cards = col.cards || [];
          const updated = editingCard ? cards.map(c => c.id == cardId ? {id: cardId, ...cardData} : c) : [...cards, {id: cardId, ...cardData}];
          return {...col, cards: updated};
        }
        return col;
      });
      persist();
      render();
    } else {
      await db.collection("boards").doc(BOARD_ID).collection("cards").doc(String(cardId)).set({
        ...cardData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      // ЭНТЕРПРАЙЗ: Запись в журнал действий
      if (!editingCard) {
        logActivity(`Создал(а) задачу "${cardData.title}"`, 'plus-circle');
      } else {
        logActivity(`Обновил(а) детали задачи "${cardData.title}"`, 'edit-3');
      }
    }

    closeEditModal();
    showSystemToast('Сохранено', 'Данные успешно обновлены.', 'check', 'text-green-500', 'bg-green-50');
  } catch (err) {
    console.error("Save Error:", err);
    showSystemToast('Ошибка', 'Не удалось сохранить задачу. Сервер отклонил данные.', 'alert-triangle', 'text-red-500', 'bg-red-50');
  } finally {
    // В любом исходе возвращаем кнопку в рабочее состояние
    if (saveBtn) { 
      saveBtn.disabled = false; 
      saveBtn.innerHTML = ogSaveBtnHtml; 
      lucide.createIcons({ root: saveBtn.parentNode }); 
    }
  }
}
  
function deleteCard() { 
  if (!editingCard) return;
  const title = editingCard.title;
  openConfirmModal('Удалить навсегда?', 'Удаленную карточку можно будет восстановить в течение 5 секунд.', 'Удалить задачу', true, () => {
    dispatchCardDelete(editingCard.id, currentColumn);
    if (!isLocalBoard) logActivity(`Удалил(а) задачу "${title}" навсегда`, 'trash-2');
    closeEditModal();
  });
}
  
function archiveCard() {
  if (!editingCard) return;
  const title = editingCard.title;
  openConfirmModal('Отправить в архив?', 'Задача исчезнет с доски, но останется в разделе "Архив".', 'В архив', false, () => {
    dispatchCardUpdate(editingCard.id, currentColumn, { archived: true });
    if (!isLocalBoard) logActivity(`Отправил(а) задачу "${title}" в архив`, 'archive');
    closeEditModal(); 
    showSystemToast('Архивировано', 'Задача перемещена в хранилище.', 'archive', 'text-amber-500', 'bg-amber-50');
  });
}

function renderChecklistEdit() {
  const container = document.getElementById('editChecklistContainer');
  const progressText = document.getElementById('checklistProgressText');
  const progressBar = document.getElementById('checklistProgressBar');
  
  if (!activeChecklist || activeChecklist.length === 0) { 
    container.innerHTML = ''; 
    progressText.innerText = '0%'; 
    progressBar.style.width = '0%'; 
    return; 
  }
  
  const doneCount = activeChecklist.filter(i => i.isCompleted).length;
  const percent = Math.round((doneCount / activeChecklist.length) * 100);
  progressText.innerText = `${percent}%`; 
  progressBar.style.width = `${percent}%`;
  progressBar.className = percent === 100 ? 'bg-green-500 h-full transition-all duration-300' : 'bg-blue-500 h-full transition-all duration-300';
  
  container.innerHTML = activeChecklist.map((item, index) => `
    <div class="flex items-start justify-between group bg-white dark:bg-gray-800 p-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm" data-id="${esc(index)}">
      <div class="drag-handle cursor-grab text-gray-400 hover:text-blue-500 px-2 flex-shrink-0 mt-0.5">
        <i data-lucide="grip-vertical" class="w-4 h-4"></i>
      </div>
      <div onclick="toggleChecklistItemEdit(${index})" class="flex items-start gap-3 cursor-pointer flex-1 px-2 min-w-0">
        <div class="w-5 h-5 flex-shrink-0 mt-0.5 rounded-md border-2 flex items-center justify-center transition-all ${item.isCompleted ? 'bg-blue-500 border-blue-500' : 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600'}">
          ${item.isCompleted ? '<i data-lucide="check" class="w-3.5 h-3.5 text-white"></i>' : ''}
        </div>
        <span class="text-sm ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'} break-words flex-1 leading-tight select-none">${esc(item.text)}</span>
      </div>
      <button onclick="removeChecklistItem(${index})" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex-shrink-0 mt-[-4px]">
        <i data-lucide="trash-2" class="w-4 h-4"></i>
      </button>
    </div>
  `).join('');
  lucide.createIcons();

  // Инициализация Drag and Drop для чек-листа
  if (window.checklistSortable) window.checklistSortable.destroy();
  window.checklistSortable = new Sortable(container, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'sortable-ghost',
    onEnd: function (evt) {
      // Меняем элементы местами в массиве при перетаскивании
      const movedItem = activeChecklist.splice(evt.oldIndex, 1)[0];
      activeChecklist.splice(evt.newIndex, 0, movedItem);
      renderChecklistEdit(); // Перерисовка для обновления индексов
    }
  });
}

function addChecklistItem() {
  const input = document.getElementById('newChecklistItem'); const text = input.value.trim();
  if (!text) return; activeChecklist.push({ id: Date.now(), text, isCompleted: false }); input.value = ''; renderChecklistEdit();
}

function toggleChecklistItemEdit(index) { 
  activeChecklist[index].isCompleted = !activeChecklist[index].isCompleted; 
  renderChecklistEdit(); 
}

function removeChecklistItem(index) { activeChecklist.splice(index, 1); renderChecklistEdit(); }
  
function renderChecklistView() {
  const container = document.getElementById('viewChecklistContainer');
  if (!viewingCard.checklist || viewingCard.checklist.length === 0) { container.innerHTML = ''; return; }
  const doneCount = viewingCard.checklist.filter(i => i.isCompleted).length;
  const percent = Math.round((doneCount / viewingCard.checklist.length) * 100);
  const colorClass = percent === 100 ? 'bg-green-500' : 'bg-blue-500';
  let html = `
    <div class="mb-2 flex items-center justify-between"><h3 class="text-sm font-bold flex items-center gap-2 text-gray-900 dark:text-white"><i data-lucide="check-square" class="w-4 h-4 text-blue-500"></i> Чек-лист подзадач</h3><span class="text-xs font-bold text-gray-500">${percent}%</span></div>
    <div class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-4"><div class="${colorClass} h-full transition-all" style="width: ${percent}%"></div></div>
    <div class="space-y-2">
  `;
  html += viewingCard.checklist.map((item, index) => `
    <div onclick="toggleChecklistView(${index})" class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl cursor-pointer border border-gray-100 dark:border-gray-800 transition-colors hover:border-blue-300">
      <div class="w-6 h-6 flex-shrink-0 mt-0.5 rounded-lg border-2 flex items-center justify-center transition-all ${item.isCompleted ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'}">
        ${item.isCompleted ? '<i data-lucide="check" class="w-4 h-4 text-white"></i>' : ''}
      </div>
      <span class="text-sm font-medium ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'} break-words flex-1 leading-relaxed select-none">${esc(item.text)}</span>
    </div>
  `).join('');
  container.innerHTML = html + '</div>'; lucide.createIcons();
}

function toggleChecklistView(index) {
  viewingCard.checklist[index].isCompleted = !viewingCard.checklist[index].isCompleted;
  
  // Отправляем точечное обновление в Store без полного перерендера UI модалки
  dispatchCardUpdate(viewingCard.id, currentColumn, { checklist: viewingCard.checklist });
  
  // Точечное обновление DOM (Virtual-DOM style)
  const isChecked = viewingCard.checklist[index].isCompleted;
  const elements = document.querySelectorAll(`[onclick="toggleChecklistView(${index}); event.stopPropagation();"]`);
  
  elements.forEach(el => {
      const box = el.querySelector('div');
      const textSpan = el.querySelector('span');
      if (box && textSpan) {
          if (isChecked) {
              box.className = "w-6 h-6 rounded-lg border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors bg-blue-500 border-blue-500";
              box.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-white"></i>';
              textSpan.className = "text-sm font-medium flex-1 line-through text-gray-400 leading-relaxed select-none";
          } else {
              box.className = "w-6 h-6 rounded-lg border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600";
              box.innerHTML = '';
              textSpan.className = "text-sm font-medium flex-1 text-gray-700 dark:text-gray-200 leading-relaxed select-none";
          }
      }
  });
  
  // Вызываем обновление иконок только внутри измененных элементов
  elements.forEach(el => lucide.createIcons({ root: el }));
}
