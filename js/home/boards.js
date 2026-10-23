// ==========================================
// Blocko Pro · главная — boards.js
// Список досок: облачные и локальные, сетка, сортировка
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. index.html.
// ==========================================

// Получение локальных досок
function getLocalBoards() {
  return JSON.parse(localStorage.getItem('blocko_local_boards')) || {};
}

function subscribeToBoards(userId) {
  const grid = document.getElementById('boardsGrid');
  db.collection("boards")
    .where("members", "array-contains", userId)
    .orderBy("createdAt", "desc")
    .onSnapshot((snapshot) => {
      onlineBoards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderBoardsGrid();
    }, (error) => {
      console.error(error);
      if (error.code === 'failed-precondition') {
        grid.innerHTML = `<div class="col-span-full p-6 bg-amber-50 text-center"><p class="font-bold text-amber-700">Нужна настройка индексов Firebase</p></div>`;
      }
    });
}

function renderBoardsGrid() {
  const grid = document.getElementById('boardsGrid');
  const query = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const localBoardsObj = getLocalBoards() || {};
  const localBoardsArr = Object.values(localBoardsObj);
  const combinedBoards = [...onlineBoards, ...localBoardsArr];

  let safeBoardOrder = Array.isArray(savedBoardOrder) ? savedBoardOrder : [];
  let sortedBoards = combinedBoards.sort((a, b) => {
    let indexA = safeBoardOrder.indexOf(a.id);
    let indexB = safeBoardOrder.indexOf(b.id);
    if (indexA === -1) indexA = 999999; 
    if (indexB === -1) indexB = 999999;
    return indexA - indexB;
  });

  const filtered = sortedBoards.filter(b => (b.title || 'Без названия').toLowerCase().includes(query));
  
  if(document.getElementById('statTotalBoards')) {
      document.getElementById('statTotalBoards').innerText = combinedBoards.length;
      let tasksCount = 0;
      combinedBoards.forEach(b => b.columns?.forEach(c => tasksCount += (c.cards?.length || 0)));
      document.getElementById('statTotalTasks').innerText = tasksCount;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-20 flex flex-col items-center justify-center text-center opacity-80 animate-fade-in-up">
        <div class="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-5 shadow-inner border border-gray-200 dark:border-gray-700">
          <i data-lucide="search-x" class="w-10 h-10 text-gray-400"></i>
        </div>
        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Ничего не найдено</h3>
        <p class="text-sm text-gray-500 max-w-md mx-auto leading-relaxed mb-6">Мы не смогли найти проекты по вашему запросу. Попробуйте изменить параметры поиска или создайте новую доску.</p>
        <button onclick="openCreateModal()" class="px-6 py-2.5 rounded-2xl border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 font-bold text-sm transition-colors flex items-center justify-center gap-2">
          <i data-lucide="plus" class="w-4 h-4"></i> Создать новый проект
        </button>
      </div>`;
    lucide.createIcons(); 
    return;
  }

grid.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-8 pb-10"; // ЭНТЕРПРАЙЗ: Расширяем сетку для премиум-вида

grid.innerHTML = filtered.map(data => {
    const isLocal = data.id && data.id.startsWith('local_');
    const isOwner = data.owner === currentUser.id;
    const hasPassword = !!(data.hasPassword || data.password); 
    const ownerInfo = data.users && data.users[data.owner] ? data.users[data.owner] : { name: 'Владелец', avatar: generateAvatarById(data.owner || 'U') };
    
    // --- ДИНАМИЧЕСКИЕ КНОПКИ ДЕЙСТВИЙ ---
    let actionButtons = '';
    if (isLocal) {
      actionButtons = `
        <button onclick="event.stopPropagation(); exportBoard(${jsArg(data.id)}, true)" class="flex items-center gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-800 rounded-xl transition-all shadow-sm border border-emerald-100 dark:border-emerald-800/50" title="Скачать бэкап"><i data-lucide="download" class="w-4 h-4"></i> <span class="text-xs font-bold hidden sm:inline">Save</span></button>
      `;
    } else {
      let downloadCloudBtn = isOwner ? `
        <button onclick="event.stopPropagation(); exportBoard(${jsArg(data.id)}, false)" class="flex items-center gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-800 rounded-xl transition-all shadow-sm border border-emerald-100 dark:border-emerald-800/50" title="Скачать бэкап (Только для владельца)"><i data-lucide="download" class="w-4 h-4"></i> <span class="text-xs font-bold hidden sm:inline">Save</span></button>
      ` : '';
      
      const myRole = data.users && data.users[currentUser.id] ? data.users[currentUser.id].role : 'editor';
      const isViewer = myRole === 'viewer';
      
      if (!isViewer) {
        actionButtons = `
          ${downloadCloudBtn}
          <button onclick="event.stopPropagation(); copyBoardId(this, ${jsArg(data.id)})" class="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-xl transition-all shadow-sm border border-gray-200 dark:border-gray-700" title="Скопировать ID"><i data-lucide="copy" class="w-4 h-4"></i> <span class="text-xs font-bold hidden sm:inline">ID</span></button>
          <button onclick="event.stopPropagation(); copyBoardLink(this, ${jsArg(data.id)})" class="flex items-center gap-2 p-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-800 rounded-xl transition-all shadow-sm border border-indigo-100 dark:border-indigo-800/50" title="Ссылка-приглашение"><i data-lucide="link" class="w-4 h-4"></i> <span class="text-xs font-bold hidden sm:inline">Link</span></button>
        `;
      } else {
        actionButtons = ``;
      }
    }

    let cardActions = `<button onclick="event.stopPropagation(); tryEnterBoard(${jsArg(data.id)}, ${hasPassword}, 'archive')" class="p-2 text-gray-400 hover:text-amber-500 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors" title="Архив проекта"><i data-lucide="archive" class="w-4 h-4"></i></button>`;
    if (isLocal || isOwner) cardActions += `<button onclick="event.stopPropagation(); deleteBoard(${jsArg(data.id)}, ${isLocal})" class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors" title="Удалить проект"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
    else cardActions += `<button onclick="event.stopPropagation(); leaveBoard(${jsArg(data.id)})" class="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-xl transition-colors" title="Покинуть проект"><i data-lucide="log-out" class="w-4 h-4"></i></button>`;

    // ЭНТЕРПРАЙЗ: Стилистика бейджей и оттенков карточек
    const boardBg = isLocal ? 'bg-gray-50/80 dark:bg-gray-800/80' : 'bg-white dark:bg-gray-900';
    const typeIcon = isLocal ? 'hard-drive' : 'cloud';
    const typeColor = isLocal ? 'text-gray-500 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700' : 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-900';
    const typeBadge = isLocal 
      ? `<span class="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">Офлайн</span>`
      : `<span class="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">Онлайн</span>`;
    const pinBadge = hasPassword ? `<span class="bg-gray-100/80 dark:bg-gray-800/80 text-gray-400 border border-gray-200/50 dark:border-gray-700/50 text-[9px] font-black px-2 py-1 rounded-lg flex items-center gap-1 uppercase tracking-widest"><i data-lucide="key" class="w-3 h-3"></i> PIN</span>` : '';

    // Корпоративный блок
    const companyHtml = data.company ? `
      <div class="flex items-center gap-3 mb-2 bg-indigo-50/50 dark:bg-indigo-900/10 p-3 rounded-2xl border border-indigo-100/50 dark:border-indigo-800/30">
         <div class="w-9 h-9 rounded-full border border-indigo-200 dark:border-indigo-700 flex items-center justify-center bg-white dark:bg-gray-800 text-indigo-500 shadow-sm"><i data-lucide="building-2" class="w-4 h-4"></i></div>
         <div class="flex flex-col">
           <span class="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em] leading-none mb-1">Компания</span>
           <span class="text-sm font-bold text-gray-700 dark:text-gray-200 leading-tight">${esc(data.company)}</span>
         </div>
      </div>
    ` : '';

    return `
    <div data-id="${esc(data.id)}" onclick="tryEnterBoard(${jsArg(data.id)}, ${hasPassword})" class="group ${boardBg} border border-gray-200 dark:border-gray-800 p-8 rounded-[2.5rem] hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500 relative flex flex-col h-full cursor-pointer hover:-translate-y-1">
      <div class="flex justify-between items-start mb-6">
        <div class="flex items-center gap-4">
          <div class="relative w-14 h-14 ${typeColor} rounded-[1.2rem] flex items-center justify-center border shadow-sm group-hover:scale-110 transition-transform duration-500">
             <i data-lucide="${typeIcon}" class="w-7 h-7"></i>
          </div>
          <div class="flex flex-col gap-1.5">
            ${typeBadge}
            ${pinBadge}
          </div>
        </div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
           ${cardActions}
        </div>
      </div>

      <h3 class="text-2xl font-extrabold mb-5 text-gray-900 dark:text-white line-clamp-1 group-hover:text-blue-600 transition-colors tracking-tight">${esc(data.title || 'Без названия')}</h3>
      
      ${companyHtml}

      <div class="flex items-center gap-3 mb-8 bg-gray-50/80 dark:bg-gray-800/50 p-3 rounded-2xl border border-gray-100 dark:border-gray-700/50 transition-colors">
         ${renderUserAvatar(ownerInfo, 'w-9 h-9')}
         <div class="flex flex-col">
           <span class="text-[9px] text-gray-400 font-black uppercase tracking-[0.2em] leading-none mb-1">Владелец</span>
           <span class="text-sm font-bold text-gray-700 dark:text-gray-200 leading-tight line-clamp-1">${esc(ownerInfo.name)}</span>
         </div>
      </div>
      
      <div class="flex items-center justify-between mt-auto pt-6 border-t border-gray-200 dark:border-gray-800">
        <div class="flex gap-2">${actionButtons}</div>
        <div class="flex -space-x-3 hover:space-x-1 transition-all duration-300">
           ${isLocal ? renderUserAvatar(currentUser, 'w-9 h-9 hover:z-10 transition-transform hover:scale-110') : 
             (data.members || []).slice(0,4).map(uid => {
                const memberData = data.users && data.users[uid] ? data.users[uid] : { name: 'User', avatar: generateAvatarById(uid) };
                return renderUserAvatar(memberData, 'w-9 h-9 hover:z-10 transition-transform hover:scale-110');
             }).join('')
           }
        </div>
      </div>
    </div>
    `
  }).join('');
  lucide.createIcons();
  
  if (sortableInstance) sortableInstance.destroy();
  sortableInstance = new Sortable(grid, {
    animation: 200, ghostClass: 'sortable-ghost', dragClass: 'sortable-drag', delay: 150, delayOnTouchOnly: true,
    onEnd: function () {
      const items = grid.querySelectorAll('[data-id]');
      savedBoardOrder = Array.from(items).map(el => el.getAttribute('data-id'));
      localStorage.setItem('blocko_boards_order', JSON.stringify(savedBoardOrder));
    }
  });
}

// Модальное окно
function openCreateModal() { document.getElementById('createBoardModal').classList.remove('hidden'); }
function closeCreateModal() { document.getElementById('createBoardModal').classList.add('hidden'); }
