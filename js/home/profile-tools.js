// ==========================================
// Blocko Pro · главная — profile-tools.js
// Бейджи, синхронизация профиля, рамки, админы, QR-шаринг
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. index.html.
// ==========================================

// ЭНТЕРПРАЙЗ: Универсальная гибридная синхронизация профиля (Cloud + Offline)
async function syncUserProfileToBoards(updates) {
  if (!currentUser || !currentUser.id) return;
  
  // 1. OFFLINE ENGINE: Zero-Latency обновление для локальных досок
  try {
    const localBoards = JSON.parse(localStorage.getItem('blocko_local_boards')) || {};
    let localUpdated = false;
    
    Object.keys(localBoards).forEach(boardId => {
      const lBoard = localBoards[boardId];
      if (lBoard.users && lBoard.users[currentUser.id]) {
        lBoard.users[currentUser.id] = {
          ...lBoard.users[currentUser.id],
          ...updates
        };
        localUpdated = true;
      }
    });
    
    if (localUpdated) {
      localStorage.setItem('blocko_local_boards', JSON.stringify(localBoards));
      // Обновляем отображение досок на главной странице, если они уже отрендерены
      if (typeof renderBoardsGrid === 'function') {
        requestAnimationFrame(() => renderBoardsGrid());
      }
    }
  } catch (err) {
    console.error("Local profile sync error:", err);
  }

  // 2. CLOUD ENGINE: Фоновая синхронизация по облачным проектам
  try {
    const boardsSnapshot = await db.collection('boards').where('members', 'array-contains', currentUser.id).get();
    
    // Масштабирование: обход системного лимита Firebase (500 операций на один batch)
    const batches = [];
    let currentBatch = db.batch();
    let opCount = 0;
    
    boardsSnapshot.forEach(doc => {
      const bData = doc.data();
      if (bData.users && bData.users[currentUser.id]) {
        currentBatch.update(doc.ref, {
          [`users.${currentUser.id}`]: {
            ...bData.users[currentUser.id],
            ...updates
          }
        });
        opCount++;
        
        // Разделяем пакеты по 450 операций для абсолютной безопасности
        if (opCount >= 450) {
          batches.push(currentBatch.commit());
          currentBatch = db.batch();
          opCount = 0;
        }
      }
    });
    
    if (opCount > 0) {
      batches.push(currentBatch.commit());
    }
    
    // Параллельно и быстро фиксируем все пакеты в базе данных
    await Promise.all(batches);
  } catch (e) { 
    console.error("Global cloud sync error:", e); 
  }
}

function updateProfilePreview(data) {
  // Идеально вписывающийся в левую часть аватар
  document.getElementById('profilePreviewArea').innerHTML = renderUserAvatar(data, "w-24 h-24");
  lucide.createIcons();
}

async function updateProfileAvatar() {
  const url = document.getElementById('customAvatarUrl').value.trim();
  await db.collection('users').doc(currentUser.id).update({ customAvatar: url });
  
  // Отправляем изменения во все проекты пользователя
  await syncUserProfileToBoards({ customAvatar: url });
  
  currentUser.customAvatar = url; // Обновляем локально

  // ЭНТЕРПРАЙЗ МИКРО-UX: Мгновенное обновление аватара в открытой модалке с анимацией пульсации
  updateProfilePreview(currentUser);
  const previewWrap = document.getElementById('profilePreviewArea');
  if (previewWrap) {
      previewWrap.classList.add('scale-105', 'ring-4', 'ring-blue-500/50', 'rounded-full', 'transition-all', 'duration-300');
      setTimeout(() => previewWrap.classList.remove('scale-105', 'ring-4', 'ring-blue-500/50'), 300);
  }

  const dashAvatarEl = document.getElementById('dashAvatar');
  if(dashAvatarEl) {
      dashAvatarEl.outerHTML = renderUserAvatar(currentUser, 'w-11 h-11', 'dashAvatar', 'openProfileSettings()');
      lucide.createIcons();
  }
  showSystemToast('Обновлено', 'Ваше фото профиля изменено везде!', 'image', 'text-blue-500', 'bg-blue-50');
}

// Выход из системы
async function logout() { 
  closeProfileModal();
  sessionStorage.clear(); // Полная очистка сессионных ключей перед выходом
  setTimeout(() => {
    auth.signOut().then(() => {
      window.location.reload(); 
    });
  }, 300);
}

// 1. Функция закрытия окна
function closeProfileModal() {
  const modal = document.getElementById('profileModal');
  const content = document.getElementById('profileContent');
  modal.classList.add('opacity-0');
  content.classList.remove('scale-100');
  content.classList.add('scale-95');
  setTimeout(() => { modal.classList.add('hidden'); }, 300);
}

