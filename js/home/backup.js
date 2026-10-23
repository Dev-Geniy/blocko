// ==========================================
// Blocko Pro · главная — backup.js
// Бэкапы: экспорт и импорт, вход по ID, участие, удаление
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. index.html.
// ==========================================

// ==========================================
// ИМПОРТ / ЭКСПОРТ (БЭКАПЫ) ПРОЕКТОВ
// ==========================================
let pendingBackupId = null;
let pendingBackupIsLocal = false;

function exportBoard(id, isLocal) {
  pendingBackupId = id;
  pendingBackupIsLocal = isLocal;
  
  const descEl = document.getElementById('backupModalDesc');
  
  if (isLocal) {
     descEl.innerHTML = `Этот проект имеет статус <b class="text-emerald-500">"Офлайн"</b> и хранится только в памяти вашего текущего браузера. <br><br> Скачайте этот файл, чтобы не потерять данные при очистке кэша, или чтобы перенести проект на другое устройство.`;
  } else {
     descEl.innerHTML = `Этот проект синхронизируется в <b class="text-blue-500">"Облаке"</b>. <br><br> Скачайте этот файл, чтобы сделать локальную резервную копию на ваш компьютер. Позже вы сможете загрузить её как Офлайн-доску.`;
  }

  document.getElementById('backupModal').classList.remove('hidden');
}

function closeBackupModal() {
  document.getElementById('backupModal').classList.add('hidden');
  pendingBackupId = null;
}

async function executeBackup() {
  if(!pendingBackupId) return;
  
  let dataToExport = null;
  
  if (pendingBackupIsLocal) {
    const localBoards = getLocalBoards();
    dataToExport = localBoards[pendingBackupId];
  } else {
    // Облако: карточки живут в подколлекции — собираем их обратно в колонки
    try {
      const docRef = db.collection("boards").doc(pendingBackupId);
      const [doc, cardsSnap] = await Promise.all([docRef.get(), docRef.collection("cards").get()]);
      if (doc.exists) {
        const board = { id: doc.id, ...doc.data() };
        const cards = cardsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        board.columns = (board.columns || []).map(col => ({
          ...col,
          cards: cards.filter(c => String(c.columnId) === String(col.id)).sort((a, b) => (a.order || 0) - (b.order || 0))
        }));
        dataToExport = board;
      }
    } catch(e) { console.error("Ошибка при получении бэкапа из облака:", e); }
  }
  // В бэкап не кладём пароль и служебные поля доступа
  if (dataToExport) {
    dataToExport = JSON.parse(JSON.stringify(dataToExport));
    delete dataToExport.password;
    delete dataToExport.hasPassword;
  }
  
  if(!dataToExport) {
    showSystemToast('Ошибка', 'Не удалось получить данные проекта для скачивания.', 'x-circle', 'text-red-500', 'bg-red-50');
    return;
  }
  
  // Blob вместо data:-URL: большие доски не упираются в лимит длины ссылки
  const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
  const blobUrl = URL.createObjectURL(blob);
  const safeTitle = String(dataToExport.title || 'board').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
  const el = document.createElement('a');
  el.setAttribute("href", blobUrl);
  el.setAttribute("download", `blocko_backup_${safeTitle}.json`);
  document.body.appendChild(el);
  el.click();
  el.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  
  closeBackupModal();
  showSystemToast('Загрузка начата', 'Резервная копия успешно сформирована.', 'check-circle', 'text-green-500', 'bg-green-50');
}
  
let pendingImportFile = null;

function openImportModal() {
  if (!currentUser) return showSystemToast('Ошибка', 'Авторизуйтесь для загрузки.', 'lock', 'text-red-500', 'bg-red-50');
  
  const modal = document.getElementById('importBoardModal');
  const content = document.getElementById('importBoardContent');
  
  // Сброс формы
  document.getElementById('importFileInput').value = '';
  document.getElementById('importBoardPassword').value = '';
  pendingImportFile = null;
  document.getElementById('importDropzone').innerHTML = `
    <div class="p-3 bg-white dark:bg-gray-800 rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform"><i data-lucide="file-json" class="w-6 h-6 text-emerald-500"></i></div>
    <span class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1 text-center">Перетащите резервную копию</span>
    <span class="text-[10px] text-gray-500">или нажмите для выбора JSON</span>
    <input type="file" id="importFileInput" accept=".json" class="hidden" onchange="handleImportFileSelect(event)">
  `;
  lucide.createIcons();

  modal.classList.remove('hidden');
  setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); }, 10);
}

function closeImportModal() {
  const modal = document.getElementById('importBoardModal');
  const content = document.getElementById('importBoardContent');
  modal.classList.add('opacity-0');
  content.classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 300);
}

