// ==========================================
// Blocko Pro · доска — chat.js
// Чат команды: вложения, сообщения, лайки
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// Конвертация в Base64 и сохранение с таймером/сжиганием
async function confirmFileUpload(retentionType) {
  // ПРОВЕРКА ТАРИФА (Добавлена поддержка Infinity)
  if (retentionType === 'burn' && userPlan !== 'pro' && userPlan !== 'infinity') {
     closeFileTypeModal();
     return showSystemToast('Pro Функция', 'Сгорающие (шпионские) файлы доступны только на тарифах Company и выше.', 'lock', 'text-amber-500', 'bg-amber-50');
  }

  if (!pendingChatFile) return;
  const file = pendingChatFile;
  closeFileTypeModal();

  const chatBox = document.getElementById("chatMessages");
  const tempId = 'load_' + Date.now();
  chatBox.innerHTML += `<div id="${esc(tempId)}" class="text-xs text-blue-500 text-center animate-pulse py-2">Шифрование и отправка...</div>`;
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const base64 = await new Promise((resolve, reject) => {
         const reader = new FileReader();
         reader.readAsDataURL(file);
         reader.onload = () => resolve(reader.result);
         reader.onerror = error => reject(error);
    });

    let expiresAt = null;
    if (retentionType === '1day') expiresAt = Date.now() + (24 * 60 * 60 * 1000);
    if (retentionType === '7days') expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);

    await db.collection("boards").doc(BOARD_ID).collection("chat").add({
      text: "", 
      attachment: { 
          type: 'file', 
          url: base64, 
          name: file.name, 
          size: (file.size/1024).toFixed(1)+' KB',
          retention: retentionType,
          expiresAt: expiresAt
      },
      user: currentUser, 
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    showSystemToast('Ошибка', 'Сбой обработки файла', 'alert-circle', 'text-red-500', 'bg-red-50');
  } finally {
    document.getElementById(tempId)?.remove();
  }
}

