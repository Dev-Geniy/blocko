// ==========================================
// Blocko Pro · доска — content.js
// Опросы, аудио, просмотр контента, редакторы, голосовые заметки
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// --- ЛОГИКА ОПРОСОВ (POLLS) И КНОПКИ ЕЩЕ ---
let activeColForMore = null;

function openMoreAddModal(colId) {
  activeColForMore = colId;
  const el = document.getElementById('moreAddModal');
  const content = document.getElementById('moreAddContent');
  el.classList.remove('hidden');
  setTimeout(() => {
    el.classList.remove('opacity-0');
    content.classList.remove('scale-95');
  }, 10);
  lucide.createIcons();
}

function closeMoreAddModal() {
  const el = document.getElementById('moreAddModal');
  const content = document.getElementById('moreAddContent');
  el.classList.add('opacity-0');
  content.classList.add('scale-95');
  setTimeout(() => el.classList.add('hidden'), 300);
}

function preparePollCreation() {
  closeMoreAddModal();
  const modal = document.getElementById('pollConstructorModal');
  const content = document.getElementById('pollConstructorContent');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
  }, 10);
  document.getElementById('pollQuestion').focus();
}

function closePollConstructor() {
  const modal = document.getElementById('pollConstructorModal');
  const content = document.getElementById('pollConstructorContent');
  modal.classList.add('opacity-0');
  content.classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
    // Сброс формы
    document.getElementById('pollQuestion').value = "";
    document.getElementById('pollOptionsList').innerHTML = `
      <input type="text" class="poll-opt w-full px-5 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-purple-500 transition-colors dark:text-white" placeholder="Вариант 1">
      <input type="text" class="poll-opt w-full px-5 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-purple-500 transition-colors dark:text-white" placeholder="Вариант 2">
    `;
    document.getElementById('pollAnonymous').checked = false;
  }, 300);
}

function addPollOptionField() {
  const container = document.getElementById('pollOptionsList');
  const input = document.createElement('input');
  input.className = "poll-opt w-full px-5 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-purple-500 transition-colors dark:text-white mt-2";
  input.placeholder = `Вариант ${container.children.length + 1}`;
  container.appendChild(input);
  input.focus();
}