// 2. Отрисовка палитры цветов (один симметричный ряд без прокрутки)
function renderFrameColors(currentColor) {
  const colors = [
    { name: 'Нет', value: 'transparent', glow: 'transparent' },
    { name: 'Синий', value: '#3b82f6', glow: 'rgba(59, 130, 246, 0.6)' },
    { name: 'Фиолетовый', value: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.6)' },
    { name: 'Розовый', value: '#ec4899', glow: 'rgba(236, 72, 153, 0.6)' },
    { name: 'Красный', value: '#ef4444', glow: 'rgba(239, 68, 68, 0.6)' },
    { name: 'Оранжевый', value: '#f97316', glow: 'rgba(249, 115, 22, 0.6)' },
    { name: 'Изумрудный', value: '#10b981', glow: 'rgba(16, 185, 129, 0.6)' },
    { name: 'Циан', value: '#06b6d4', glow: 'rgba(6, 182, 212, 0.6)' }
  ];

  const container = document.getElementById('frameColorPicker');
  container.innerHTML = colors.map(c => `
    <button onclick="applyFrameColor(${jsArg(c.value)}, ${jsArg(c.glow)})" 
            class="flex-shrink-0 w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${currentColor === c.glow ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}"
            style="background: ${c.value}; box-shadow: 0 0 10px ${c.glow};" title="${c.name}">
    </button>
  `).join('');
}
  
// 3. Сохранение выбранного цвета в базу
async function applyFrameColor(frameColor, glowColor) {
  if (!currentUser) return;
  
  // Получаем текущий конфиг, чтобы не затереть анимацию
  const userDoc = await db.collection('users').doc(currentUser.id).get();
  const currentConfig = userDoc.data().badgeConfig || {};
  const newConfig = { ...currentConfig, frameColor, glowColor };
  
  await db.collection('users').doc(currentUser.id).set({
    badgeConfig: newConfig
  }, { merge: true });
  
  await syncUserProfileToBoards({ badgeConfig: newConfig });
  
  const updatedDoc = await db.collection('users').doc(currentUser.id).get();
  currentUser.badgeConfig = newConfig; // Обновляем локально
  updateProfilePreview(updatedDoc.data());
  renderFrameColors(glowColor);
  
  const dashAvatarEl = document.getElementById('dashAvatar');
  if(dashAvatarEl) {
      dashAvatarEl.outerHTML = renderUserAvatar(updatedDoc.data(), 'w-11 h-11', 'dashAvatar', 'openProfileSettings()');
      lucide.createIcons();
  }
  
  showSystemToast('Сохранено', 'Цвет рамки обновлен везде!', 'palette', 'text-indigo-500', 'bg-indigo-50');
}

