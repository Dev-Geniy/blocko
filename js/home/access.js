// ==========================================
// Blocko Pro · главная — access.js
// Вход на доску с паролем, PWA
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. index.html.
// ==========================================

// --- ОБНОВЛЕННАЯ ЛОГИКА ДОСТУПА ПО ПАРОЛЮ ---
let pendingBoardId = null;
let pendingTarget = 'board'; // ЭНТЕРПРАЙЗ: Маршрутизация после ввода пароля
let pendingRole = 'editor'; // роль из инвайт-ссылки, если входим впервые

function boardTargetUrl(id, target) {
  const b = encodeURIComponent(id);
  if (target === 'archive') return `archive.html?b=${b}`;
  if (target && target.startsWith('card_')) return `board.html?b=${b}&c=${encodeURIComponent(target.replace('card_', ''))}`;
  return `board.html?b=${b}`;
}

async function tryEnterBoard(id, hasPassword, target = 'board') {
  const isLocal = id.startsWith('local_');
  const targetUrl = boardTargetUrl(id, target);

  if (isLocal) {
    const boardObj = getLocalBoards()[id];
    if (!boardObj) return;
    if (!boardObj.password || sessionStorage.getItem('blocko_auth_' + id) === boardObj.password) {
      window.location.href = targetUrl;
      return;
    }
    const ownerInfo = boardObj.users && boardObj.users[boardObj.owner] ? boardObj.users[boardObj.owner] : { name: 'Владельцем', avatar: generateAvatarById(boardObj.owner || 'U') };
    openBoardPasswordPrompt(id, target, { title: boardObj.title, owner: ownerInfo });
    return;
  }

  const boardObj = onlineBoards.find(b => b.id === id);
  if (boardObj && boardObj.owner === currentUser.id) { window.location.href = targetUrl; return; }
  if (boardObj && !hasPassword) { window.location.href = targetUrl; return; }

  // Пароль уже вводили недавно — сервер выдал отметку unlocks/{uid}
  try {
    const unlock = await db.collection('boards').doc(id).collection('unlocks').doc(currentUser.id).get();
    if (unlock.exists && unlock.data().expiresAt && unlock.data().expiresAt.toMillis() > Date.now()) {
      window.location.href = targetUrl;
      return;
    }
  } catch (e) { /* нет доступа — спросим сервер */ }

  try {
    const res = await BlockoAPI.call('enterBoard', { boardId: id });
    if (res.status === 'password_required') openBoardPasswordPrompt(id, target, res.preview);
    else window.location.href = targetUrl;
  } catch (e) {
    handleEnterBoardError(e);
  }
}

function openBoardPasswordPrompt(id, target, preview, role = 'editor') {
  pendingBoardId = id;
  pendingTarget = target || 'board';
  pendingRole = role === 'viewer' ? 'viewer' : 'editor';
  preview = preview || {};
  const ownerInfo = preview.owner || { name: 'Владельцем', avatar: generateAvatarById('U') };

  // Динамически заполняем окно пароля (innerText — без HTML)
  document.getElementById('peBoardTitle').innerText = preview.title || 'Без названия';
  document.getElementById('peOwnerName').innerText = ownerInfo.name || 'Владелец';
  
  // Адаптируем UI для архива
  const clarificationEl = document.getElementById('peArchiveClarification');
  const btnTextEl = document.getElementById('peSubmitBtnText');
  if (clarificationEl && btnTextEl) {
    if (pendingTarget === 'archive') {
      clarificationEl.classList.remove('hidden');
      clarificationEl.classList.add('inline-flex');
      btnTextEl.innerText = 'Открыть архив';
    } else {
      clarificationEl.classList.add('hidden');
      clarificationEl.classList.remove('inline-flex');
      btnTextEl.innerText = 'Открыть проект';
    }
  }

  // Внедряем премиум-аватар владельца в центр
  const avatarWrap = document.getElementById('peOwnerAvatarWrap');
  avatarWrap.innerHTML = `
    <div class="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 rounded-full"></div>
    <div class="relative z-10 flex items-center justify-center p-1.5 bg-white dark:bg-gray-800 rounded-full border border-gray-100 dark:border-gray-700 shadow-xl">
      ${renderUserAvatar(ownerInfo, 'w-20 h-20')}
    </div>
  `;
  lucide.createIcons();

  const modal = document.getElementById('passwordEntryModal');
  const content = document.getElementById('passwordEntryContent');
  document.getElementById('boardEntryPassword').value = '';
  
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
    content.classList.add('scale-100');
    document.getElementById('boardEntryPassword').focus();
  }, 10);
}

function closePasswordPrompt() {
  const modal = document.getElementById('passwordEntryModal');
  const content = document.getElementById('passwordEntryContent');
  modal.classList.add('opacity-0');
  content.classList.remove('scale-100');
  content.classList.add('scale-95');
  setTimeout(() => { modal.classList.add('hidden'); pendingBoardId = null; }, 300);
}

async function submitBoardPassword() {
  const entered = document.getElementById('boardEntryPassword').value.trim();
  if (!entered || !pendingBoardId) return;
  const boardId = pendingBoardId;
  const targetUrl = boardTargetUrl(boardId, pendingTarget);

  // Локальные доски: пароль хранится только на этом устройстве
  if (boardId.startsWith('local_')) {
    const board = getLocalBoards()[boardId];
    if (board && board.password === entered) {
      sessionStorage.setItem('blocko_auth_' + boardId, entered);
      window.location.href = targetUrl;
    } else {
      showSystemToast('Ошибка доступа', 'Неверный пароль. Попробуйте еще раз.', 'shield-alert', 'text-red-500', 'bg-red-50');
      document.getElementById('boardEntryPassword').value = '';
    }
    return;
  }

  // Облачные доски: пароль проверяет сервер
  try {
    await BlockoAPI.call('enterBoard', { boardId, password: entered, role: pendingRole });
    window.location.href = targetUrl;
  } catch (e) {
    document.getElementById('boardEntryPassword').value = '';
    handleEnterBoardError(e);
  }
}
// ==========================================
// ЛОГИКА УСТАНОВКИ PWA (ПРИЛОЖЕНИЯ)
// ==========================================
let deferredPrompt;
const installBtn = document.getElementById('installPwaBtn');

// Регистрируем минимальный Service Worker (ОБЯЗАТЕЛЬНО для установки PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW error:', err));
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  // Отменяем стандартное уродливое всплывающее окно браузера
  e.preventDefault();
  // Сохраняем событие, чтобы вызвать его по клику на нашу кнопку
  deferredPrompt = e;
  // Показываем нашу премиальную кнопку в футере
  if (installBtn) {
    installBtn.classList.remove('hidden');
    installBtn.classList.add('flex');
  }
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      // Показываем системное окно установки
      deferredPrompt.prompt();
      // Ждем ответа пользователя
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('Пользователь установил PWA');
      }
      // Очищаем событие (оно одноразовое)
      deferredPrompt = null;
      // Прячем кнопку
      installBtn.classList.add('hidden');
      installBtn.classList.remove('flex');
    }
  });
}

window.addEventListener('appinstalled', () => {
  // Вызывается, когда приложение успешно установилось
  if (installBtn) {
    installBtn.classList.add('hidden');
    installBtn.classList.remove('flex');
  }
  deferredPrompt = null;
  showSystemToast('Готово! 🎉', 'Blocko Pro успешно установлено на ваше устройство.', 'smartphone', 'text-green-500', 'bg-green-50');
});
