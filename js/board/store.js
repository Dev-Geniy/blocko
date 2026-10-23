// ==========================================
// Blocko Pro · доска — store.js
// Мета колонок, диспетчеры записи карточек, колонки
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// Мета колонок для документа доски (без карточек — они живут в подколлекции cards)
function getColumnsMeta() {
  return columns.map(c => ({
    id: c.id, name: c.name, color: c.color || 'default', spaceId: c.spaceId || 'default',
    wipLimit: c.wipLimit || 0, sortBy: c.sortBy || 'manual'
  }));
}

// Колонки текущей вкладки (пространства)
function getSpaceColumns() {
  return columns.filter(col => (col.spaceId || 'default') === currentSpaceId);
}

// Ближайший цвет из палитры колонок (AI присылает hex, а UI работает с ключами)
function hexToColorKey(hex) {
  const m = String(hex || '').match(/#?([0-9a-f]{6})/i);
  if (!m) return 'default';
  const toRgb = h => [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
  const [r, g, b] = toRgb(m[1]);
  let best = 'default', bestDist = Infinity;
  Object.entries(BOARD_UI_COLORS).forEach(([key, data]) => {
    const [r2, g2, b2] = toRgb(data.hex.slice(1));
    const dist = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (dist < bestDist) { bestDist = dist; best = key; }
  });
  return best;
}

// Удаление карточек облачной доски по списку колонок (иначе остаются «сироты» в подколлекции)
async function purgeCloudCards(colIds) {
  if (isLocalBoard || !colIds || colIds.length === 0) return;
  const ids = colIds.map(String);
  const victims = Array.from(allCardsMap.values()).filter(c => ids.includes(String(c.columnId)));
  const cardsRef = db.collection("boards").doc(BOARD_ID).collection("cards");
  for (let i = 0; i < victims.length; i += 400) {
    const batch = db.batch();
    victims.slice(i, i + 400).forEach(c => batch.delete(cardsRef.doc(String(c.id))));
    try { await batch.commit(); } catch (e) { console.error('purgeCloudCards', e); }
  }
}

function persist() { 
      if (isLocalBoard) {
        updateBoardData({ columns });
      } else {
        // ЭНТЕРПРАЙЗ: Duplicate state forbidden! В документ доски пишем только мету колонок.
        // Карточки живут в своей подколлекции. Исключаем дублирование стейта.
        const columnsMeta = getColumnsMeta();
        updateBoardData({ columns: columnsMeta });
      }
    }

// --- STORE DISPATCHERS (UI → Event → Controller → Store → UI) ---
// Единый метод обновления карточки (Single Source of Truth)
async function dispatchCardUpdate(cardId, colId, updatePayload) {
  if (isLocalBoard) {
    columns = columns.map(col => {
      if (col.id == colId) {
        col.cards = col.cards.map(c => c.id == cardId ? { ...c, ...updatePayload } : c);
      }
      return col;
    });
    persist();
    render(); // Локально рендерим руками
    
    // ЭНТЕРПРАЙЗ МИКРО-UX: Мгновенная синхронизация шторки архива в офлайне
    const archiveSidebar = document.getElementById('archiveSidebar');
    if (archiveSidebar && !archiveSidebar.classList.contains('translate-x-full')) {
       renderArchiveSidebar();
    }
  } else {
    // Отправляем точечное обновление в Firebase. 
    // onSnapshot сам обновит UI (реактивность) без ручного вызова render()!
    await db.collection("boards").doc(BOARD_ID).collection("cards").doc(String(cardId)).update({
      ...updatePayload,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

// Единый метод удаления карточки с поддержкой Undo
async function dispatchCardDelete(cardId, colId) {
  let deletedCard = null;
  let cardIndex = -1;
  
  if (isLocalBoard) {
    columns = columns.map(col => {
      if (col.id == colId) {
        cardIndex = col.cards.findIndex(c => c.id == cardId);
        if(cardIndex !== -1) deletedCard = col.cards[cardIndex];
        col.cards = col.cards.filter(c => c.id != cardId);
      }
      return col;
    });
    persist();
    render();
    
    const archiveSidebar = document.getElementById('archiveSidebar');
    if (archiveSidebar && !archiveSidebar.classList.contains('translate-x-full')) {
       renderArchiveSidebar();
    }
  } else {
    const docRef = db.collection("boards").doc(BOARD_ID).collection("cards").doc(String(cardId));
    const snap = await docRef.get();
    if(snap.exists) deletedCard = snap.data();
    await docRef.delete();
  }
  
  if (deletedCard) {
     setUndoAction(async () => {
        if (isLocalBoard) {
           const col = columns.find(c => c.id == colId);
           if (col) {
               if (cardIndex !== -1) col.cards.splice(cardIndex, 0, deletedCard);
               else col.cards.push(deletedCard);
           }
           persist();
           render();
        } else {
           await db.collection("boards").doc(BOARD_ID).collection("cards").doc(String(cardId)).set(deletedCard);
        }
        showSystemToast('Восстановлено', 'Задача успешно возвращена на доску.', 'refresh-cw', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/30');
     }, `Задача удалена`);
  }
}
  
function toggleShareMenu() {
  if (window.event) window.event.stopPropagation();
  const menu = document.getElementById('shareMenuDropdown');
  if (menu) menu.classList.toggle('hidden');
}

function copyShareLink(role = 'editor') {
  // ЭНТЕРПРАЙЗ: Формируем ссылку с параметром выбранной роли + пришиваем реферальный код владельца ссылки
  const url = window.location.origin + window.location.pathname.replace('board.html', '').replace('index.html', '') + '?join=' + BOARD_ID + '&r=' + role + '&ref=' + currentUser.id;
  navigator.clipboard.writeText(url);
  
  const menu = document.getElementById('shareMenuDropdown');
  if (menu) menu.classList.add('hidden');
  
  const roleName = role === 'editor' ? 'Редактора' : 'Читателя';
  const icon = role === 'editor' ? 'edit-3' : 'eye';
  const color = role === 'editor' ? 'text-blue-500' : 'text-emerald-500';
  const bg = role === 'editor' ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-emerald-50 dark:bg-emerald-900/30';
  
  showSystemToast(
    'Ссылка скопирована!', 
    `Инвайт для ${roleName} скопирован в буфер обмена.`, 
    icon, 
    color, 
    bg
  );
}
  
function handleSearchAndFilter() { render(); }

/**
 * УПРАВЛЕНИЕ КАСТОМНЫМ ФИЛЬТРОМ ТЕГОВ (Desktop & Mobile Sync)
 */
function toggleTagFilterMenu(isMobile = false) {
  if (window.event) window.event.stopPropagation();
  const menuId = isMobile ? 'mobileTagFilterDropdown' : 'tagFilterDropdown';
  const menu = document.getElementById(menuId);
  if (menu) menu.classList.toggle('hidden');
}

function selectTagFilter(val) {
  const hiddenInput = document.getElementById('tagFilter');
  if(hiddenInput) hiddenInput.value = val;
  
  // Универсальный апдейтер UI для обеих кнопок (Desktop и Mobile)
  const updateBtnUI = (dotId, btnId) => {
    const dot = document.getElementById(dotId);
    const btn = document.getElementById(btnId);
    if(!dot || !btn) return;

    if (val !== 'all') {
      dot.classList.remove('hidden');
      btn.classList.add('bg-pink-50', 'text-pink-500', 'dark:bg-pink-900/30', 'dark:text-pink-400');
      btn.classList.remove('bg-gray-100', 'text-gray-600', 'dark:bg-gray-800', 'dark:text-gray-400');
    } else {
      dot.classList.add('hidden');
      btn.classList.remove('bg-pink-50', 'text-pink-500', 'dark:bg-pink-900/30', 'dark:text-pink-400');
      btn.classList.add('bg-gray-100', 'text-gray-600', 'dark:bg-gray-800', 'dark:text-gray-400');
    }
  };

  updateBtnUI('tagFilterActiveDot', 'btnTagFilter');
  updateBtnUI('mobileTagFilterActiveDot', 'btnMobileTagFilter');
  
  const menuDesk = document.getElementById('tagFilterDropdown');
  if (menuDesk) menuDesk.classList.add('hidden');
  
  const menuMob = document.getElementById('mobileTagFilterDropdown');
  if (menuMob) menuMob.classList.add('hidden');
  
  updateTagFilterDropdown(); // Синхронизируем галочки в обоих меню
  handleSearchAndFilter();
}

function updateTagFilterDropdown() {
  const optionsContainer = document.getElementById('tagFilterOptions');
  const mobileOptionsContainer = document.getElementById('mobileTagFilterOptions');
  const hiddenInput = document.getElementById('tagFilter');
  if (!hiddenInput) return;
  
  const currentTags = getBoardTags();
  const savedValue = hiddenInput.value;
  
  // Сброс фильтра, если тег был безвозвратно удален из проекта
  if (savedValue !== 'all' && !currentTags.some(t => t.id === savedValue)) {
    selectTagFilter('all');
    return;
  }
  
  const activeValue = hiddenInput.value;

  let html = `
    <button onclick="selectTagFilter('all')" class="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${activeValue === 'all' ? 'bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}">
      <div class="flex items-center gap-2.5"><i data-lucide="layers" class="w-4 h-4"></i> Все задачи</div>
      ${activeValue === 'all' ? '<i data-lucide="check" class="w-4 h-4"></i>' : ''}
    </button>
  `;

  currentTags.forEach(t => {
    const isActive = activeValue === t.id;
    html += `
      <button onclick="selectTagFilter(${jsArg(t.id)})" class="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${isActive ? 'bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}">
        <div class="flex items-center gap-2.5">
          <div class="w-3.5 h-3.5 rounded-full shadow-sm border ${esc(t.color)}"></div>
          <span class="truncate max-w-[130px]">${esc(t.name)}</span>
        </div>
        ${isActive ? '<i data-lucide="check" class="w-4 h-4"></i>' : ''}
      </button>
    `;
  });

  // Синхронно обновляем оба DOM-узла
  if (optionsContainer) {
      optionsContainer.innerHTML = html;
      lucide.createIcons({ root: optionsContainer });
  }
  if (mobileOptionsContainer) {
      mobileOptionsContainer.innerHTML = html;
      lucide.createIcons({ root: mobileOptionsContainer });
  }
}