// 4. Сохранение анимации (для Амбассадоров)
    async function updateProfileEffects() {
      if (!currentUser) return;
      const animation = document.getElementById('frameAnimationSelect').value;
      
      const userDoc = await db.collection('users').doc(currentUser.id).get();
      const currentConfig = userDoc.data().badgeConfig || {};
      const newConfig = { ...currentConfig, animation };
      
      await db.collection('users').doc(currentUser.id).set({
        badgeConfig: newConfig
      }, { merge: true });
      
      await syncUserProfileToBoards({ badgeConfig: newConfig });
      
      const updatedDoc = await db.collection('users').doc(currentUser.id).get();
      currentUser.badgeConfig = newConfig;
      updateProfilePreview(updatedDoc.data());
      
      const dashAvatarEl = document.getElementById('dashAvatar');
      if(dashAvatarEl) {
          dashAvatarEl.outerHTML = renderUserAvatar(updatedDoc.data(), 'w-11 h-11', 'dashAvatar', 'openProfileSettings()');
          lucide.createIcons();
      }
      
      showSystemToast('Сохранено', 'Анимация обновлена везде!', 'zap', 'text-amber-500', 'bg-amber-50');
    }

    // --- ЭНТЕРПРАЙЗ: ЛОГИКА УПРАВЛЕНИЯ ДОСТУПОМ (RBAC) ---
    function openManageAdminsModal() {
        const modal = document.getElementById('manageAdminsModal');
        const content = document.getElementById('manageAdminsContent');
        closeProfileModal();
        
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        }, 10);
        
        loadAdminsList();
    }

    function closeManageAdminsModal() {
        const modal = document.getElementById('manageAdminsModal');
        const content = document.getElementById('manageAdminsContent');
        modal.classList.add('opacity-0');
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
        // Возвращаемся в профиль после закрытия
        setTimeout(() => { modal.classList.add('hidden'); openProfileSettings(); }, 300);
    }

    async function loadAdminsList() {
        const list = document.getElementById('adminsList');
        list.innerHTML = '<div class="text-center py-6"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto text-rose-500"></i></div>';
        lucide.createIcons();
        
        try {
            const doc = await db.collection('system').doc('admins').get();
            let emails = [];
            if (doc.exists) emails = doc.data().emails || [];
            
            if (emails.length === 0) {
                list.innerHTML = `
                  <div class="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl text-center border border-gray-200 dark:border-gray-700 border-dashed">
                    <i data-lucide="users" class="w-8 h-8 mx-auto mb-2 text-gray-400"></i>
                    <div class="text-xs text-gray-500 font-bold">Список пуст. Вы единственный владелец.</div>
                  </div>`;
                lucide.createIcons();
                return;
            }
            
            list.innerHTML = emails.map(email => `
                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-rose-300 dark:hover:border-rose-700 transition-colors group">
                    <div class="flex items-center gap-3 overflow-hidden">
                       <div class="p-2 bg-white dark:bg-gray-900 rounded-lg shadow-sm group-hover:text-rose-500 transition-colors border border-gray-100 dark:border-gray-800"><i data-lucide="user" class="w-4 h-4"></i></div>
                       <span class="text-sm font-bold text-gray-700 dark:text-gray-200 truncate">${esc(email)}</span>
                    </div>
                    <button onclick="removeAdmin(${jsArg(email)})" class="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-2 rounded-lg transition-all" title="Отозвать доступ"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            `).join('');
            lucide.createIcons();
        } catch(e) {
            list.innerHTML = '<div class="text-xs text-red-500 text-center py-4 font-bold">Ошибка загрузки базы данных</div>';
        }
    }

    async function addAdmin() {
        const input = document.getElementById('newAdminEmail');
        const email = input.value.trim().toLowerCase();
        if (!email) return;
        
        const btn = input.nextElementSibling;
        const ogBtn = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>';
        lucide.createIcons({ root: btn });
        
        try {
            await db.collection('system').doc('admins').set({
                emails: firebase.firestore.FieldValue.arrayUnion(email)
            }, { merge: true });
            
            input.value = '';
            showSystemToast('Доступ выдан', `Пользователь ${email} теперь администратор.`, 'shield-check', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/30');
            loadAdminsList();
        } catch(e) {
            showSystemToast('Ошибка', 'Не удалось добавить администратора.', 'x-circle', 'text-red-500', 'bg-red-50 dark:bg-red-900/30');
        } finally {
            btn.innerHTML = ogBtn;
            lucide.createIcons({ root: btn });
        }
    }

    async function removeAdmin(email) {
        if (!confirm(`Отозвать права администратора у ${email}?`)) return;
        try {
            await db.collection('system').doc('admins').update({
                emails: firebase.firestore.FieldValue.arrayRemove(email)
            });
            showSystemToast('Доступ закрыт', 'Права администратора успешно отозваны.', 'trash-2', 'text-red-500', 'bg-red-50 dark:bg-red-900/30');
            loadAdminsList();
        } catch(e) {
            showSystemToast('Ошибка', 'Не удалось удалить администратора.', 'x-circle', 'text-red-500', 'bg-red-50 dark:bg-red-900/30');
        }
    }

    // --- ЭНТЕРПРАЙЗ: QR-SHARE ENGINE ---
    let currentQrUrl = '';

    function openQrModal(inputId, descText) {
        const input = document.getElementById(inputId);
        if (!input || !input.value) return;

        currentQrUrl = input.value;
        document.getElementById('qrCodeDesc').innerText = descText || 'Отсканируйте код, чтобы перейти по ссылке.';

        const canvas = document.getElementById('qrCanvas');
        
        // Генерация QR-кода на лету
        if (typeof QRCode === 'undefined' || typeof QRCode.toCanvas !== 'function') {
            return showSystemToast('QR недоступен', 'Не удалось загрузить генератор QR. Скопируйте ссылку вручную.', 'alert-triangle', 'text-amber-500', 'bg-amber-50');
        }
        QRCode.toCanvas(canvas, currentQrUrl, {
            width: 200,
            margin: 1,
            color: {
                dark: "#0f172a", // Стилизация под Blocko Pro (Сланец)
                light: "#ffffff"
            }
        }, function (error) {
            if (error) console.error("QR Engine Error:", error);
        });

        const modal = document.getElementById('qrCodeModal');
        const content = document.getElementById('qrCodeContent');
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        }, 10);
    }

    function closeQrModal() {
        const modal = document.getElementById('qrCodeModal');
        const content = document.getElementById('qrCodeContent');
        modal.classList.add('opacity-0');
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }

    function downloadQrCode() {
        const canvas = document.getElementById('qrCanvas');
        const url = canvas.toDataURL("image/png");
        const a = document.createElement('a');
        a.href = url;
        a.download = 'BlockoPro_Access_QR.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showSystemToast('Успешно', 'QR-код сохранен на ваше устройство.', 'download', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/30');
    }

    async function shareQrCode() {
        const canvas = document.getElementById('qrCanvas');
        
        try {
            // Конвертируем canvas в Blob для отправки в системный шаринг
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const file = new File([blob], 'BlockoPro_Access_QR.png', { type: 'image/png' });

            // Проверка поддержки нативного шаринга файлов (Web Share API Level 2)
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'Blocko Pro',
                    text: 'Привет! Присоединяйся ко мне в Blocko Pro:\n' + currentQrUrl,
                    files: [file]
                });
                showSystemToast('Отправлено', 'QR-код и ссылка успешно отправлены.', 'check-circle', 'text-indigo-500', 'bg-indigo-50 dark:bg-indigo-900/30');
            } else {
                throw new Error('Native file share is not supported');
            }
        } catch (error) {
            console.warn('Share API fallback:', error);
            // Фолбэк для десктопов, где шаринг файлов не поддерживается
            navigator.clipboard.writeText(currentQrUrl);
            showSystemToast('Скопировано', 'Файловый шаринг недоступен на этом устройстве. Ссылка скопирована в буфер.', 'copy', 'text-blue-500', 'bg-blue-50 dark:bg-blue-900/30');
        }
    }

  function navigateToKnowledgeBase() {
    // Здесь укажите ссылку на вашу страницу Базы Знаний
    // Например: window.location.href = 'knowledge-base.html';
    showSystemToast('Загрузка', 'Переходим в базу знаний...', 'book-open', 'text-indigo-500', 'bg-indigo-50');
    
    setTimeout(() => {
        // Логика перехода
        console.log("Redirecting to Knowledge Base...");
    }, 800);
}