function savePoll() {
  const question = document.getElementById('pollQuestion').value.trim();
  const inputs = document.querySelectorAll('.poll-opt');
  const options = Array.from(inputs).map(i => i.value.trim()).filter(v => v !== "");
  
  if (!question || options.length < 2) {
    return showSystemToast('Ошибка', 'Введите вопрос и минимум 2 варианта.', 'alert-circle', 'text-red-500', 'bg-red-50');
  }

  const cardId = 'poll_' + Date.now();
  const pollData = {
    id: cardId,
    title: question,
    type: 'poll',
    options: options.map(opt => ({ text: opt, votes: [] })),
    isAnonymous: document.getElementById('pollAnonymous').checked,
    author: currentUser,
    archived: false,
    columnId: activeColForMore,
    order: allCards.length,
    createdAt: new Date().toISOString()
  };

  if (isLocalBoard) {
    const colIndex = columns.findIndex(c => c.id == activeColForMore);
    if (colIndex !== -1) {
      if (!columns[colIndex].cards) columns[colIndex].cards = [];
      columns[colIndex].cards.push(pollData);
      persist();
      render();
    }
  } else {
    db.collection("boards").doc(BOARD_ID).collection("cards").doc(cardId).set({
      ...pollData,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // ЭНТЕРПРАЙЗ: Регистрация события создания опроса
    logActivity(`Запустил(а) новый опрос: "${question}"`, 'bar-chart-3');
  }
  closePollConstructor();
}

// FIX: Исправлена логика голосования. Теперь клик по варианту срабатывает корректно через делегирование
function votePoll(colId, cardId, optionIndex) {
  if (!currentUser || !currentUser.id) return;
  
  const uid = currentUser.id;
  // Находим карточку во всех колонках для надежности
  let targetCard = null;
  let targetColId = colId;

  columns.forEach(col => {
    const found = col.cards.find(c => c.id == cardId);
    if (found) { targetCard = found; targetColId = col.id; }
  });

  if (!targetCard || targetCard.type !== 'poll') return;

  let voted = false;
  const updatedOptions = targetCard.options.map((opt, idx) => {
    // Удаляем старый голос пользователя из всех вариантов (переголосование)
    const cleanVotes = (opt.votes || []).filter(v => v !== uid);
    // Добавляем голос в выбранный вариант
    if (idx === optionIndex) {
      cleanVotes.push(uid);
      voted = true;
    }
    return { ...opt, votes: cleanVotes };
  });

  if (voted) {
    fireConfetti();
    dispatchCardUpdate(cardId, targetColId, { options: updatedOptions });
    
    // Мгновенное визуальное обновление локального стейта до прилета данных из БД
    targetCard.options = updatedOptions;
    render(); 
  }
}

// Глобальное управление кастомным плеером
let currentPlayingAudio = null;
let currentAudioBtn = null;

// Надежная замена SVG-иконки Lucide без конфликтов DOM
function updatePlayerIcon(btn, iconName) {
  const oldIcon = btn.querySelector('.btn-icon');
  if (!oldIcon) return;
  
  const classes = oldIcon.getAttribute('class');
  const newIcon = document.createElement('i');
  newIcon.setAttribute('data-lucide', iconName);
  newIcon.setAttribute('class', classes);
  
  oldIcon.parentNode.replaceChild(newIcon, oldIcon);
  lucide.createIcons({ nameAttr: 'data-lucide' });
}

// Передаем ID вместо Base64, чтобы избежать зависаний браузера при рендере DOM
function toggleAudioPlayer(btn, colId, cardId) {
  const progressBar = btn.parentElement.querySelector('.audio-progress');
  
  const col = columns.find(c => c.id == colId);
  if (!col) return;
  const card = col.cards.find(c => c.id == cardId);
  if (!card || !card.audioData) return;

  const audioSrc = card.audioData;

  if (currentPlayingAudio && currentPlayingAudio.src === audioSrc) {
    if (currentPlayingAudio.paused) {
      currentPlayingAudio.play();
      updatePlayerIcon(btn, 'pause');
    } else {
      currentPlayingAudio.pause();
      updatePlayerIcon(btn, 'play');
    }
  } else {
    if (currentPlayingAudio) {
      currentPlayingAudio.pause();
      if (currentAudioBtn) {
        updatePlayerIcon(currentAudioBtn, 'play');
      }
    }
    
    currentPlayingAudio = new Audio(audioSrc);
    currentAudioBtn = btn;
    
    currentPlayingAudio.play().then(() => {
      updatePlayerIcon(btn, 'pause');
    }).catch(err => {
      showSystemToast('Ошибка', 'Не удалось воспроизвести аудио.', 'alert-triangle', 'text-red-500', 'bg-red-50');
    });

    currentPlayingAudio.ontimeupdate = () => {
      if (progressBar) {
        const progress = (currentPlayingAudio.currentTime / currentPlayingAudio.duration) * 100;
        progressBar.style.width = progress + '%';
      }
    };

    currentPlayingAudio.onended = () => {
      updatePlayerIcon(btn, 'play');
      if (progressBar) progressBar.style.width = '0%';
    };
  }
}

// Делегируем удаление через единый диспетчер
function deleteCardDirectly(colId, cardId, typeLabel = 'контент') {
  openConfirmModal(`Удалить ${typeLabel}?`, 'Удаленный объект можно будет вернуть в течение 5 секунд.', 'Удалить навсегда', true, () => {
    dispatchCardDelete(cardId, colId);
  });
}
let activeContentView = null; // { colId, cardId, type }

function openPollStatsModal(colId, cardId) {
    const col = columns.find(c => c.id == colId);
    const card = col.cards.find(c => c.id == cardId);
    activeContentView = { colId, cardId, type: 'poll' };
    
    document.getElementById('cvTitle').innerText = card.title;
    document.getElementById('cvHeader').innerHTML = `<div class="flex items-center gap-2 text-purple-500 mb-2"><i data-lucide="bar-chart-3" class="w-4 h-4"></i><span class="text-[10px] font-black uppercase tracking-widest">Результаты опроса</span></div>`;
    
    const container = document.getElementById('cvBody');
    if (card.isAnonymous) {
        container.innerHTML = `<div class="p-8 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700 text-center text-gray-500 text-sm font-medium">Это анонимный опрос. Имена участников скрыты.</div>`;
    } else {
        container.innerHTML = card.options.map(opt => `
            <div class="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 mb-3">
                <div class="flex justify-between font-bold text-sm mb-3"><span>${esc(opt.text)}</span><span class="text-purple-500">${(opt.votes||[]).length}</span></div>
                <div class="flex flex-wrap gap-2">${(opt.votes||[]).map(uid => getAvatarHTML((boardData.users||{})[uid] || {name:'User', avatar:''}, 'w-7 h-7')).join('') || '<span class="text-[10px] text-gray-400">Нет голосов</span>'}</div>
            </div>
        `).join('');
    }
    
    renderContentComments(card.comments);
    toggleModal('contentViewModal', true);
}

function openAudioModal(colId, cardId) {
    const col = columns.find(c => c.id == colId);
    const card = col.cards.find(c => c.id == cardId);
    activeContentView = { colId, cardId, type: 'audio' };
    
    document.getElementById('cvTitle').innerText = card.title;
    document.getElementById('cvHeader').innerHTML = `<div class="flex items-center gap-2 text-emerald-500 mb-2"><i data-lucide="mic" class="w-4 h-4"></i><span class="text-[10px] font-black uppercase tracking-widest">Голосовая заметка</span></div>`;
    
    document.getElementById('cvBody').innerHTML = `
        <div class="bg-emerald-50/50 dark:bg-emerald-900/20 p-6 rounded-3xl border border-emerald-100 dark:border-emerald-800/50 flex flex-col items-center">
            <button onclick="toggleAudioPlayer(this, ${jsArg(colId)}, ${jsArg(cardId)})" class="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-transform mb-4">
                <i data-lucide="play" class="w-10 h-10 fill-current ml-1 btn-icon"></i>
            </button>
            <div class="w-full h-2 bg-emerald-200 dark:bg-emerald-800 rounded-full overflow-hidden">
                <div class="audio-progress bg-emerald-500 h-full w-0"></div>
            </div>
        </div>
    `;
    
    renderContentComments(card.comments);
    toggleModal('contentViewModal', true);
}

function renderContentComments(comments = []) {
    const list = document.getElementById('cvCommentsList');
    document.getElementById('cvMyAvatar').innerHTML = getAvatarHTML(currentUser, 'w-10 h-10');
    
    if (comments.length === 0) {
        list.innerHTML = `<div class="text-center py-6 text-gray-400 text-xs italic bg-gray-50/50 dark:bg-gray-900/20 rounded-2xl">Обсуждений пока нет</div>`;
    } else {
        list.innerHTML = comments.map(c => {
            const actualUser = (c.user && boardData.users && boardData.users[c.user.id]) ? boardData.users[c.user.id] : (c.user || {});
            return `
            <div class="flex gap-3 bg-white dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                ${getAvatarHTML(actualUser, 'w-8 h-8')}
                <div>
                    <div class="flex items-center gap-2 mb-1"><span class="font-bold text-xs dark:text-white">${esc(actualUser.name)}</span><span class="text-[9px] text-gray-400">${esc(c.time)}</span></div>
                    <div class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed break-words">${esc(c.text)}</div>
                </div>
            </div>`;
        }).join('');
    }
    lucide.createIcons();

    const actionsPanel = document.getElementById('cvActionsPanel');
    const editBtn = document.getElementById('cvEditBtn');
    const myRole = boardData.users && boardData.users[currentUser.id] ? boardData.users[currentUser.id].role : 'editor';
    const isViewer = myRole === 'viewer' && !isLocalBoard;

    if (actionsPanel) { actionsPanel.style.display = isViewer ? 'none' : 'flex'; }
    if (editBtn && activeContentView) {
      const editableTypes = ['task', 'table', 'timer', 'todo', 'link'];
      editBtn.style.display = (editableTypes.includes(activeContentView.type) || !activeContentView.type) ? 'flex' : 'none';
    }
}

function addCommentToContent() {
    const input = document.getElementById('cvCommentInput');
    const text = input.value.trim();
    if (!text || !activeContentView) return;

    const col = columns.find(c => c.id == activeContentView.colId);
    const card = col?.cards.find(c => c.id == activeContentView.cardId);
    if (!card) return;

    const newComment = { text, user: currentUser, time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
    const updatedComments = [...(card.comments || []), newComment];

    input.value = '';
    dispatchCardUpdate(card.id, activeContentView.colId, { comments: updatedComments });
    card.comments = updatedComments;
    renderContentComments(updatedComments);
}

function closeContentViewModal() {
    if (currentPlayingAudio) currentPlayingAudio.pause();
    toggleModal('contentViewModal', false);
}

let editingSpecificCardId = null;

function getCardById(colId, cardId) {
  const col = columns.find(c => c.id == colId);
  const card = col?.cards.find(c => c.id == cardId);
  return { col, card };
}

function insertSpecialCard(cardData) {
  if (isLocalBoard) {
    const col = columns.find(c => c.id == activeColForMore);
    if (col) {
      col.cards.push(cardData);
      persist();
      render();
    }
    return;
  }

  db.collection("boards")
    .doc(BOARD_ID)
    .collection("cards")
    .doc(cardData.id)
    .set({ ...cardData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

// ЭНТЕРПРАЙЗ: Динамический инжект шаблонов для снижения первичного веса DOM (Lazy Init)
function renderDynamicModal(type) {
  const container = document.getElementById('dynamicConstructorContainer');
  let html = '';

  if (type === 'timer') {
    html = `
      <div id="timerConstructorModal" class="fixed inset-0 z-[310] flex items-start justify-center bg-gray-900/40 dark:bg-black/60 glass-modal opacity-0 transition-opacity duration-300 px-4 overflow-y-auto py-10">
        <div class="bg-white dark:bg-gray-900 p-8 rounded-[3rem] w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-700 transform scale-95 transition-transform m-auto" id="timerConstructorContent">
          <div class="flex items-center gap-3 mb-6"><div class="p-2.5 bg-rose-100 dark:bg-rose-900/30 text-rose-500 rounded-xl"><i data-lucide="timer" class="w-5 h-5"></i></div><h3 class="text-xl font-black dark:text-white">Настройки Таймера</h3></div>
          <div class="space-y-4">
            <input type="text" id="timerTitle" placeholder="Событие (Например: Запуск релиза)" class="w-full px-5 py-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:border-rose-500 font-bold dark:text-white">
            <div><label class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Дата и время завершения</label><input type="datetime-local" id="timerTargetDate" class="w-full px-5 py-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none text-sm dark:text-white font-bold"></div>
          </div>
          <div class="flex gap-3 mt-8">
            <button onclick="closeDynamicModal('timerConstructorModal', 'timerConstructorContent')" class="flex-1 py-3.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-2xl transition-colors">Отмена</button>
            <button onclick="saveTimer()" class="flex-1 py-3.5 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-2xl shadow-lg shadow-rose-500/30 active:scale-95 transition-all">Сохранить</button>
          </div>
        </div>
      </div>`;
  } else if (type === 'todo') {
    html = `
      <div id="todoConstructorModal" class="fixed inset-0 z-[310] flex items-start justify-center bg-gray-900/40 dark:bg-black/60 glass-modal opacity-0 transition-opacity duration-300 px-4 overflow-y-auto py-10">
        <div class="bg-white dark:bg-gray-900 p-8 rounded-[3rem] w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-700 transform scale-95 transition-transform m-auto" id="todoConstructorContent">
          <div class="flex items-center gap-3 mb-6"><div class="p-2.5 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-500 rounded-xl"><i data-lucide="list-todo" class="w-5 h-5"></i></div><h3 class="text-xl font-black dark:text-white">Быстрый Чек-лист</h3></div>
          <div class="space-y-4">
            <input type="text" id="todoFastTitle" placeholder="Название списка..." class="w-full px-5 py-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:border-cyan-500 font-bold dark:text-white">
            <div><label class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Пункты (Каждый с новой строки)</label><textarea id="todoFastItems" placeholder="Пункт 1&#10;Пункт 2&#10;Пункт 3" rows="4" class="w-full px-5 py-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none text-sm dark:text-white resize-none"></textarea></div>
          </div>
          <div class="flex gap-3 mt-8">
            <button onclick="closeDynamicModal('todoConstructorModal', 'todoConstructorContent')" class="flex-1 py-3.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-2xl transition-colors">Отмена</button>
            <button onclick="saveTodoFast()" class="flex-1 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-white font-bold rounded-2xl shadow-lg shadow-cyan-500/30 active:scale-95 transition-all">Сохранить</button>
          </div>
        </div>
      </div>`;
  } else if (type === 'link') {
    html = `
      <div id="linkConstructorModal" class="fixed inset-0 z-[310] flex items-start justify-center bg-gray-900/40 dark:bg-black/60 glass-modal opacity-0 transition-opacity duration-300 px-4 overflow-y-auto py-10">
        <div class="bg-white dark:bg-gray-900 p-8 rounded-[3rem] w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-700 transform scale-95 transition-transform m-auto" id="linkConstructorContent">
          <div class="flex items-center gap-3 mb-6"><div class="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl"><i data-lucide="link" class="w-5 h-5"></i></div><h3 class="text-xl font-black dark:text-white">Закладка на ресурс</h3></div>
          <div class="space-y-4">
            <input type="text" id="linkTitle" placeholder="Короткое название..." class="w-full px-5 py-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:border-gray-900 dark:focus:border-white font-bold dark:text-white">
            <input type="url" id="linkUrl" placeholder="https://..." class="w-full px-5 py-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none text-sm dark:text-white">
          </div>
          <div class="flex gap-3 mt-8">
            <button onclick="closeDynamicModal('linkConstructorModal', 'linkConstructorContent')" class="flex-1 py-3.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-2xl transition-colors">Отмена</button>
            <button onclick="saveLink()" class="flex-1 py-3.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-2xl shadow-lg active:scale-95 transition-all">Сохранить</button>
          </div>
        </div>
      </div>`;
  }
  container.innerHTML = html;
  lucide.createIcons({ root: container });
  
  const modal = container.firstElementChild;
  const content = modal.querySelector('div[id$="Content"]');
  setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); }, 10);
}

function closeDynamicModal(modalId, contentId) {
  const modal = document.getElementById(modalId);
  const content = document.getElementById(contentId);
  if (modal && content) {
    modal.classList.add('opacity-0'); content.classList.add('scale-95');
    setTimeout(() => document.getElementById('dynamicConstructorContainer').innerHTML = '', 300);
  }
  editingSpecificCardId = null;
}

function prepareTimerCreation() { closeMoreAddModal(); editingSpecificCardId = null; renderDynamicModal('timer'); }
function closeTimerConstructor() { closeDynamicModal('timerConstructorModal', 'timerConstructorContent'); }
function saveTimer() {
  const title = document.getElementById('timerTitle').value.trim() || 'Таймер';
  const targetDate = document.getElementById('timerTargetDate').value;
  if (!targetDate) return showSystemToast('Ошибка', 'Укажите дату завершения.', 'alert-circle', 'text-red-500', 'bg-red-50');

  if (editingSpecificCardId) {
    dispatchCardUpdate(editingSpecificCardId, activeColForMore, { title, targetDate });
    if (!isLocalBoard) logActivity(`Обновил(а) время в таймере "${title}"`, 'timer');
  } else {
    const cardId = 'timer_' + Date.now();
    const cardData = { id: cardId, title, type: 'timer', targetDate, author: currentUser, archived: false, columnId: activeColForMore, order: allCards.length, comments: [] };
    insertSpecialCard(cardData);
    if (!isLocalBoard) logActivity(`Установил(а) таймер дедлайна: "${title}"`, 'alarm-clock');
  }
  closeTimerConstructor();
}

function prepareTodoCreation() { closeMoreAddModal(); editingSpecificCardId = null; renderDynamicModal('todo'); }
function closeTodoConstructor() { closeDynamicModal('todoConstructorModal', 'todoConstructorContent'); }
function saveTodoFast() {
  const title = document.getElementById('todoFastTitle').value.trim() || 'Чек-лист';
  const itemsText = document.getElementById('todoFastItems').value.trim();
  if (!itemsText) return showSystemToast('Ошибка', 'Введите хотя бы один пункт.', 'alert-circle', 'text-red-500', 'bg-red-50');

  const checklist = itemsText.split('\n').filter(t => t.trim() !== '').map(text => ({ text: text.trim(), isCompleted: false }));
  if (editingSpecificCardId) {
    dispatchCardUpdate(editingSpecificCardId, activeColForMore, { title, checklist });
    if (!isLocalBoard) logActivity(`Обновил(а) чек-лист "${title}"`, 'list-todo');
  } else {
    const cardId = 'todo_' + Date.now();
    const cardData = { id: cardId, title, type: 'todo', checklist, author: currentUser, archived: false, columnId: activeColForMore, order: allCards.length, comments: [] };
    insertSpecialCard(cardData);
    if (!isLocalBoard) logActivity(`Создал(а) чек-лист "${title}"`, 'list-todo');
  }
  closeTodoConstructor();
}

function toggleBoardTodo(colId, cardId, idx) {
  const { card } = getCardById(colId, cardId);
  if (!card || !card.checklist) return;
  card.checklist[idx].isCompleted = !card.checklist[idx].isCompleted;
  if (card.checklist[idx].isCompleted) fireConfetti();
  dispatchCardUpdate(cardId, colId, { checklist: card.checklist });
}

function prepareLinkCreation() { closeMoreAddModal(); editingSpecificCardId = null; renderDynamicModal('link'); }
function closeLinkConstructor() { closeDynamicModal('linkConstructorModal', 'linkConstructorContent'); }
function saveLink() {
  const title = document.getElementById('linkTitle').value.trim() || 'Ссылка';
  let url = document.getElementById('linkUrl').value.trim();
  if (!url) return showSystemToast('Ошибка', 'Вставьте ссылку.', 'alert-circle', 'text-red-500', 'bg-red-50');
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;

  if (editingSpecificCardId) {
    dispatchCardUpdate(editingSpecificCardId, activeColForMore, { title, url });
    if (!isLocalBoard) logActivity(`Обновил(а) ссылку "${title}"`, 'link-2');
  } else {
    const cardId = 'link_' + Date.now();
    const cardData = { id: cardId, title, type: 'link', url, author: currentUser, archived: false, columnId: activeColForMore, order: allCards.length, comments: [] };
    insertSpecialCard(cardData);
    if (!isLocalBoard) logActivity(`Добавил(а) важную ссылку: "${title}"`, 'link-2');
  }
  closeLinkConstructor();
}

// Единый диспетчер Архивации
function handleViewArchive() {
  if (!activeContentView) return;
  openConfirmModal('Отправить в архив?', 'Объект исчезнет с доски, но останется в Архиве проекта.', 'В архив', false, () => {
    dispatchCardUpdate(activeContentView.cardId, activeContentView.colId, { archived: true });
    closeContentViewModal(); 
    showSystemToast('Архивировано', 'Объект перемещен в хранилище.', 'archive', 'text-amber-500', 'bg-amber-50');
  });
}

// Единый диспетчер Удаления
function handleViewDelete() {
  if (!activeContentView) return;
  openConfirmModal(`Удалить объект?`, 'Это действие нельзя отменить, данные будут стерты из облака.', 'Удалить навсегда', true, () => {
    dispatchCardDelete(activeContentView.cardId, activeContentView.colId);
    closeContentViewModal();
    showSystemToast('Удалено', 'Объект успешно удален из проекта.', 'trash-2', 'text-red-500', 'bg-red-50');
  });
}

// Маршрутизатор Редакторов
function openEditModalFromView() {
  if (!activeContentView) return;
  const { type, colId, cardId } = activeContentView;
  closeContentViewModal();

  if (type === 'task' || !type) {
    openEditModal(colId, cardId);
    return;
  }
  if (type === 'table') {
    openTableEditor(colId, cardId);
    return;
  }

  const col = columns.find(c => c.id == colId);
  const card = col?.cards.find(c => c.id == cardId);
  if (!card) return;

  activeColForMore = colId;
  editingSpecificCardId = cardId;

  if (type === 'timer') {
    renderDynamicModal('timer');
    document.getElementById('timerTitle').value = card.title || '';
    document.getElementById('timerTargetDate').value = card.targetDate || '';
  }
  else if (type === 'todo') {
    renderDynamicModal('todo');
    document.getElementById('todoFastTitle').value = card.title || '';
    document.getElementById('todoFastItems').value = (card.checklist || []).map(i => i.text).join('\n');
  }
  else if (type === 'link') {
    renderDynamicModal('link');
    document.getElementById('linkTitle').value = card.title || '';
    document.getElementById('linkUrl').value = card.url || '';
  }
}
  
function renderPollComments() {
  const list = document.getElementById('pollCommentsList');
  const poll = columns.find(c => c.id == activePollData.colId).cards.find(c => c.id == activePollData.cardId);
  
  if (!poll.comments || poll.comments.length === 0) {
    list.innerHTML = '<div class="text-gray-400 text-center py-4 text-xs">Обсуждений пока нет. Будьте первыми!</div>';
    return;
  }

  list.innerHTML = poll.comments.map(c => {
    const actualUser = (c.user && boardData.users && boardData.users[c.user.id]) ? boardData.users[c.user.id] : c.user;
    return `
    <div class="flex gap-3 bg-gray-50/50 dark:bg-gray-900/40 p-3 rounded-2xl border border-gray-100 dark:border-gray-800">
      ${getAvatarHTML(actualUser, "w-8 h-8")}
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 mb-0.5">
          <span class="font-bold text-[11px] text-gray-900 dark:text-gray-200 truncate">${esc((actualUser||{}).name)}</span>
          <span class="text-[9px] text-gray-400">${esc(c.time)}</span>
        </div>
        <div class="text-xs text-gray-700 dark:text-gray-300 leading-relaxed break-words">${esc(c.text)}</div>
      </div>
    </div>
  `}).join('');
  setTimeout(() => { list.scrollTop = list.scrollHeight; }, 50);
}
  
function addCommentToPoll() {
  const input = document.getElementById('pollCommentInput');
  const text = input.value.trim();
  if (!text || !activePollData) return;

  columns = columns.map(col => {
    if (col.id == activePollData.colId) {
      col.cards = col.cards.map(c => {
        if (c.id == activePollData.cardId) {
          if (!c.comments) c.comments = [];
          c.comments.push({
            text,
            user: currentUser,
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
          });
        }
        return c;
      });
    }
    return col;
  });

  input.value = '';
  persist();
  renderPollComments();
  lucide.createIcons();
}

function closePollStatsModal() {
  const modal = document.getElementById('pollStatsModal');
  const content = document.getElementById('pollStatsContent');
  modal.classList.add('opacity-0');
  content.classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 300);
}

// --- ЛОГИКА ГОЛОСОВЫХ ЗАМЕТОК ---
let mediaRecorder;
let audioChunks = [];
let audioBase64 = null;
let isRecording = false;

function prepareVoiceMemoCreation() {
  closeMoreAddModal();
  const modal = document.getElementById('voiceMemoModal');
  const content = document.getElementById('voiceMemoContent');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
  }, 10);

  // Сброс состояния
  audioChunks = [];
  audioBase64 = null;
  document.getElementById('voiceMemoTitle').value = '';
  document.getElementById('audioPreviewContainer').classList.add('hidden');
  document.getElementById('recordBtn').classList.remove('hidden');
  document.getElementById('stopRecordBtn').classList.add('hidden');
  document.getElementById('saveAudioBtn').disabled = true;
  document.getElementById('recordStatus').innerText = 'Нажмите для записи';
  document.getElementById('recordStatus').classList.remove('text-red-500', 'animate-pulse');
  
  lucide.createIcons();
}

