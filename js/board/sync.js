// ==========================================
// Blocko Pro · доска — sync.js
// Аватары, синхронизация с Firestore, журнал действий
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// Глобальная функция для отрисовки аватарки с рамкой, эффектами и бейджами статуса
function getAvatarHTML(userObj, sizeClass, idAttr = '') {
  userObj = userObj || {};
  const config = userObj.badgeConfig || { frameColor: 'transparent', glowColor: 'transparent', animation: 'none' };
  const frameColor = safeColor(config.frameColor);
  const glowColor = safeColor(config.glowColor);
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userObj.name || 'User')}`;
  const avatarUrl = esc(safeUrl(userObj.customAvatar) || safeUrl(userObj.avatar) || fallbackAvatar);
  const safeName = esc(userObj.name || 'User');
  const badge = userObj.badgeStatus || userObj.badge || 'none'; // Поддержка старого формата
  
  let animationClass = "";
  if (config.animation === 'pulse') animationClass = "animate-pulse";
  if (config.animation === 'rainbow') animationClass = "animate-[spin_4s_linear_infinite] filter hue-rotate-180"; 
  if (config.animation === 'flicker') animationClass = "animate-bounce"; 
  
  let badgeIconHtml = '';
  if (badge === 'ambassador') {
    badgeIconHtml = `<div class="absolute -top-1.5 -right-1.5 bg-white dark:bg-gray-900 rounded-full p-0.5 transform rotate-12 shadow border border-gray-200 dark:border-gray-700 z-10"><i data-lucide="crown" class="w-3.5 h-3.5 text-amber-500 fill-current"></i></div>`;
  } else if (badge === 'partner') {
    badgeIconHtml = `<div class="absolute -bottom-1 -right-1.5 bg-white dark:bg-gray-900 rounded-full p-0.5 shadow border border-gray-200 dark:border-gray-700 z-10"><i data-lucide="award" class="w-2.5 h-2.5 text-amber-500 fill-current"></i></div>`;
  } else if (badge === 'friend') {
    badgeIconHtml = `<div class="absolute -bottom-1 -right-1.5 bg-white dark:bg-gray-900 rounded-full p-0.5 shadow border border-gray-200 dark:border-gray-700 z-10"><i data-lucide="shield-check" class="w-2.5 h-2.5 text-blue-500 fill-current"></i></div>`;
  }

  // ЭНТЕРПРАЙЗ ИЗОЛЯЦИЯ: Выделяем эффекты наведения и фиксируем слои
  const hasHoverEffects = sizeClass.includes('hover:scale-110');
  const cleanSizeClass = sizeClass.replace('hover:z-10', '').replace('transition-transform', '').replace('hover:scale-110', '').trim();
  const wrapperEffects = hasHoverEffects ? 'hover:z-20 transition-transform hover:scale-110' : '';

  const idString = idAttr ? `id="${esc(idAttr)}"` : '';
  const clickString = `class="relative inline-block flex-shrink-0 isolate ${wrapperEffects}"`;

  // Если нет кастомной рамки, отдаем оптимизированный чистый рендер
  if (frameColor === 'transparent') {
     return `<div class="relative inline-block flex-shrink-0 isolate ${wrapperEffects}" ${idString}><img src="${avatarUrl}" referrerpolicy="no-referrer" class="${cleanSizeClass} rounded-full object-cover border border-gray-200 dark:border-gray-700 shadow-sm ${animationClass}" title="${safeName}" alt="" />${badgeIconHtml}</div>`;
  }

  // Энтерпрайз-рендер с неоновым свечением и фоновыми анимациями
  return `
    <div ${idString} ${clickString}>
      <div class="relative ${cleanSizeClass} rounded-full transition-all duration-500" 
           style="padding: 3px; background: ${frameColor}; box-shadow: 0 0 15px ${glowColor};">
        <img src="${avatarUrl}" referrerpolicy="no-referrer" class="w-full h-full rounded-full object-cover border-2 border-white dark:border-gray-900 ${animationClass}" title="${safeName}" alt="" />
        ${config.animation === 'rainbow' ? '<div class="absolute inset-0 rounded-full border-2 border-white/20 animate-spin"></div>' : ''}
      </div>
      ${badgeIconHtml}
    </div>
  `;
}

function updateBoardData(updates) {
  if (isLocalBoard) {
    const localBoards = JSON.parse(localStorage.getItem('blocko_local_boards')) || {};
    if (localBoards[BOARD_ID]) {
      localBoards[BOARD_ID] = { ...localBoards[BOARD_ID], ...updates };
      boardData = localBoards[BOARD_ID];
      localStorage.setItem('blocko_local_boards', JSON.stringify(localBoards));
      processBoardData(boardData); 
    }
  } else {
    db.collection("boards").doc(BOARD_ID).update(updates);
  }
}

function ensureUserTag(data) {
  const userTagName = currentUser.name || "User"; 
  const currentTags = data.tags || getBoardTags();
  if (!currentTags.some(t => t.name === userTagName)) {
      const newTag = { 
          id: 'tag_user_' + currentUser.id, 
          name: userTagName, 
          color: 'bg-indigo-500 text-white border-indigo-600'
      };
      const updatedTags = [...currentTags, newTag];
      if (isLocalBoard) {
         updateBoardData({ tags: updatedTags });
      } else {
         db.collection("boards").doc(BOARD_ID).update({ tags: updatedTags }).catch(e => console.error("Ошибка тега:", e));
      }
  }
}

// ENTERPRISE SYNC ENGINE: Subcollections Edition
let cardsUnsubscribe = null;
let allCardsMap = new Map(); // O(1) чтения и модификации
let allCards = []; // Для обратной совместимости логики
let renderFrameId = null;

// Внедряем CSS-оптимизацию для аппаратного ускорения и ленивого рендеринга 10k+ карточек
    if (!document.getElementById('blocko-perf-css')) {
      document.head.insertAdjacentHTML('beforeend', `
        <style id="blocko-perf-css">
          .card-item { will-change: transform; transform: translateZ(0); }
          /* Скрываем призрачную плашку "Перетащите сюда", когда в колонку перетаскивают карточку */
          div[id^="cards-"]:has(.sortable-ghost) .empty-state-placeholder { display: none !important; }
        </style>
      `);
    }

function loadBoard() {
  updateBoardStatusBadge(); // Инициализация UI сетевого статуса

  if (isLocalBoard) {
    const localBoards = JSON.parse(localStorage.getItem('blocko_local_boards')) || {};
    const data = localBoards[BOARD_ID];
    if (data) {
      if (data.password && sessionStorage.getItem('blocko_auth_' + BOARD_ID) !== data.password) {
        window.location.href = 'index.html'; return;
      }
      boardData = data;
      columns = data.columns || [];
      // ЭНТЕРПРАЙЗ: Авто-генерация персонального тега пользователя при входе на доску
      ensureUserTag(boardData);
      processBoardData(boardData);
    }
  } else {
    document.getElementById('shareUrlText').innerText = window.location.href;
    const docRef = db.collection("boards").doc(BOARD_ID);
    
    // 1. Слушаем метаданные доски (названия колонок, теги, фон, доступ)
    // Пароль проверяет сервер и выдаёт отметку unlocks/{uid}; здесь только проверяем, что она действует
    let unlockState = 'unknown'; // unknown | checking | ok
    const goToPasswordPrompt = () => {
      const cParam = new URLSearchParams(window.location.search).get('c');
      window.location.href = `index.html?auth_board=${encodeURIComponent(BOARD_ID)}${cParam ? '&c=' + encodeURIComponent(cParam) : ''}`;
    };

    const onBoardSnapshot = (doc) => {
      if (!doc.exists) {
        window.location.href = 'index.html'; return;
      }
      boardData = doc.data();
      const isOwner = boardData.owner === currentUser.id;

      // ЭНТЕРПРАЙЗ: Выброс пользователя в реальном времени, если его исключили из команды
      if (!isOwner && boardData.members && !boardData.members.includes(currentUser.id)) {
        window.location.href = 'index.html?error=not_member'; 
        return;
      }

      // ЭНТЕРПРАЙЗ: Маршрутизация на ввод пароля с сохранением Deep Link
      if (!isOwner && (boardData.hasPassword || boardData.password) && unlockState !== 'ok') {
        if (unlockState === 'checking') return;
        unlockState = 'checking';
        const snapshotDoc = doc;
        docRef.collection('unlocks').doc(currentUser.id).get().then(u => {
          if (u.exists && u.data().expiresAt && u.data().expiresAt.toMillis() > Date.now()) {
            unlockState = 'ok';
            // Повторяем обработку снапшота уже с разблокированным доступом
            onBoardSnapshot(snapshotDoc);
          } else {
            goToPasswordPrompt();
          }
        }).catch(goToPasswordPrompt);
        return;
      }

      // ЭНТЕРПРАЙЗ: Авто-создание тега пользователя для системы "My Tasks"
      ensureUserTag(boardData);

      // 2. Оптимизированный поток: Гранулярное чтение всех карточек
      if (!cardsUnsubscribe) {
        cardsUnsubscribe = docRef.collection("cards").onSnapshot((querySnapshot) => {
          querySnapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
              allCardsMap.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
            }
            if (change.type === "removed") {
              allCardsMap.delete(change.doc.id);
            }
          });
          syncAndRender();
        }, (err) => {
          // Разблокировка истекла или доступ отозван
          console.error('cards listener', err);
          if (err && err.code === 'permission-denied') goToPasswordPrompt();
        });
      } else {
        syncAndRender(); 
      }

      renderMembersSidebar();
      if (!chatListenersStarted) {
        chatListenersStarted = true;
        initChatListener(docRef);
        initActivityListener(docRef);
      }
    };

    docRef.onSnapshot(onBoardSnapshot, (err) => {
      // Не участник: правила не дают прочитать доску — предлагаем присоединиться по ссылке
      console.error('board listener', err);
      if (err && err.code === 'permission-denied') {
        window.location.href = `index.html?join=${encodeURIComponent(BOARD_ID)}`;
      } else {
        showSystemToast('Нет соединения', 'Не удалось загрузить проект. Проверьте интернет.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
      }
    });
  }
}

function initActivityListener(docRef) {
  // ЭНТЕРПРАЙЗ: Реактивный слушатель событий с автоматическим обновлением UI
  docRef.collection("activity").orderBy("timestamp", "desc").limit(50).onSnapshot((snapshot) => {
    window.currentActivitySnapshot = snapshot;
    
    // Если шторка открыта, перерисовываем немедленно
    const activitySidebar = document.getElementById('activitySidebar');
    if (activitySidebar && !activitySidebar.classList.contains('translate-x-full')) {
      renderActivityLog();
    }
    
    // ЭНТЕРПРАЙЗ: Уведомление о последнем действии, если его совершил другой пользователь
    if (!snapshot.empty) {
      const latestAction = snapshot.docs[0].data();
      if (latestAction.user && latestAction.user.id !== currentUser.id && latestAction.timestamp) {
        const actionTime = latestAction.timestamp.toMillis();
        const now = Date.now();
        // Уведомляем только о свежих событиях (последние 5 секунд)
        if (now - actionTime < 5000) {
          showSystemToast('Активность', latestAction.text, latestAction.icon || 'activity', 'text-purple-500', 'bg-purple-50 dark:bg-purple-900/20');
        }
      }
    }
  });
}

function renderActivityLog() {
  const list = document.getElementById("activityList");
  const toggle = document.getElementById("activityToggle");
  if (!list || !toggle) return;
  
  if (isLocalBoard) {
    list.innerHTML = `<div class="flex flex-col items-center justify-center p-8 text-center mt-12 animate-fade-in-up"><div class="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner border border-gray-200 dark:border-gray-700"><i data-lucide="wifi-off" class="w-10 h-10 text-gray-400"></i></div><h3 class="text-base font-bold text-gray-900 dark:text-white mb-2">Офлайн режим</h3><p class="text-xs text-gray-500 leading-relaxed px-4">Журнал действий недоступен для локальных проектов.</p></div>`;
    lucide.createIcons({ root: list });
    return;
  }

  const isEnabled = boardData.isActivityEnabled === true;
  toggle.checked = isEnabled;
  
  const statusLabel = document.getElementById("auditStatusLabel");
  if (statusLabel) statusLabel.innerText = isEnabled ? 'Режим: Активен' : 'Режим: Выключен';

  if (!isEnabled) {
    list.innerHTML = userPlan !== 'pro' ? `
        <div class="flex flex-col items-center justify-center p-8 text-center mt-12 animate-fade-in-up">
          <div class="w-20 h-20 bg-amber-50 dark:bg-amber-900/20 rounded-[2rem] flex items-center justify-center mb-6 shadow-xl border border-amber-100 dark:border-amber-800"><i data-lucide="lock" class="w-10 h-10 text-amber-500"></i></div>
          <h3 class="text-base font-bold text-gray-900 dark:text-white mb-2">Аудит заблокирован</h3>
          <p class="text-xs text-gray-500 mb-8 leading-relaxed px-4">Журнал действий — инструмент контроля уровня <b>Enterprise</b>. Доступен на тарифе Company.</p>
          <a href="store.html" class="w-full py-3 bg-amber-500 hover:bg-amber-400 text-white rounded-2xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95"><i data-lucide="shopping-cart" class="w-4 h-4"></i> Перейти в магазин</a>
        </div>` : `
        <div class="flex flex-col items-center justify-center p-8 text-center mt-12 animate-fade-in-up">
          <div class="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-[2rem] flex items-center justify-center mb-6 shadow-inner border border-gray-200 dark:border-gray-700"><i data-lucide="power-off" class="w-10 h-10 text-gray-400"></i></div>
          <h3 class="text-base font-bold text-gray-900 dark:text-white mb-2">Логгер выключен</h3>
          <p class="text-xs text-gray-500 leading-relaxed px-4">Активируйте тумблер выше, чтобы начать запись истории изменений в реальном времени.</p>
        </div>`;
    lucide.createIcons({ root: list });
    return;
  }

  // Сбор данных из Firestore
  let activityEntries = [];
  const snapshot = window.currentActivitySnapshot;
  if (snapshot && !snapshot.empty) {
    snapshot.forEach(doc => activityEntries.push({ id: doc.id, ...doc.data() }));
  }

  if (activityEntries.length === 0) {
    list.innerHTML = `<div class="flex flex-col items-center justify-center py-20 opacity-40"><i data-lucide="database" class="w-12 h-12 mb-4"></i><p class="text-sm font-bold uppercase tracking-widest">История пуста</p></div>`;
    lucide.createIcons({ root: list });
    return;
  }
  
  let html = '';
  activityEntries.forEach(data => {
    let actualUser = data.user;
    if (actualUser && boardData.users && boardData.users[actualUser.id]) {
      actualUser = boardData.users[actualUser.id];
    } else if (!actualUser) {
      actualUser = { name: 'User', avatar: '' };
    }
    
    let timeStr = 'Недавно';
    if (data.timestamp) {
      try {
        const date = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
        timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch(e){}
    }

    html += `
      <div class="flex gap-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 rounded-3xl shadow-sm hover:border-purple-300 dark:hover:border-purple-800 transition-all group animate-fade-in-up">
        <div class="flex-shrink-0">${getAvatarHTML(actualUser, 'w-10 h-10')}</div>
        <div class="flex flex-col min-w-0 flex-1 justify-center">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-[11px] font-black text-gray-900 dark:text-gray-100 truncate">${esc(actualUser.name || 'User')}</span>
            <span class="text-[9px] font-bold text-gray-400 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded-md">${timeStr}</span>
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400 leading-snug flex items-start gap-1.5">
            <i data-lucide="${esc(data.icon || 'activity')}" class="w-3.5 h-3.5 text-purple-500 mt-0.5 flex-shrink-0"></i>
            <span class="line-clamp-2">${esc(data.text || '...')}</span>
          </div>
        </div>
      </div>`;
  });
  
  list.innerHTML = `<div class="space-y-3 pb-6">${html}</div>`;
  lucide.createIcons({ root: list });
}

/**
 * ENTERPRISE AUDIT CONTROLLER v3.0
 * Реализует логику управления тумблером Журнала действий.
 * Доступ строго ограничен владельцем с тарифным планом 'Company' (pro) и выше.
 * Изначальное состояние для новых досок — OFF (Безопасность данных по умолчанию).
 */
function toggleActivityLogState(isChecked) {
  if (isLocalBoard) return; // На локальных досках тумблер полностью вырезан

  if (isChecked && userPlan !== 'pro' && userPlan !== 'infinity') {
     document.getElementById("activityToggle").checked = false;
     return showSystemToast('Премиум', 'Журнал действий доступен только на тарифе Company.', 'lock', 'text-amber-500', 'bg-amber-50 dark:bg-amber-900/30');
  }
  
  const isOwner = boardData.owner === currentUser.id;
  if (!isOwner) {
     document.getElementById("activityToggle").checked = !isChecked;
     return showSystemToast('Отказ', 'Только владелец проекта может изменять эту настройку.', 'shield-alert', 'text-red-500', 'bg-red-50 dark:bg-red-900/20');
  }
  
  updateBoardData({ isActivityEnabled: isChecked });
  showSystemToast('Аудит', isChecked ? 'Логгер запущен. Запись началась.' : 'Логгер остановлен. База экономится.', 'activity', 'text-purple-500', 'bg-purple-50 dark:bg-purple-900/30');
  
  // Визуальное обновление индикатора, если такой есть в DOM
  const statusLabel = document.getElementById("auditStatusLabel");
  if (statusLabel) statusLabel.innerText = isChecked ? 'Режим: Активен' : 'Режим: Выключен';

  setTimeout(renderActivityLog, 100);
}

// ЭНТЕРПРАЙЗ: Глобальный диспетчер ротации и очистки логов
function updateLogRetention(days) {
  const retention = parseInt(days);
  updateBoardData({ logRetention: retention });
  showSystemToast('Настройки', `Срок хранения логов изменен: ${retention} дн.`, 'clock', 'text-purple-500', 'bg-purple-50');
}

/**
 * BLOCKO OMNI-LOGGER v4.0 (Enterprise Scalable SEO Edition)
 * Реализует гибридную систему аудита действий для Cloud и Offline режимов.
 * Внедрен механизм интеллектуальной ротации данных (Garbage Collection) для предотвращения раздувания localStorage.
 */
function logActivity(text, icon = 'activity') {
  // ЭНТЕРПРАЙЗ: Журнал действий полностью вырезан для офлайн-досок
  if (isLocalBoard) return;
  if (boardData.isActivityEnabled !== true) return;

  const retentionDays = boardData.logRetention || 1;
  const now = Date.now();
  const expiryMs = retentionDays * 24 * 60 * 60 * 1000;

  // Обогащаем объект пользователя премиальными стилями
  const userSnapshot = { 
    id: currentUser.id, 
    name: currentUser.name, 
    avatar: currentUser.avatar,
    badgeConfig: currentUser.badgeConfig || null,
    badgeStatus: currentUser.badgeStatus || 'none'
  };
    
  // Cloud: Добавляем запись в субколлекцию
  db.collection("boards").doc(BOARD_ID).collection("activity").add({
    text: text,
    icon: icon,
    user: userSnapshot,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(err => console.error("Activity log error:", err));

  // Cloud: Авто-очистка просроченных записей при каждом действии (Сборка мусора)
  const thresholdDate = new Date(now - expiryMs);
  db.collection("boards").doc(BOARD_ID).collection("activity")
    .where("timestamp", "<", thresholdDate)
    .limit(50)
    .get()
    .then(snapshot => {
      if (snapshot.empty) return;
      const batch = db.batch();
      snapshot.forEach(doc => batch.delete(doc.ref));
      batch.commit();
    }).catch(err => console.error("Retention error:", err));
}

// Склеиваем структуру колонок с карточками из подколлекции через Batching DOM Updates
function syncAndRender() {
  if (renderFrameId) cancelAnimationFrame(renderFrameId);
  
  // Batching: группируем перерисовку, чтобы браузер не захлебывался
  renderFrameId = requestAnimationFrame(() => {
    allCards = Array.from(allCardsMap.values());
    columns = (boardData.columns || []).map(col => ({
      ...col,
      // В саму доску рендерим только АКТИВНЫЕ (не архивные) карточки
      cards: allCards.filter(c => c.columnId == col.id && !c.archived).sort((a, b) => (a.order || 0) - (b.order || 0))
    }));
    processBoardData(boardData);
    
    // ЭНТЕРПРАЙЗ: Динамически обновляем шторку архива, если она открыта, без скачков
    const archiveSidebar = document.getElementById('archiveSidebar');
    if (archiveSidebar && !archiveSidebar.classList.contains('translate-x-full')) {
       renderArchiveSidebar();
    }
  });
}

const pendingChatTempIds = new Set();

function getChatMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function renderOptimisticChatMessage(docRef, msg) {
  const chatBox = document.getElementById("chatMessages");
  if (!chatBox) return;

  document.getElementById('emptyChatMsg')?.remove();
  const tempId = `pending_${docRef.id}`;
  pendingChatTempIds.add(tempId);
  renderSingleMessage({ ...msg, timestamp: Date.now(), isPending: true }, chatBox, tempId);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function initChatListener(docRef) {
  docRef.collection("chat").orderBy("timestamp").limitToLast(50).onSnapshot((snapshot) => {
    const chatBox = document.getElementById("chatMessages");
    
    if (isFirstChatLoad) {
      chatBox.innerHTML = snapshot.empty ? '<div id="emptyChatMsg" class="text-center text-xs text-gray-400 mt-4">Чат пуст.</div>' : '';
      snapshot.forEach(doc => renderSingleMessage(doc.data(), chatBox, doc.id));
      isFirstChatLoad = false;
      setTimeout(() => { chatBox.scrollTop = chatBox.scrollHeight; }, 10);
    } else {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          document.getElementById('emptyChatMsg')?.remove();
          const tempId = `pending_${change.doc.id}`;
          if (pendingChatTempIds.has(tempId)) {
            document.getElementById('msg_' + tempId)?.remove();
            pendingChatTempIds.delete(tempId);
          }
          const msg = change.doc.data();
          renderSingleMessage(msg, chatBox, change.doc.id);
          
          const isMe = msg.user.id === currentUser.id;
          const isChatOpen = !document.getElementById('chatSidebar').classList.contains('translate-x-full');
          
          if (!isMe && !isChatOpen) {
            const badge = document.getElementById('chatBadge');
            if(badge) {
                let count = parseInt(badge.innerText) || 0; count++;
                badge.innerText = count > 99 ? '99+' : count;
                badge.classList.remove('hidden');
            }
            showSystemToast(`💬 Сообщение: ${msg.user.name || 'Команда'}`, msg.text ? (msg.text.length > 35 ? msg.text.substring(0, 35) + '...' : msg.text) : 'Вложение', 'message-square', 'text-blue-500', 'bg-blue-50 dark:bg-blue-900/30');
          }
          if (isChatOpen || isMe) setTimeout(() => { chatBox.scrollTop = chatBox.scrollHeight; }, 10);
        }
        
        // ЭНТЕРПРАЙЗ: Real-time обновление лайков
        if (change.type === "modified") {
          const msgDiv = document.getElementById('msg_' + change.doc.id);
          if (msgDiv) {
             const tempContainer = document.createElement('div');
             renderSingleMessage(change.doc.data(), tempContainer, change.doc.id);
             msgDiv.outerHTML = tempContainer.innerHTML;
          }
        }
      });
    }
  });
}

// Функция скачивания и уничтожения файла (Burn)
function downloadAndBurn(msgId, filename, base64url) {
  // 1. Принудительно скачиваем
  const el = document.createElement('a');
  el.setAttribute("href", base64url);
  el.setAttribute("download", filename);
  document.body.appendChild(el);
  el.click();
  el.remove();

  // 2. Удаляем из базы
  db.collection("boards").doc(BOARD_ID).collection("chat").doc(msgId).delete();
  
  // 3. Скрываем в интерфейсе
  const msgDiv = document.getElementById('msg_' + msgId);
  if(msgDiv) msgDiv.innerHTML = `<div class="p-3 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl text-xs italic"><i data-lucide="flame" class="w-4 h-4 inline mr-1"></i>Файл уничтожен навсегда</div>`;
  lucide.createIcons();
}

let pendingChatFile = null;

function closeFileTypeModal() {
  const el = document.getElementById('fileTypeModal');
  el.classList.add('opacity-0');
  setTimeout(() => { el.classList.add('hidden'); pendingChatFile = null; }, 200);
}