function handleImportFileSelect(event) {
  const file = event.target.files[0] || (event.dataTransfer && event.dataTransfer.files[0]);
  if (!file) return;
  
  pendingImportFile = file;
  
  document.getElementById('importDropzone').innerHTML = `
    <div class="p-4 flex flex-col items-center w-full">
      <i data-lucide="check-circle" class="w-10 h-10 text-emerald-500 mb-3 shadow-sm rounded-full bg-white dark:bg-gray-800"></i>
      <span class="text-sm font-bold text-gray-800 dark:text-white truncate w-full text-center px-4 mb-4">${esc(file.name)}</span>
      <button onclick="event.stopPropagation(); event.preventDefault(); processBoardImport()" class="w-full px-6 py-3.5 bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/25 active:scale-95 hover:bg-emerald-400 transition-all flex items-center justify-center gap-2">
        <i data-lucide="upload-cloud" class="w-5 h-5"></i> Восстановить проект
      </button>
    </div>
  `;
  lucide.createIcons();
}

async function processBoardImport() {
  if (!pendingImportFile || !currentUser) return;
  
  // ЭНТЕРПРАЙЗ БЕЗОПАСНОСТЬ: Ограничение размера файла (максимум 10 MB)
  if (pendingImportFile.size > 10 * 1024 * 1024) {
     return showSystemToast('Отказ в доступе', 'Файл слишком большой. Максимальный размер 10 МБ.', 'shield-alert', 'text-red-500', 'bg-red-50 dark:bg-red-900/30');
  }

  const type = document.querySelector('input[name="importBoardType"]:checked').value;
  const password = document.getElementById('importBoardPassword').value.trim() || null;

  // ЭНТЕРПРАЙЗ МИКРО-UX: Блокируем кнопку на время загрузки
  const dropzoneBtn = document.querySelector('#importDropzone button.bg-emerald-500');
  const originalBtnHTML = dropzoneBtn ? dropzoneBtn.innerHTML : '';
  if (dropzoneBtn) {
    dropzoneBtn.disabled = true;
    dropzoneBtn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Разворачиваем...';
    lucide.createIcons({ root: dropzoneBtn.parentNode });
  }

  // ЭНТЕРПРАЙЗ: Проверка лимитов тарифа при загрузке в Облако
  if (type === 'online') {
    const ownedOnlineCount = onlineBoards.filter(b => b.owner === currentUser.id).length;
    
    // КРИТИЧЕСКИЙ ФИКС БИЛЛИНГА: Безопасный поиск тарифа
    const planLimits = getPlanLimits(userPlan); 
    
    if (planLimits.boardsLimit < 999 && ownedOnlineCount >= planLimits.boardsLimit) {
      if (dropzoneBtn) { 
        dropzoneBtn.disabled = false; 
        dropzoneBtn.innerHTML = originalBtnHTML; 
        lucide.createIcons({ root: dropzoneBtn.parentNode }); 
      }
      closeImportModal();
      openPricingModal();
      return showSystemToast('Лимит достигнут', `На вашем тарифе доступно до ${planLimits.boardsLimit} облачных проектов.`, 'lock', 'text-amber-500', 'bg-amber-50 dark:bg-amber-900/30');
    }
  }

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      
      // ЭНТЕРПРАЙЗ БЕЗОПАСНОСТЬ: Строгая валидация структуры (Anti-Malware & Integrity Check)
      if (typeof imported !== 'object' || !Array.isArray(imported.columns) || !imported.title || typeof imported.title !== 'string') {
         throw new Error("Неверная сигнатура файла.");
      }

      // Базовая санитизация (стриппинг тегов script)
      const sanitizeText = (text) => typeof text === 'string' ? text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') : text;
      imported.title = sanitizeText(imported.title);

      const newBoardId = (type === 'local' ? 'local_' : '') + Date.now();
      imported.id = newBoardId;
      imported.owner = currentUser.id;
      imported.members = [currentUser.id];
      delete imported.password;
      delete imported.hasPassword;
      if (type === 'local' && password) imported.password = password;
      imported.createdAt = type === 'local' ? Date.now() : firebase.firestore.FieldValue.serverTimestamp();
      
      imported.users = { 
        [currentUser.id]: { 
          name: currentUser.name, 
          avatar: currentUser.avatar, 
          role: 'owner',
          customAvatar: currentUser.customAvatar || null,
          badgeStatus: currentUser.badgeStatus || null,
          badgeConfig: currentUser.badgeConfig || null
        } 
      };

      if (type === 'local') {
        const localBoards = getLocalBoards();
        localBoards[newBoardId] = imported;
        localStorage.setItem('blocko_local_boards', JSON.stringify(localBoards));
        if (password) sessionStorage.setItem('blocko_auth_' + newBoardId, password);
        
        closeImportModal();
        renderBoardsGrid();
        showSystemToast('Успех', 'Офлайн проект успешно восстановлен.', 'check-circle', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/30');
        setTimeout(() => window.location.href = `board.html?b=${newBoardId}`, 800);
      } else {
         // Cloud развертывание с учетом Subcollections
         const cardsToImport = [];
         imported.columns.forEach(col => {
            col.name = sanitizeText(col.name);
            if (col.cards && Array.isArray(col.cards)) {
                col.cards.forEach(card => {
                   card.title = sanitizeText(card.title);
                   cardsToImport.push({...card, columnId: col.id});
                });
                col.cards = []; 
            }
         });

         closeImportModal();
         showSystemToast('Синхронизация...', 'Создаем облачную инфраструктуру. Пожалуйста, подождите.', 'loader-2', 'text-blue-500 animate-spin', 'bg-blue-50 dark:bg-blue-900/30');

         const docRef = db.collection("boards").doc(); 
         imported.id = docRef.id;

         await docRef.set(imported);
         if (password) await BlockoAPI.call('setBoardPassword', { boardId: docRef.id, password });

         // ЭНТЕРПРАЙЗ: Пакетная запись (Chunking) для обхода лимита Firestore в 500 операций
         if (cardsToImport.length > 0) {
             const batches = [];
             let currentBatch = db.batch();
             let opCount = 0;

             cardsToImport.forEach(card => {
                 // Оставляем оригинальный ID карточки, чтобы сохранить целостность вложенных данных (чек-листы и т.д.)
                 const cardRef = docRef.collection("cards").doc(String(card.id));
                 currentBatch.set(cardRef, { ...card, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                 opCount++;
                 
                 if (opCount >= 450) {
                     batches.push(currentBatch.commit());
                     currentBatch = db.batch();
                     opCount = 0;
                 }
             });
             
             if (opCount > 0) batches.push(currentBatch.commit());
             await Promise.all(batches);
         }
         
         showSystemToast('Успех', 'Облачный проект восстановлен!', 'cloud-snow', 'text-blue-500', 'bg-blue-50 dark:bg-blue-900/30');
         setTimeout(() => window.location.href = `board.html?b=${docRef.id}`, 800);
      }
    } catch (err) { 
        if (dropzoneBtn) { 
          dropzoneBtn.disabled = false; 
          dropzoneBtn.innerHTML = originalBtnHTML; 
          lucide.createIcons({ root: dropzoneBtn.parentNode }); 
        }
        showSystemToast('Блокировка', 'Файл поврежден, имеет неверный формат или содержит опасный код.', 'shield-alert', 'text-red-500', 'bg-red-50 dark:bg-red-900/30'); 
    }
  };
  reader.readAsText(pendingImportFile);
}
  
function promptJoinById() {
  document.getElementById('joinBoardIdInput').value = '';
  document.getElementById('joinBoardModal').classList.remove('hidden');
}

function closeJoinModal() {
  document.getElementById('joinBoardModal').classList.add('hidden');
}

function confirmJoinBoard() {
  const id = document.getElementById('joinBoardIdInput').value.trim();
  if (id !== '') {
    closeJoinModal();
    joinBoardById(id);
  }
}

async function joinBoardById(id, requestedRole = 'editor') {
  id = String(id || '').trim();
  if (id.startsWith('local_')) return showSystemToast('Ошибка', 'Это локальный ID, его нельзя найти в сети.', 'x-circle', 'text-red-500', 'bg-red-50');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return showSystemToast('Не найдено', 'Проект с таким ID не существует.', 'alert-circle', 'text-red-500', 'bg-red-50');
  try {
    // Сервер проверяет лимит участников тарифа владельца и пароль
    const res = await BlockoAPI.call('enterBoard', { boardId: id, role: requestedRole === 'viewer' ? 'viewer' : 'editor' });
    if (res.status === 'password_required') {
      openBoardPasswordPrompt(id, 'board', res.preview, requestedRole);
      return;
    }
    if (res.status === 'joined') showSystemToast('Успех', 'Проект добавлен в ваше рабочее пространство!', 'check-circle', 'text-green-500', 'bg-green-50');
    window.location.href = `board.html?b=${encodeURIComponent(id)}`;
  } catch (e) {
    handleEnterBoardError(e);
  }
}

function handleEnterBoardError(e) {
  const code = BlockoAPI.errorCode(e);
  const msg = BlockoAPI.errorMessage(e);
  if (code === 'not-found') return showSystemToast('Не найдено', 'Проект с таким ID не существует.', 'alert-circle', 'text-red-500', 'bg-red-50');
  if (msg === 'member_limit') return showSystemToast('Лимит достигнут', 'Владелец доски исчерпал лимит участников для своего тарифа.', 'users', 'text-red-500', 'bg-red-50');
  if (msg === 'wrong_password') return showSystemToast('Ошибка доступа', 'Неверный пароль. Попробуйте еще раз.', 'shield-alert', 'text-red-500', 'bg-red-50');
  if (code === 'resource-exhausted') return showSystemToast('Подождите', msg || 'Слишком много попыток.', 'clock', 'text-amber-500', 'bg-amber-50');
  console.error('enterBoard', e);
  showSystemToast('Ошибка', 'Нет доступа или неверный ID.', 'alert-triangle', 'text-red-500', 'bg-red-50');
}

function copyBoardId(btn, id) { 
  navigator.clipboard.writeText(id); 
  if(btn) showToastFeedback(btn, 'check', 'text-green-500'); 
  
  showSystemToast(
    'ID скопирован!', 
    'Отправьте этот код коллеге. Ему нужно будет нажать "Войти по ID" на главной странице.', 
    'copy', 
    'text-blue-500', 
    'bg-blue-50 dark:bg-blue-900/30'
  );
}
  
function copyBoardLink(btn, id) {
  // Генерируем ссылку, ведущую на index.html с параметром join
  const url = window.location.origin + window.location.pathname.replace('index.html', '') + '?join=' + id;
  navigator.clipboard.writeText(url); 
  if(btn) showToastFeedback(btn, 'check', 'text-green-500');
  
  showSystemToast(
    'Ссылка скопирована!', 
    'Отправьте её коллеге. Она добавит проект в его дашборд.', 
    'link', 
    'text-indigo-500', 
    'bg-indigo-50 dark:bg-indigo-900/30'
  );
}
  
function showToastFeedback(el, icon, color) {
  const og = el.innerHTML; el.innerHTML = `<i data-lucide="${icon}" class="w-3.5 h-3.5 ${color}"></i>`; lucide.createIcons();
  setTimeout(() => { el.innerHTML = og; lucide.createIcons(); }, 2000);
}

// Функция: Покинуть чужую доску
async function leaveBoard(id) {
  openConfirmModal('Покинуть проект?', 'Вы больше не сможете просматривать и редактировать задачи в этом проекте.', 'Выйти', true, async () => {
    try {
      const docRef = db.collection("boards").doc(id);
      
      await docRef.update({
        members: firebase.firestore.FieldValue.arrayRemove(currentUser.id),
        [`users.${currentUser.id}`]: firebase.firestore.FieldValue.delete()
      });
      
      showSystemToast('Успех', 'Вы покинули проект.', 'log-out', 'text-orange-500', 'bg-orange-50');
    } catch (error) {
      console.error("Ошибка выхода из проекта:", error);
      showSystemToast('Ошибка', 'Произошла ошибка при выходе из проекта.', 'alert-circle', 'text-red-500', 'bg-red-50');
    }
  });
}

function deleteBoard(id, isLocal) { 
  openConfirmModal('Удалить проект навсегда?', 'Вы уверены? Это действие навсегда удалит доску и все её задачи.', 'Удалить', true, () => {
    if(isLocal) {
      const local = getLocalBoards(); delete local[id];
      localStorage.setItem('blocko_local_boards', JSON.stringify(local)); renderBoardsGrid();
      showSystemToast('Удалено', 'Локальный проект успешно удален.', 'trash-2', 'text-red-500', 'bg-red-50');
    } else { 
      db.collection("boards").doc(id).delete(); 
      showSystemToast('Удалено', 'Облачный проект успешно удален.', 'trash-2', 'text-red-500', 'bg-red-50');
    }
  });
}

function generateAvatarById(uid) {
  const colors = ['3b82f6', '10b981', 'f59e0b', 'f43f5e', '8b5cf6'];
  return `https://ui-avatars.com/api/?name=${uid.substr(0,2)}&background=${colors[uid.charCodeAt(0)%colors.length]}&color=fff&font-size=0.4`;
}

function shareVia(platform) {
  const url = encodeURIComponent(window.location.origin + window.location.pathname);
  const text = encodeURIComponent("Присоединяйтесь ко мне в Blocko Pro!");
  let sUrl = '';
  switch(platform) {
    case 'telegram': sUrl = `https://t.me/share/url?url=${url}&text=${text}`; break;
    case 'viber': sUrl = `viber://forward?text=${text} ${url}`; break;
    case 'whatsapp': sUrl = `https://wa.me/?text=${text} ${url}`; break;
    case 'facebook': sUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`; break;
    case 'twitter': sUrl = `https://twitter.com/intent/tweet?url=${url}&text=${text}`; break;
    case 'linkedin': sUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`; break;
  }
  if(sUrl) window.open(sUrl, '_blank', 'width=600,height=400');
}

function toggleTheme() { document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); }