function closeVoiceMemoModal() {
  if(isRecording) stopRecording();
  const modal = document.getElementById('voiceMemoModal');
  const content = document.getElementById('voiceMemoContent');
  modal.classList.add('opacity-0');
  content.classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 300);
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = () => {
        audioBase64 = reader.result;
        const audioPreview = document.getElementById('audioPreview');
        audioPreview.src = audioBase64;
        document.getElementById('audioPreviewContainer').classList.remove('hidden');
        document.getElementById('saveAudioBtn').disabled = false;
      };
      // Отключаем микрофон
      stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start();
    isRecording = true;
    
    // UI обновления
    document.getElementById('recordBtn').classList.add('hidden');
    document.getElementById('stopRecordBtn').classList.remove('hidden');
    document.getElementById('recordStatus').innerText = 'Идет запись...';
    document.getElementById('recordStatus').classList.add('text-red-500', 'animate-pulse');
  } catch (err) {
    showSystemToast('Ошибка', 'Нет доступа к микрофону.', 'mic-off', 'text-red-500', 'bg-red-50');
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    
    // UI обновления
    document.getElementById('stopRecordBtn').classList.add('hidden');
    document.getElementById('recordBtn').classList.remove('hidden');
    document.getElementById('recordStatus').innerText = 'Запись завершена';
    document.getElementById('recordStatus').classList.remove('text-red-500', 'animate-pulse');
  }
}