/**
 * ЭНТЕРПРАЙЗ ENGINE: Sequence Onboarding Controller
 * Управляет поочередным отображением карточек при клике в любое место экрана.
 */
const OnboardingEngine = {
    steps: ['knowledge', 'referral', 'plan'],
    currentIndex: 0,
    isProcessing: false,

    started: false,
    STORAGE_KEY: 'blocko_onboarding_done',

    // Вызывается только после входа в аккаунт. Показываем подсказки один раз.
    init() {
        if (this.started) return;
        try { if (localStorage.getItem(this.STORAGE_KEY)) return; } catch (e) {}
        this.started = true;
        // ЭНТЕРПРАЙЗ: Скрываем карточку апгрейда тарифа для премиум-пользователей
        const currentPlan = localStorage.getItem('blocko_user_plan') || 'free';
        if (currentPlan === 'pro' || currentPlan === 'infinity') {
            this.steps = ['knowledge', 'referral'];
        }

        // Запуск первой карточки через 2 секунды после загрузки
        setTimeout(() => this.showStep(0), 2000);
        
        // Глобальный слушатель клика по экрану
        window.addEventListener('click', (e) => {
            // Проверяем, что клик не по самой карточке, чтобы не сбивать навигацию по кнопке
            if (e.target.closest('#onboardingSequenceContainer')) return;
            this.handleGlobalClick();
        });
    },

    showStep(index) {
        if (index >= this.steps.length) return;
        
        const stepKey = this.steps[index];
        const card = document.getElementById(`obCard_${stepKey}`);
        
        if (card) {
            // Если это карточка тарифа, обновляем имя текущего плана
            if (stepKey === 'plan') {
                const plan = localStorage.getItem('blocko_user_plan') || 'FREE';
                document.getElementById('obUserPlanName').innerText = plan.toUpperCase();
            }
            
            card.classList.remove('hidden');
            card.classList.add('flex');
            lucide.createIcons({ root: card });
        }
    },

    hideCurrentStep() {
        const stepKey = this.steps[this.currentIndex];
        const card = document.getElementById(`obCard_${stepKey}`);
        
        if (card) {
            card.classList.add('opacity-0', 'translate-y-10');
            setTimeout(() => {
                card.classList.add('hidden');
                card.classList.remove('flex', 'opacity-0', 'translate-y-10');
            }, 500);
        }
    },

    handleGlobalClick() {
        if (this.isProcessing || this.currentIndex >= this.steps.length) return;

        const currentCard = document.getElementById(`obCard_${this.steps[this.currentIndex]}`);
        // Если текущая карточка отображена, скрываем её и готовим следующую
        if (currentCard && !currentCard.classList.contains('hidden')) {
            this.isProcessing = true;
            this.hideCurrentStep();
            this.currentIndex++;

            // Если есть следующий шаг, запускаем его через 2.5 секунды
            if (this.currentIndex < this.steps.length) {
                setTimeout(() => {
                    this.showStep(this.currentIndex);
                    this.isProcessing = false;
                }, 2500);
            } else {
                this.isProcessing = false;
                try { localStorage.setItem(this.STORAGE_KEY, '1'); } catch (e) {}
            }
        }
    }
};

// Инициализация — из onAuthStateChanged, после входа (не поверх экрана авторизации)
