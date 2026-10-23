// ==========================================
// Blocko Pro · доска — state.js
// Константы, состояние, вкладки (пространства), авторизация
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// --- КОНСТАНТЫ НАСТРОЕК ---
const BOARD_UI_COLORS = {
  'default': { hex: '#94a3b8', border: 'border-gray-200 dark:border-gray-700' },
  'blue': { hex: '#3b82f6', border: 'border-blue-200 dark:border-blue-800' },
  'green': { hex: '#10b981', border: 'border-emerald-200 dark:border-emerald-800' },
  'red': { hex: '#ef4444', border: 'border-red-200 dark:border-red-800' },
  'amber': { hex: '#f59e0b', border: 'border-amber-200 dark:border-amber-800' },
  'purple': { hex: '#8b5cf6', border: 'border-purple-200 dark:border-purple-800' }
};

const DEFAULT_BOARD_TAGS = [
  { id: 'tag_bug', name: 'Баг', color: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800' },
  { id: 'tag_feat', name: 'Фича', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  { id: 'tag_urg', name: 'Срочно', color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  { id: 'tag_des', name: 'Дизайн', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
  { id: 'tag_back', name: 'Бэкенд', color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
  { id: 'tag_test', name: 'Тестирование', color: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800' }
];

const TAG_PALETTE = [
  'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800',
  'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  'bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-400 border-pink-200 dark:border-pink-800',
  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
];

let newTagSelectedColor = TAG_PALETTE[0];

function highlightText(text, query) {
  // Безопасно: текст экранируется, запрос не интерпретируется как RegExp
  return BlockoSec.highlight(text || '', query || '');
}

let currentUser = null;
let userPlan = localStorage.getItem('blocko_user_plan') || 'free';
let BOARD_ID = new URLSearchParams(window.location.search).get('b');
let isLocalBoard = BOARD_ID && BOARD_ID.startsWith('local_');
let columns = [], sortableInstances = [];
let currentColumn = null, editingCard = null, viewingCard = null, editingColId = null;
let activeTags = [], pendingImageFile = null, activeChecklist = [];
let selectedColColor = 'default';
let boardData = {};
let isFirstChatLoad = true; // ОДНА переменная чата
let chatListenersStarted = false; // защита от двойной подписки до первого снапшота чата
// Base64 раздувает файл на ~33%, а документ Firestore ограничен 1 МиБ — оставляем запас
const MAX_CHAT_FILE_BYTES = 700 * 1024;
let currentSpaceId = 'default'; // ЭНТЕРПРАЙЗ: Активное пространство (Вкладка доски)
let spacesLayoutMode = localStorage.getItem('blocko_spaces_layout') || 'horizontal';

function toggleSpacesLayout() {
    spacesLayoutMode = spacesLayoutMode === 'horizontal' ? 'vertical' : 'horizontal';
    localStorage.setItem('blocko_spaces_layout', spacesLayoutMode);
    renderSpacesUI();
}

// ЭНТЕРПРАЙЗ: Управление Пространствами (Sub-boards) с поддержкой 2х режимов отображения
function renderSpacesUI() {
   const containerHorizontal = document.getElementById('boardSpacesContainer');
   const containerVertical = document.getElementById('boardSpacesContainerVertical');
   const subHeaderWrapper = document.getElementById('spacesSubHeaderWrapper');
   const subHeader = document.getElementById('spacesSubHeader');
   const verticalSidebar = document.getElementById('spacesVerticalSidebar');
   
   if (!boardData.spaces || boardData.spaces.length === 0) {
       boardData.spaces = [{ id: 'default', name: 'Главная' }];
   }
   
   // Логика переключения контейнеров (на мобильных принудительно горизонт)
   const isDesktop = window.innerWidth >= 768;
   
   if (spacesLayoutMode === 'vertical' && isDesktop) {
       subHeaderWrapper.classList.add('hidden');
       verticalSidebar.classList.remove('hidden');
       verticalSidebar.classList.add('flex');
   } else {
       subHeaderWrapper.classList.remove('hidden');
       subHeader.classList.remove('hidden'); // Принудительный показ внутренней панели
       if(verticalSidebar) {
           verticalSidebar.classList.add('hidden');
           verticalSidebar.classList.remove('flex');
       }
   }

   const generateTabs = (isVertical) => boardData.spaces.map(space => {
       const isActive = space.id === currentSpaceId;
       
       let activeClasses = '';
       if (isVertical) {
           activeClasses = isActive 
              ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 shadow-sm border-blue-200/50 dark:border-blue-700/50 z-10' 
              : 'bg-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-gray-800/60 border-transparent';
       } else {
           activeClasses = isActive 
              ? 'bg-gradient-to-b from-blue-50 to-white dark:from-blue-900/40 dark:to-gray-800 text-blue-700 dark:text-blue-400 shadow-md border-blue-200/50 dark:border-blue-700/50 scale-105 z-10' 
              : 'bg-white/60 dark:bg-gray-800/60 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-gray-700 border-gray-200/50 dark:border-gray-700/50';
       }
       
       const layoutClasses = isVertical ? 'w-full py-2.5 px-3 justify-start' : 'px-4 py-2';
       
       return `
          <div class="flex items-center group/space relative space-tab-item ${isVertical ? 'w-full' : ''}" data-id="${esc(space.id)}">
              <button onclick="switchSpace(${jsArg(space.id)})" class="rounded-xl text-xs font-bold transition-all border ${activeClasses} flex items-center gap-2.5 select-none ${layoutClasses}">
                 <i data-lucide="${esc(isActive ? 'layout' : 'folder')}" class="w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-500' : 'text-gray-400 group-hover/space:text-gray-600 dark:group-hover/space:text-gray-300'} pointer-events-none"></i>
                 <span class="truncate">${esc(space.name)}</span>
              </button>
              ${isActive && boardData.spaces.length > 1 ? `
              <button onclick="event.stopPropagation(); deleteSpace(${jsArg(space.id)})" class="absolute ${isVertical ? 'right-2 top-1/2 -translate-y-1/2' : '-top-1.5 -right-1.5'} opacity-0 group-hover/space:opacity-100 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900/50 p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-red-500 transition-all shadow-md active:scale-95 z-20" title="Удалить доску">
                 <i data-lucide="x" class="w-3 h-3 pointer-events-none"></i>
              </button>
              ` : ''}
          </div>
       `;
   }).join('');

   if (spacesLayoutMode === 'vertical' && isDesktop) {
       if(containerVertical) {
           containerVertical.innerHTML = generateTabs(true);
           lucide.createIcons({ root: containerVertical });
           initSpacesSortable(containerVertical);
       }
   } else {
       if(containerHorizontal) {
           containerHorizontal.innerHTML = generateTabs(false);
           lucide.createIcons({ root: containerHorizontal });
           initSpacesSortable(containerHorizontal);
       }
   }
}

function initSpacesSortable(container) {
   if (window.spacesSortable) window.spacesSortable.destroy();
   window.spacesSortable = new Sortable(container, {
       animation: 250,
       ghostClass: 'opacity-40',
       dragClass: 'scale-105',
       onEnd: function (evt) {
           const movedSpace = boardData.spaces.splice(evt.oldIndex, 1)[0];
           boardData.spaces.splice(evt.newIndex, 0, movedSpace);
           updateBoardData({ spaces: boardData.spaces });
           if (!isLocalBoard) logActivity(`Изменил(а) порядок вкладок доски`, 'move');
       }
   });
}

function switchSpace(spaceId) {
    currentSpaceId = spaceId;
    renderSpacesUI();
    render(); // Мгновенный перерендеринг колонок без перезагрузки
}

function addSpace() {
    // ЭНТЕРПРАЙЗ: Проверка тарифа для вкладки "Spaces"
    if (userPlan === 'free') {
        return showSystemToast('Лимит тарифа Free', 'Множественные доски внутри проекта доступны на тарифах Freelancer и Company. Масштабируйте процессы без ограничений!', 'lock', 'text-amber-500', 'bg-amber-50 dark:bg-amber-900/30');
    }
    
    openCustomPrompt('Новая доска', 'Введите название для нового пространства (например: Маркетинг, Back-end, CRM)', 'Название пространства...', 'Создать', (name) => {
        if (name && name.trim()) {
            const newId = 'space_' + Date.now();
            boardData.spaces.push({ id: newId, name: name.trim() });
            updateBoardData({ spaces: boardData.spaces });
            switchSpace(newId);
            if (!isLocalBoard) logActivity(`Создал(а) новую вкладку: "${name}"`, 'plus-square');
            showSystemToast('Пространство создано', `Доска "${name}" готова к работе.`, 'folder-plus', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/30');
        }
    });
}

let promptCallback = null;

function openCustomPrompt(title, desc, placeholder, btnText, callback) {
    document.getElementById('promptTitle').innerText = title;
    document.getElementById('promptDesc').innerText = desc;
    const input = document.getElementById('promptInput');
    input.placeholder = placeholder;
    input.value = '';
    document.getElementById('promptBtnAction').innerText = btnText;
    
    promptCallback = callback;
    
    const modal = document.getElementById('customPromptModal');
    const content = document.getElementById('promptModalContent');
    modal.classList.remove('hidden');
    setTimeout(() => { 
        modal.classList.remove('opacity-0'); 
        content.classList.remove('scale-95'); 
        content.classList.add('scale-100'); 
        input.focus();
    }, 10);
}

function closePromptModal() {
    const modal = document.getElementById('customPromptModal');
    const content = document.getElementById('promptModalContent');
    modal.classList.add('opacity-0');
    content.classList.remove('scale-100'); 
    content.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); promptCallback = null; }, 300);
}

function executePrompt() {
    const val = document.getElementById('promptInput').value;
    if (promptCallback) promptCallback(val);
    closePromptModal();
}

let spacesCollapsed = false;

function toggleSpacesCollapse(e) {
   // Cкрытие при клике на фон
   spacesCollapsed = true;
   updateSpacesVisibility();
}

function forceToggleSpaces() {
   spacesCollapsed = !spacesCollapsed;
   updateSpacesVisibility();
}

function updateSpacesVisibility() {
   const wrapper = document.getElementById('headerWrapper');
   const icon = document.getElementById('mobileSpacesToggleIcon');
   if (!wrapper) return;
   
   if (spacesCollapsed) {
      wrapper.classList.add('is-collapsed');
      if(icon) icon.setAttribute('data-lucide', 'chevron-down');
   } else {
      wrapper.classList.remove('is-collapsed');
      if(icon) icon.setAttribute('data-lucide', 'chevron-up');
   }
   lucide.createIcons();
}

function deleteSpace(spaceId) {
    openConfirmModal('Удалить вкладку?', 'Внимание: Все колонки и задачи внутри этой вкладки будут безвозвратно удалены!', 'Удалить навсегда', true, () => {
        if ((boardData.spaces || []).length <= 1) {
            return showSystemToast('Нельзя удалить', 'В проекте должна остаться хотя бы одна вкладка.', 'alert-circle', 'text-amber-500', 'bg-amber-50');
        }
        boardData.spaces = boardData.spaces.filter(s => s.id !== spaceId);
        updateBoardData({ spaces: boardData.spaces });
        
        // Удаляем колонки, связанные с этим пространством, и их карточки
        const removedColIds = columns.filter(c => (c.spaceId || 'default') === spaceId).map(c => c.id);
        columns = columns.filter(c => (c.spaceId || 'default') !== spaceId);
        persist();
        purgeCloudCards(removedColIds);
        
        currentSpaceId = boardData.spaces[0].id;
        switchSpace(currentSpaceId);
        if (!isLocalBoard) logActivity(`Удалил(а) вкладку-доску`, 'trash-2');
        showSystemToast('Удалено', 'Пространство и его содержимое очищены.', 'trash-2', 'text-red-500', 'bg-red-50');
    });
}
  
// Подписку на авторизацию запускаем, когда загружены ВСЕ модули страницы:
// иначе колбэк может сработать раньше, чем объявлены функции из следующих файлов.
whenScriptsLoaded(() => auth.onAuthStateChanged(async (user) => {
  const loader = document.getElementById('globalLoader');
  if (user) {
    const safeAvatar = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=3b82f6&color=fff`;
    
    let badgeStatus = 'none';
    let customAvatar = null;
    let badgeConfig = null;

    try {
      const userRef = db.collection('users').doc(user.uid);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const data = userDoc.data();
        badgeStatus = data.badgeStatus || 'none';
        customAvatar = data.customAvatar || null;
        badgeConfig = data.badgeConfig || null;
        
        // ЭНТЕРПРАЙЗ: Синхронизация тарифа и проверка истечения
        let currentPlan = data.plan || 'free';
        if (data.planExpiresAt && Date.now() > data.planExpiresAt) {
          currentPlan = 'free';
          await userRef.update({ plan: 'free', planExpiresAt: firebase.firestore.FieldValue.delete() });
        }
        userPlan = currentPlan;
        localStorage.setItem('blocko_user_plan', currentPlan);
      }
    } catch(e) {}

    // Обогащаем currentUser полными данными кастомизации
    currentUser = { 
      id: user.uid, 
      name: user.displayName, 
      avatar: safeAvatar, 
      customAvatar: customAvatar,
      badgeStatus: badgeStatus,
      badgeConfig: badgeConfig
    };
    
    // Динамически заменяем статичную картинку в инпуте комментов на нашу Enterprise-модель
    const commentAvatarEl = document.getElementById('commentMyAvatar');
    if (commentAvatarEl) {
       commentAvatarEl.outerHTML = getAvatarHTML(currentUser, 'w-10 h-10 flex-shrink-0', 'commentMyAvatar');
       lucide.createIcons();
    }
    
    if (!BOARD_ID) {
        window.location.href = 'index.html'; 
      } else {
        loadBoard();
        // Анимация скрытия загрузчика после инициализации доски
        setTimeout(() => {                    
          if (loader) {                       
            loader.style.opacity = '0';       
            setTimeout(() => loader.classList.add('hidden'), 700);
          }                                   
        }, 500);                              
      }
    } else {
      window.location.href = 'index.html'; 
    }
  }));
  