// Новая функция сохранения аудио-заметки (Архитектура Subcollections)
function saveVoiceMemo() {
  if (!audioBase64) {
    return showSystemToast('Ошибка', 'Сначала запишите аудио-сообщение.', 'mic-off', 'text-red-500', 'bg-red-50');
  }

  const title = document.getElementById('voiceMemoTitle').value.trim() || 'Голосовая заметка';
  const cardId = 'audio_' + Date.now();

  const audioCard = {
    id: cardId,
    title: title,
    type: 'audio',
    audioData: audioBase64,
    author: currentUser,
    archived: false,
    columnId: activeColForMore,
    order: allCards.length,
    createdAt: new Date().toISOString(),
    comments: []
  };

  if (isLocalBoard) {
    const colIndex = columns.findIndex(c => c.id == activeColForMore);
    if (colIndex !== -1) {
      if (!columns[colIndex].cards) columns[colIndex].cards = [];
      columns[colIndex].cards.push(audioCard);
      persist(); 
      render(); 
    }
  } else {
    db.collection("boards").doc(BOARD_ID).collection("cards").doc(cardId).set({
      ...audioCard,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
  
  closeVoiceMemoModal();
  showSystemToast('Добавлено', 'Голосовая заметка успешно сохранена.', 'mic', 'text-emerald-500', 'bg-emerald-50');
}