async function uploadImageToImgbb(file) {
  if (!navigator.onLine) {
    return showSystemToast('Офлайн', 'Отправка картинок недоступна без интернета.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
  }
  const chatBox = document.getElementById("chatMessages");
  const tempId = 'load_' + Date.now();
  chatBox.innerHTML += `<div id="${esc(tempId)}" class="text-xs text-blue-500 text-center animate-pulse py-2">Загрузка изображения...</div>`;
  chatBox.scrollTop = chatBox.scrollHeight;
  try {
    const fd = new FormData(); fd.append('image', file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method:'POST', body: fd });
    const data = await res.json();
    if (data.success) {
      await db.collection("boards").doc(BOARD_ID).collection("chat").add({
        text: "", attachment: { type: 'image', url: data.data.url, name: file.name },
        user: currentUser, timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else throw new Error("Ошибка загрузки");
  } catch (err) {
    showSystemToast('Ошибка', err.message, 'alert-circle', 'text-red-500', 'bg-red-50');
  } finally {
    document.getElementById(tempId)?.remove();
  }
}

function processBoardData(data) {
  const headerTitle = document.getElementById('boardTitleHeader');
  headerTitle.innerText = data.title;

  // ЭНТЕРПРАЙЗ: Инициализация Пространств (Tabs)
  if (!boardData.spaces) boardData.spaces = [{ id: 'default', name: 'Главная' }];
  renderSpacesUI();

  // ЭНТЕРПРАЙЗ: Синхронизация селектора очистки с данными доски
  const retentionSelect = document.getElementById('logRetentionSelect');
  if (retentionSelect && data.logRetention) {
    retentionSelect.value = data.logRetention;
  } else if (retentionSelect) {
    retentionSelect.value = "1"; // Дефолтное значение
  }
  
  const myRole = data.users && data.users[currentUser.id] ? data.users[currentUser.id].role : 'editor';
  const isViewer = myRole === 'viewer' && !isLocalBoard;
  
  // ЭНТЕРПРАЙЗ: Скрываем меню инвайтов и настройки фона для Читателей
  const shareMenuWrapper = document.getElementById('shareMenuWrapper');
  if (shareMenuWrapper) shareMenuWrapper.style.display = isViewer ? 'none' : 'block';

  // ЭНТЕРПРАЙЗ: Полностью вырезаем интерфейс Журнала Действий для Офлайн досок
  const btnActivityLog = document.getElementById('btnActivityLog');
  if (btnActivityLog) {
    btnActivityLog.style.display = isLocalBoard ? 'none' : '';
  }
  
  const bgSettingsBlock = document.getElementById('bgSettingsBlock');
  if (bgSettingsBlock) bgSettingsBlock.style.display = isViewer ? 'none' : 'block';

  // ЭНТЕРПРАЙЗ: Отключаем плавающую кнопку AI-ассистента для Читателей (Read-Only Mode)
  const aiFloatingBtn = document.getElementById('aiFloatingBtn');
  if (aiFloatingBtn) aiFloatingBtn.style.display = isViewer ? 'none' : 'flex';
  
  // Принудительно закрываем шторку AI, если у пользователя внезапно отобрали права
  if (isViewer) {
      const aiSidebar = document.getElementById('aiSidebar');
      if (aiSidebar && !aiSidebar.classList.contains('translate-x-full')) {
          aiSidebar.classList.add('translate-x-full');
      }
  }
  
  // ЭНТЕРПРАЙЗ UX: Отключаем визуальные подсказки переименования (hover/курсор), если нет прав владельца
  if (!isLocalBoard && data.owner !== currentUser.id) {
    headerTitle.classList.remove('cursor-pointer', 'hover:text-blue-500', 'hover:underline');
    headerTitle.removeAttribute('title');
  } else {
    headerTitle.classList.add('cursor-pointer', 'hover:text-blue-500', 'hover:underline');
    headerTitle.setAttribute('title', 'Нажмите, чтобы переименовать');
  }

  if (data.background) {
    const safeBg = safeUrl(data.background);
    document.body.style.backgroundImage = safeBg ? `url(${JSON.stringify(safeBg)})` : '';
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
  } else { document.body.style.backgroundImage = 'none'; }
  
  // ЭНТЕРПРАЙЗ: Динамическое SEO & SMO (Social Media Optimization)
  document.title = `${data.title || 'Проект'} — Blocko Pro`;
  
  let ogTitle = document.querySelector('meta[property="og:title"]');
  if (!ogTitle) { ogTitle = document.createElement('meta'); ogTitle.setAttribute('property', 'og:title'); document.head.appendChild(ogTitle); }
  ogTitle.setAttribute('content', `${data.title || 'Проект'} — Blocko Pro`);

  let ogDesc = document.querySelector('meta[property="og:description"]');
  if (!ogDesc) { ogDesc = document.createElement('meta'); ogDesc.setAttribute('property', 'og:description'); document.head.appendChild(ogDesc); }
  ogDesc.setAttribute('content', `Защищенное рабочее пространство. Владелец: ${data.users && data.users[data.owner] ? data.users[data.owner].name : 'Пользователь'}`);

  if (data.background) {
      let ogImage = document.querySelector('meta[property="og:image"]');
      if (!ogImage) { ogImage = document.createElement('meta'); ogImage.setAttribute('property', 'og:image'); document.head.appendChild(ogImage); }
      ogImage.setAttribute('content', data.background);
  }
  
  updateTagFilterDropdown();
  render(); 
  renderSettingsTags();

  // ЭНТЕРПРАЙЗ: Умная маршрутизация Deep Links (Авто-фокус на задачу из URL)
  setTimeout(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const targetCardId = urlParams.get('c');
    
    if (targetCardId && !window.blockoDeepLinkFired) {
      window.blockoDeepLinkFired = true; // Защита от зацикливания при ререндерах
      
      columns.forEach(col => {
        const foundCard = col.cards?.find(c => c.id == targetCardId);
        if (foundCard) {
           // Находим узел карточки в DOM для эмуляции клика
           const cardNode = document.querySelector(`[data-card="${CSS.escape(String(targetCardId))}"]`);
           if (cardNode) {
              // Плавный скролл к задаче
              cardNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
              
              // Неоновая подсветка для фокуса
              cardNode.classList.add('ring-4', 'ring-indigo-500', 'scale-105', 'shadow-2xl');
              setTimeout(() => cardNode.classList.remove('ring-4', 'ring-indigo-500', 'scale-105', 'shadow-2xl'), 2000);
              
              // Открываем правильную модалку через делегирование
              setTimeout(() => {
                const action = cardNode.getAttribute('data-action');
                if (action === 'viewCard') openViewModal(col.id, targetCardId);
              }, 600);
              
              // Очищаем URL (меняем State), чтобы при обновлении страницы карточка не открывалась снова
              window.history.replaceState({}, document.title, window.location.pathname + '?b=' + BOARD_ID);
           }
        }
      });
    }
  }, 800); // Даем время DOM на отрисовку колонок перед скроллом
}
function renameBoard() {
  // КРИТИЧЕСКИЙ ФИКС БЕЗОПАСНОСТИ: Запрет изменения названия для всех, кроме владельца
  if (!isLocalBoard && boardData.owner !== currentUser.id) {
    return showSystemToast('Отказ в доступе', 'Только владелец проекта может изменять его название.', 'shield-alert', 'text-red-500', 'bg-red-50 dark:bg-red-900/20');
  }

  const currentTitle = document.getElementById('boardTitleHeader').innerText;
  // Создаем временный оверлей для ввода названия, чтобы не использовать системный prompt
  const newTitle = prompt("Новое название проекта:", currentTitle); 
  // Примечание: В следующем обновлении заменим этот prompt на полноценную модалку ввода.
  // Пока фокусируемся на критических системных уведомлениях.
  if (newTitle && newTitle.trim() !== "" && newTitle !== currentTitle) {
    updateBoardData({ title: newTitle.trim() });
    showSystemToast('Название обновлено', 'Изменения синхронизированы с облаком.', 'edit-3', 'text-blue-500', 'bg-blue-50 dark:bg-blue-900/30');
  }
}

function handleChatAttachment(e) {
  if (isLocalBoard) {
     showSystemToast('Ограничение', 'Вложения доступны только в Cloud-проектах.', 'shield-alert', 'text-amber-500', 'bg-amber-50');
     e.target.value = ''; return;
  }
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = ''; 
  
  if (file.type.startsWith('image/')) {
     uploadImageToImgbb(file); 
  } else {
     if (file.size > MAX_CHAT_FILE_BYTES) {
        return showSystemToast('Лимит превышен', 'Файл слишком большой! Максимум 700 КБ.', 'alert-circle', 'text-red-500', 'bg-red-50');
     }
     pendingChatFile = file; 
     const el = document.getElementById('fileTypeModal');
     el.classList.remove('hidden');
     setTimeout(() => el.classList.remove('opacity-0'), 10);
  }
}
