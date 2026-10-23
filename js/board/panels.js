// ==========================================
// Blocko Pro · доска — panels.js
// Боковые панели: архив, участники, чат, голосовой ввод
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// ЭНТЕРПРАЙЗ: АБСОЛЮТНАЯ ИЗОЛЯЦИЯ ШТОРОК (С аппаратным скрытием через CSS display)
const SidebarManager = {
  sidebars: ['chatSidebar', 'settingsSidebar', 'membersSidebar', 'archiveSidebar', 'aiSidebar', 'activitySidebar'],
  
  closeAll: function() {
    this.sidebars.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        // Жесткое вырезание из потока рендера — защита от боковых наложений
        el.classList.add('translate-x-full');
        el.classList.remove('z-50');
        el.style.display = 'none'; 
      }
    });
    const aiBtn = document.getElementById('aiFloatingBtn');
    if (aiBtn) aiBtn.classList.remove('opacity-0', 'pointer-events-none');
  },

  toggle: function(targetId, callback) {
    // Тотальный сброс фокуса, чтобы случайный Enter не активировал скрытые кнопки
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    
    try {
      if (window.event && typeof window.event.preventDefault === 'function') {
        window.event.preventDefault();
        window.event.stopPropagation();
      }
    } catch (e) {}

    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    
    // Проверяем, скрыта ли целевая шторка аппаратно или программно
    const isCurrentlyHidden = targetEl.classList.contains('translate-x-full') || targetEl.style.display === 'none';
    
    // БЕЗУСЛОВНО выжигаем все шторки (Архив, Чат, Настройки и т.д.)
    this.closeAll();

    // Если целевая шторка была скрыта — плавно вводим её в поток
    if (isCurrentlyHidden) {
      targetEl.style.display = 'flex'; // Возвращаем в архитектуру DOM
      
      // Даем браузеру миллисекунду на отрисовку display:flex перед анимацией
      requestAnimationFrame(() => {
          targetEl.classList.remove('translate-x-full');
          targetEl.classList.add('z-50'); 
          
          const aiBtn = document.getElementById('aiFloatingBtn');
          if (aiBtn) aiBtn.classList.add('opacity-0', 'pointer-events-none');

          if (callback) callback();
      });
    }
  }
};

// Замороженные публичные методы (toggle)
window.toggleAiSidebar = () => SidebarManager.toggle('aiSidebar', () => setTimeout(() => document.getElementById('aiChatInput')?.focus(), 100));
window.toggleArchive = () => SidebarManager.toggle('archiveSidebar', () => { if (typeof renderArchiveSidebar === 'function') renderArchiveSidebar(); });
window.toggleActivityLog = () => SidebarManager.toggle('activitySidebar', () => { if (typeof renderActivityLog === 'function') renderActivityLog(); });
window.toggleSettings = () => SidebarManager.toggle('settingsSidebar');
window.toggleMembers = () => SidebarManager.toggle('membersSidebar');
window.toggleChat = () => SidebarManager.toggle('chatSidebar', () => {
  const chatBox = document.getElementById('chatMessages');
  if (chatBox) setTimeout(() => { chatBox.scrollTop = chatBox.scrollHeight; }, 10);
  const badge = document.getElementById('chatBadge');
  if (badge) { badge.classList.add('hidden'); badge.innerText = ''; }
});

// Глухой перехватчик для старых вызовов
window.closeOtherSidebars = () => SidebarManager.closeAll();
  
// ЭНТЕРПРАЙЗ МИКРО-UX: Анимация исчезновения карточки из архива перед фактическим восстановлением
function animateAndRestoreCard(cardId, colId) {
  const el = document.getElementById(`archive-item-${cardId}`);
  if (el) {
    el.classList.add('opacity-0', 'scale-95', '-translate-x-full');
    setTimeout(() => restoreCardFromSidebar(cardId, colId), 250); // Ждем завершения анимации
  } else {
    restoreCardFromSidebar(cardId, colId);
  }
}

function restoreCardFromSidebar(cardId, colId) {
  dispatchCardUpdate(cardId, colId, { archived: false });
  showSystemToast('Восстановлено', 'Карточка успешно возвращена на доску.', 'refresh-cw', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/20');
}

// ЭНТЕРПРАЙЗ МИКРО-UX: Анимация исчезновения перед удалением навсегда прямо из архива
function animateAndDeleteCard(colId, cardId, typeLabel) {
  openConfirmModal(`Удалить ${typeLabel}?`, 'Это действие нельзя отменить, данные будут стерты навсегда.', 'Удалить', true, () => {
    const el = document.getElementById(`archive-item-${cardId}`);
    if (el) {
      el.classList.add('opacity-0', 'scale-95', 'translate-x-full', 'bg-red-50', 'dark:bg-red-900/30', 'border-red-200');
      setTimeout(() => {
        dispatchCardDelete(cardId, colId);
        showSystemToast('Удалено', 'Объект стерт из базы.', 'trash-2', 'text-red-500', 'bg-red-50 dark:bg-red-900/20');
      }, 250);
    } else {
      dispatchCardDelete(cardId, colId);
      showSystemToast('Удалено', 'Объект стерт из базы.', 'trash-2', 'text-red-500', 'bg-red-50 dark:bg-red-900/20');
    }
  });
}

function renderArchiveSidebar() {
  const container = document.getElementById('archiveSidebarList');
  if (!container) return;
  
  let archivedCards = [];
  if (isLocalBoard) {
    columns.forEach(col => {
      (col.cards || []).forEach(c => {
        if (c.archived) archivedCards.push({ ...c, columnId: col.id });
      });
    });
  } else {
    archivedCards = allCards.filter(c => c.archived);
  }

  archivedCards.sort((a, b) => {
    const tA = a.updatedAt ? (a.updatedAt.toMillis ? a.updatedAt.toMillis() : new Date(a.updatedAt).getTime()) : 0;
    const tB = b.updatedAt ? (b.updatedAt.toMillis ? b.updatedAt.toMillis() : new Date(b.updatedAt).getTime()) : 0;
    return tB - tA;
  });

  if (archivedCards.length === 0) {
    container.innerHTML = '<div class="text-center py-10 text-gray-400 text-sm flex flex-col items-center gap-2"><i data-lucide="archive-x" class="w-8 h-8 opacity-50"></i>Архив пуст</div>';
    // ЭНТЕРПРАЙЗ ОПТИМИЗАЦИЯ: Ограничиваем область перерисовки иконок, чтобы не ломать DOM
    lucide.createIcons({ root: container });
    return;
  }

  container.innerHTML = archivedCards.map(c => {
    const colName = (boardData.columns || []).find(col => col.id == c.columnId)?.name || 'Неизвестно';
    const displayTitle = esc(c.title || 'Без названия');
    
    let iconHtml = '<i data-lucide="layers" class="w-3.5 h-3.5"></i>';
    if (c.type === 'poll') iconHtml = '<i data-lucide="bar-chart-3" class="w-3.5 h-3.5"></i>';
    if (c.type === 'audio') iconHtml = '<i data-lucide="mic" class="w-3.5 h-3.5"></i>';
    if (c.type === 'table') iconHtml = '<i data-lucide="table" class="w-3.5 h-3.5"></i>';
    if (c.type === 'timer') iconHtml = '<i data-lucide="timer" class="w-3.5 h-3.5"></i>';
    if (c.type === 'todo') iconHtml = '<i data-lucide="list-todo" class="w-3.5 h-3.5"></i>';
    if (c.type === 'link') iconHtml = '<i data-lucide="link" class="w-3.5 h-3.5"></i>';

    // ЭНТЕРПРАЙЗ МИКРО-УЛУЧШЕНИЯ: Добавлен ID (archive-item-id) для точечной анимации удаления
    return `
      <div id="archive-item-${esc(c.id)}" class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm flex flex-col gap-2 transition-all duration-300 hover:border-amber-300 dark:hover:border-amber-700 hover:shadow-md animate-fade-in-up">
        <div class="flex justify-between items-start gap-2">
          <h4 class="font-bold text-sm text-gray-900 dark:text-white line-clamp-2 leading-tight flex-1">${displayTitle}</h4>
          <span class="text-gray-400 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-1.5 rounded shadow-sm flex-shrink-0" title="${esc(c.type || 'task')}">${iconHtml}</span>
        </div>
        <div class="text-[10px] text-gray-500 font-medium"><i data-lucide="layout" class="w-3 h-3 inline pb-0.5"></i> Из: ${esc(colName)}</div>
        <div class="flex gap-2 mt-2 border-t border-gray-100 dark:border-gray-700/50 pt-3">
          <button onclick="animateAndRestoreCard(${jsArg(c.id)}, ${jsArg(c.columnId)})" class="flex-1 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center justify-center gap-1.5 active:scale-95 shadow-sm">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Вернуть
          </button>
          <button onclick="animateAndDeleteCard(${jsArg(c.columnId)}, ${jsArg(c.id)}, 'объект')" class="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 dark:hover:border-red-800/50 rounded-lg transition-colors shadow-sm active:scale-95" title="Удалить навсегда">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  lucide.createIcons({ root: container });
}
  
function changeUserRole(uid, newRole) {
  if (isLocalBoard) return;
  if (boardData.owner !== currentUser.id) return showSystemToast('Нет доступа', 'Только владелец может менять роли.', 'shield-alert', 'text-red-500', 'bg-red-50');
  if (uid === boardData.owner) return showSystemToast('Защищено', 'Нельзя изменить роль владельца.', 'shield-check', 'text-amber-500', 'bg-amber-50');
  let updatedUsers = { ...boardData.users };
  updatedUsers[uid].role = newRole;
  updateBoardData({ users: updatedUsers });
}

function renderMembersSidebar() {
  const container = document.getElementById('membersList');
  if (!boardData.users) return;
  const isOwner = boardData.owner === currentUser.id;
  
  container.innerHTML = Object.entries(boardData.users).map(([uid, user]) => {
    const isMe = uid === currentUser.id;
    const roleBadge = user.role === 'owner' ? '<span class="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">Владелец</span>' : '';
    
    let roleSelect = '';
    let deleteBtn = '';
    
    if (isOwner && user.role !== 'owner') {
      roleSelect = `
        <select onclick="event.stopPropagation()" onchange="changeUserRole(${jsArg(uid)}, this.value)" class="text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-1.5 outline-none cursor-pointer hover:border-blue-400 transition-colors">
          <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>Редактор</option>
          <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Читатель</option>
        </select>
      `;
      deleteBtn = `
        <button onclick="event.stopPropagation(); removeMember(${jsArg(uid)}, ${jsArg(user.name)})" class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-1 border border-transparent hover:border-red-100 dark:hover:border-red-800/50" title="Исключить из проекта">
          <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
        </button>
      `;
    } else if (user.role !== 'owner') {
      roleSelect = `<span class="text-[10px] text-gray-500 font-bold px-2 py-1 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 uppercase tracking-widest">${user.role === 'editor' ? 'Редактор' : 'Читатель'}</span>`;
    }

    // Обновленный аватар с зеленой точкой (по умолчанию скрыта)
    const avatarHtml = `
      <div class="relative isolate">
        ${getAvatarHTML(user, 'w-10 h-10')}
        <div id="online_dot_${esc(uid)}" class="online-indicator hidden absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-gray-800 rounded-full z-20 shadow-sm"></div>
      </div>
    `;

    return `
      <div class="flex flex-col bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-700 transition-colors group overflow-hidden cursor-pointer shadow-sm" onclick="toggleMemberActions(${jsArg(uid)})">
        <div class="flex items-center gap-3 p-3 pointer-events-none">
            ${avatarHtml}
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1"><span class="font-bold text-sm text-gray-900 dark:text-white truncate">${esc(user.name)} ${isMe ? '<span class="text-[10px] font-normal text-gray-400">(Вы)</span>' : ''}</span></div>
              ${roleBadge}
            </div>
            <div class="flex items-center pointer-events-auto">
                ${roleSelect}
                ${deleteBtn}
            </div>
        </div>
        <!-- ЭНТЕРПРАЙЗ: Индикация статуса участника -->
        <div id="member_actions_${esc(uid)}" class="hidden flex items-center px-4 pb-3 pt-2 border-t border-gray-100 dark:border-gray-700/50 mt-1 bg-gray-50/50 dark:bg-gray-950/20">
           <div class="flex items-center gap-2 text-[10px] font-bold text-gray-400 italic">
               <i data-lucide="info" class="w-3 h-3"></i>
               ${isMe ? 'Ваш профиль в этом проекте' : 'Участник синхронизирован'}
           </div>
        </div>
      </div>
    `;
  }).join('');
  lucide.createIcons();
}

// --- ЭНТЕРПРАЙЗ: УПРАВЛЕНИЕ УЧАСТНИКАМИ ---

/**
 * Переключает видимость информационной панели участника.
 * Теперь используется для отображения мета-данных синхронизации вместо звонков.
 */
function toggleMemberActions(uid) {
    const actionsPanel = document.getElementById(`member_actions_${uid}`);
    if (actionsPanel) {
        // Плавное переключение через CSS классы для исключения рывков layout
        if (actionsPanel.classList.contains('hidden')) {
            actionsPanel.classList.remove('hidden');
            actionsPanel.classList.add('flex');
        } else {
            actionsPanel.classList.add('hidden');
            actionsPanel.classList.remove('flex');
        }
    }
}

// ЭНТЕРПРАЙЗ: Функция удаления участника с проверкой и подтверждением
function removeMember(uid, name) {
  if (isLocalBoard) return;
  openConfirmModal('Исключить из команды?', `Вы уверены, что хотите удалить пользователя ${name} из проекта? Он мгновенно потеряет доступ к доске и всем задачам.`, 'Исключить', true, async () => {
    try {
        const docRef = db.collection("boards").doc(BOARD_ID);
        await docRef.update({
            members: firebase.firestore.FieldValue.arrayRemove(uid),
            [`users.${uid}`]: firebase.firestore.FieldValue.delete()
        });
        showSystemToast('Участник удален', `${name} больше не имеет доступа к проекту.`, 'user-minus', 'text-red-500', 'bg-red-50');
    } catch (error) {
        console.error("Ошибка удаления:", error);
        showSystemToast('Ошибка', 'Не удалось удалить участника.', 'alert-circle', 'text-red-500', 'bg-red-50');
    }
  });
}
  
const CHAT_STICKERS = ['thumbs-up', 'heart', 'flame', 'party-popper', 'zap', 'check-circle-2'];

function renderSingleMessage(msg, container, msgId) {
  msg.user = msg.user || {};
  const isMe = msg.user.id === currentUser.id;
  const time = getChatMessageTime(msg.timestamp);
  
  let attachHtml = '';
  if (msg.attachment) {
    if (msg.attachment.type === 'image') {
      const imgUrl = safeUrl(msg.attachment.url);
      attachHtml = !imgUrl ? '' : `<img src="${esc(imgUrl)}" loading="lazy" class="rounded-xl mt-1.5 w-full cursor-pointer border border-black/10 dark:border-white/10 shadow-sm hover:opacity-90" onclick="window.open(${jsArg(imgUrl)}, '_blank', 'noopener')" />`;
    } else {
      const isExpired = msg.attachment.expiresAt && Date.now() > msg.attachment.expiresAt;
      
      if (isExpired) {
         attachHtml = `<div class="mt-1.5 text-[10px] text-gray-500 italic p-2 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full overflow-hidden">⏳ Срок хранения файла истек</div>`;
      } else {
          const isBurn = msg.attachment.retention === 'burn';
          const fileUrl = safeUrl(msg.attachment.url, { allowData: true });
          const fileName = String(msg.attachment.name || 'file');
          const fileIcon = isBurn ? 'flame' : 'file';
          const fileColor = isBurn ? 'text-orange-500' : (isMe ? 'text-white' : 'text-gray-600 dark:text-gray-300');
          const badgeHtml = isBurn ? `<span class="flex-shrink-0 text-[8px] uppercase tracking-wider bg-orange-500/20 text-orange-500 font-bold px-1.5 py-0.5 rounded">1 скачивание</span>` : '';
          
          const downloadBtn = isBurn 
            ? `<button onclick="downloadAndBurn(${jsArg(msgId)}, ${jsArg(fileName)}, ${jsArg(fileUrl)})" class="p-1.5 hover:bg-white/20 dark:hover:bg-white/10 rounded-lg transition-colors flex-shrink-0" title="Скачать и уничтожить"><i data-lucide="download" class="w-4 h-4 ${isMe ? 'text-white' : 'text-gray-600 dark:text-gray-300'}"></i></button>`
            : `<a href="${esc(fileUrl)}" download="${esc(fileName)}" class="p-1.5 hover:bg-white/20 dark:hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"><i data-lucide="download" class="w-4 h-4 ${isMe ? 'text-white' : 'text-gray-600 dark:text-gray-300'}"></i></a>`;

          attachHtml = `
            <div class="mt-1.5 flex items-center gap-3 bg-white/10 dark:bg-black/20 p-2.5 rounded-xl border ${isMe ? 'border-white/20' : 'border-gray-200 dark:border-gray-700'} w-full overflow-hidden">
              <div class="p-2 bg-white/20 dark:bg-white/10 rounded-lg flex-shrink-0"><i data-lucide="${esc(fileIcon)}" class="w-4 h-4 ${fileColor}"></i></div>
              <div class="flex-1 min-w-0 flex flex-col">
                <div class="flex items-center gap-2 w-full">
                  <span class="text-xs font-bold truncate flex-1 min-w-0 ${isMe ? 'text-white' : 'text-gray-800 dark:text-gray-200'}" title="${esc(fileName)}">${esc(fileName)}</span>
                  ${badgeHtml}
                </div>
                <span class="text-[9px] ${isMe ? 'text-white/70' : 'text-gray-500'}">${esc(msg.attachment.size)}</span>
              </div>
              ${downloadBtn}
            </div>`;
      }
    }
  }

  let stickerHtml = '';
  if (msg.sticker && CHAT_STICKERS.includes(msg.sticker)) {
      let colorClass = 'text-blue-500';
      if(msg.sticker === 'heart') colorClass = 'text-rose-500';
      if(msg.sticker === 'flame') colorClass = 'text-orange-500';
      if(msg.sticker === 'party-popper') colorClass = 'text-purple-500';
      if(msg.sticker === 'zap') colorClass = 'text-amber-500';
      if(msg.sticker === 'check-circle-2') colorClass = 'text-emerald-500';
      
      stickerHtml = `<div class="mt-1 mb-1 p-3 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm w-fit ${isMe ? 'ml-auto' : ''}"><i data-lucide="${esc(msg.sticker)}" class="w-12 h-12 ${colorClass}"></i></div>`;
  }

  const textHtml = msg.text ? `<div class="${isMe ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-800 border dark:border-gray-700'} px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words w-fit max-w-full ${isMe ? 'rounded-tr-sm ml-auto' : 'rounded-tl-sm'}">${esc(msg.text)}</div>` : '';
  const actualUser = (msg.user && boardData.users && boardData.users[msg.user.id]) ? boardData.users[msg.user.id] : msg.user;

  // ЭНТЕРПРАЙЗ UX: Телеграм-стиль лайков (В правом нижнем углу контента, без рамок)
  const likesCount = msg.likes ? msg.likes.length : 0;
  const hasLiked = msg.likes && msg.likes.includes(currentUser.id);
  
  // ЭНТЕРПРАЙЗ МИКРО-УЛУЧШЕНИЕ: Убраны рамки (ring), добавлены мягкие тени и ID для Optimistic UI
  const likeBtnHtml = msg.isPending ? '' : `<button id="likeBtn_${esc(msgId)}" onclick="toggleMessageLike(${jsArg(msgId)})" class="absolute -bottom-3 -right-2 flex items-center justify-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 z-10 ${hasLiked ? 'text-rose-500 bg-white/95 dark:bg-gray-800/95 shadow-md' : 'text-gray-400 opacity-0 group-hover/msg:opacity-100 hover:text-rose-500 hover:bg-white/95 dark:hover:bg-gray-800/95 shadow-sm'}" title="Нравится"><i data-lucide="heart" class="w-3.5 h-3.5 ${hasLiked ? 'fill-current' : ''}"></i> <span id="likeCount_${esc(msgId)}" class="${likesCount > 0 ? 'ml-0.5' : 'hidden'}">${likesCount > 0 ? likesCount : ''}</span></button>`;

  // insertAdjacentHTML не перепарсивает весь чат (в отличие от innerHTML +=)
  container.insertAdjacentHTML('beforeend', `
    <div id="msg_${esc(msgId)}" class="flex gap-3 ${isMe ? 'flex-row-reverse' : 'animate-fade-in-up'} mt-3 mb-2 ${msg.isPending ? 'opacity-70' : ''}">
      ${getAvatarHTML(actualUser, 'w-8 h-8 flex-shrink-0')}
      <div class="flex flex-col w-full min-w-0">
        <div class="flex items-baseline gap-2 mb-1 px-1 ${isMe ? 'flex-row-reverse' : ''}">
          <span class="text-[10px] text-gray-500 font-bold truncate">${isMe ? 'Вы' : esc(actualUser.name)}</span>
          <span class="text-[9px] text-gray-400">${time}</span>
        </div>
        <div class="relative w-fit max-w-full group/msg ${isMe ? 'ml-auto' : ''}">
          ${stickerHtml}
          ${textHtml}
          ${attachHtml}
          ${likeBtnHtml}
        </div>
      </div>
    </div>
  `);
  // Иконки только внутри контейнера (работает и для отсоединённого временного контейнера)
  lucide.createIcons({ root: container });
}
  
function sendChatMessage() {
  if (isLocalBoard) return;
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  const docRef = db.collection("boards").doc(BOARD_ID).collection("chat").doc();
  const msg = { text, user: currentUser, likes: [] };
  input.value = '';
  renderOptimisticChatMessage(docRef, msg);

  docRef.set({ ...msg, timestamp: firebase.firestore.FieldValue.serverTimestamp() }).catch(err => {
    document.getElementById('msg_pending_' + docRef.id)?.remove();
    pendingChatTempIds.delete('pending_' + docRef.id);
    showSystemToast('Ошибка', 'Не удалось отправить сообщение.', 'alert-circle', 'text-red-500', 'bg-red-50');
    console.error('Chat send failed:', err);
  });
}

function sendChatSticker(iconName) {
  if (isLocalBoard) return showSystemToast('Офлайн', 'Стикеры недоступны без интернета.', 'wifi-off', 'text-amber-500', 'bg-amber-50');

  const docRef = db.collection("boards").doc(BOARD_ID).collection("chat").doc();
  const msg = { text: "", sticker: iconName, user: currentUser, likes: [] };
  renderOptimisticChatMessage(docRef, msg);

  docRef.set({ ...msg, timestamp: firebase.firestore.FieldValue.serverTimestamp() }).catch(err => {
    document.getElementById('msg_pending_' + docRef.id)?.remove();
    pendingChatTempIds.delete('pending_' + docRef.id);
    showSystemToast('Ошибка', 'Не удалось отправить реакцию.', 'alert-circle', 'text-red-500', 'bg-red-50');
    console.error('Sticker send failed:', err);
  });
}

function toggleMessageLike(msgId) {
  if (isLocalBoard || !currentUser) return;
  
  const btn = document.getElementById(`likeBtn_${msgId}`);
  const countSpan = document.getElementById(`likeCount_${msgId}`);
  
  // ЭНТЕРПРАЙЗ: Optimistic UI. Обновляем интерфейс мгновенно ДО ответа сервера для эффекта нулевой задержки.
  if (btn && countSpan) {
     const isCurrentlyLiked = btn.classList.contains('text-rose-500');
     let currentCount = parseInt(countSpan.innerText) || 0;
     
     if (isCurrentlyLiked) {
         // Снимаем лайк
         btn.classList.remove('text-rose-500', 'bg-white/95', 'dark:bg-gray-800/95', 'shadow-md');
         btn.classList.add('text-gray-400', 'opacity-0', 'group-hover/msg:opacity-100', 'shadow-sm');
         btn.querySelector('i').classList.remove('fill-current');
         currentCount = Math.max(0, currentCount - 1);
     } else {
         // Ставим лайк
         btn.classList.add('text-rose-500', 'bg-white/95', 'dark:bg-gray-800/95', 'shadow-md');
         btn.classList.remove('text-gray-400', 'opacity-0', 'group-hover/msg:opacity-100', 'shadow-sm');
         btn.querySelector('i').classList.add('fill-current');
         currentCount++;
         if(typeof fireConfetti === 'function') fireConfetti();
     }
     
     countSpan.innerText = currentCount;
     if (currentCount > 0) {
         countSpan.classList.remove('hidden');
         countSpan.classList.add('ml-0.5');
     } else {
         countSpan.classList.add('hidden');
         countSpan.classList.remove('ml-0.5');
     }
  }

  // Фоновая синхронизация с Firebase
  const msgRef = db.collection("boards").doc(BOARD_ID).collection("chat").doc(msgId);
  msgRef.get().then(doc => {
    if (doc.exists) {
      let likes = doc.data().likes || [];
      if (likes.includes(currentUser.id)) {
        likes = likes.filter(id => id !== currentUser.id);
      } else {
        likes.push(currentUser.id);
      }
      msgRef.update({ likes });
    }
  }).catch(err => console.error("Like sync failed:", err));
}

// ЭНТЕРПРАЙЗ: Voice-to-Text для командного чата
let chatSpeechRecognition = null;
let isChatListening = false;

function toggleChatVoiceInput() {
  if (isLocalBoard) return showSystemToast('Офлайн', 'Голосовой ввод недоступен в офлайн-досках.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
  const micBtn = document.getElementById('chatMicBtn');
  const input = document.getElementById('chatInput');
  
  if (isChatListening && chatSpeechRecognition) {
    chatSpeechRecognition.stop();
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return showSystemToast('Ошибка', 'Голосовой ввод не поддерживается браузером.', 'mic-off', 'text-red-500', 'bg-red-50');
  }
  
  chatSpeechRecognition = new SpeechRecognition();
  chatSpeechRecognition.lang = 'ru-RU';
  chatSpeechRecognition.interimResults = true;
  
  const initialText = input.value ? input.value + ' ' : '';
  
  chatSpeechRecognition.onstart = () => {
    isChatListening = true;
    micBtn.classList.remove('text-gray-500', 'bg-gray-100', 'dark:bg-gray-800');
    micBtn.classList.add('text-red-500', 'bg-red-100', 'dark:bg-red-900/40', 'animate-pulse');
  };
  
  chatSpeechRecognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    input.value = initialText + transcript;
  };
  
  chatSpeechRecognition.onend = () => {
    isChatListening = false;
    micBtn.classList.add('text-gray-500', 'bg-gray-100', 'dark:bg-gray-800');
    micBtn.classList.remove('text-red-500', 'bg-red-100', 'dark:bg-red-900/40', 'animate-pulse');
  };
  
  try { chatSpeechRecognition.start(); } catch (e) { console.error(e); }
}

function toggleModal(modalId, show) {
  const el = document.getElementById(modalId);
  if (show) { el.classList.remove('hidden'); setTimeout(() => el.classList.remove('opacity-0'), 10); } 
  else { el.classList.add('opacity-0'); setTimeout(() => el.classList.add('hidden'), 200); }
}
