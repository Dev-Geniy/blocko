// ==========================================
// Blocko Pro · доска — interactions.js
// Панорамирование, подтверждения, AI для карточек, голосовой агент, дедлайны
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// ЭНТЕРПРАЙЗ: Продвинутый Panning (Панорамирование доски мышью) + Adaptive Scroll Debouncing
const mainScroll = document.getElementById('mainScroll'); 
let isDown = false, startX, scrollLeft;
let scrollTimeout;

// Debouncing скролла: отключаем тяжелые тени при активном движении
mainScroll.addEventListener('scroll', () => {
  if (!document.body.classList.contains('is-scrolling-fast')) {
    document.body.classList.add('is-scrolling-fast');
  }
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    document.body.classList.remove('is-scrolling-fast');
  }, 200); 
}, { passive: true });

mainScroll.addEventListener('mousedown', e => { 
  if(e.target.closest('.card-item') || e.target.closest('button') || e.target.closest('input') || e.target.closest('.col-handle')) return; 
  isDown = true; 
  mainScroll.style.cursor = 'grabbing'; 
  startX = e.pageX - mainScroll.offsetLeft; 
  scrollLeft = mainScroll.scrollLeft; 
});

mainScroll.addEventListener('mouseleave', () => { 
  isDown = false; 
  mainScroll.style.cursor = 'grab'; 
});

mainScroll.addEventListener('mouseup', () => { 
  isDown = false; 
  mainScroll.style.cursor = 'grab'; 
});

mainScroll.addEventListener('mousemove', e => { 
  if(!isDown) return; 
  e.preventDefault(); 
  const x = e.pageX - mainScroll.offsetLeft;
  const walk = (x - startX) * 1.5; 
  mainScroll.scrollLeft = scrollLeft - walk; 
});
  
function getBoardTags() { return boardData.tags && boardData.tags.length > 0 ? boardData.tags : DEFAULT_BOARD_TAGS; }
function renderSettingsTags() {
  const list = document.getElementById('settingsTagsList'); const form = document.getElementById('newTagForm');
  const isOwnerOrEditor = boardData.users && boardData.users[currentUser.id] ? boardData.users[currentUser.id].role !== 'viewer' : true;
  form.style.display = (isOwnerOrEditor || isLocalBoard) ? 'block' : 'none';
  list.innerHTML = getBoardTags().map(t => `
    <div class="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded-xl border border-gray-100 dark:border-gray-700">
      <span class="px-3 py-1 rounded-lg text-xs font-bold border ${esc(t.color)}">${esc(t.name)}</span>
      ${(isOwnerOrEditor || isLocalBoard) ? `<button onclick="deleteCustomTag(${jsArg(t.id)})" class="text-gray-400 hover:text-red-500 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
    </div>
  `).join('');
  document.getElementById('newTagColorPicker').innerHTML = TAG_PALETTE.map(c => `
    <button onclick="newTagSelectedColor=${jsArg(c)}; renderSettingsTags()" class="w-6 h-6 flex-shrink-0 rounded-full border-2 transition-transform ${newTagSelectedColor === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'} ${c.split(' ')[0]}"></button>
  `).join(''); lucide.createIcons();
}

function addNewCustomTag() {
  const name = document.getElementById('newTagName').value.trim(); if (!name) return;
  const updatedTags = [...getBoardTags(), { id: 'tag_' + Date.now(), name, color: newTagSelectedColor }];
  updateBoardData({ tags: updatedTags }); document.getElementById('newTagName').value = '';
}

// Замена системных окон на кастомные для удаления
function deleteCustomTag(tagId) {
  openConfirmModal('Удалить тег?', 'Этот тег будет навсегда удален со всех карточек в этом проекте.', 'Удалить тег', true, () => {
    updateBoardData({ tags: getBoardTags().filter(t => t.id !== tagId) });
    if (!isLocalBoard) {
      const cardsRef = db.collection("boards").doc(BOARD_ID).collection("cards");
      const tagged = Array.from(allCardsMap.values()).filter(c => Array.isArray(c.tags) && c.tags.includes(tagId));
      for (let i = 0; i < tagged.length; i += 400) {
        const batch = db.batch();
        tagged.slice(i, i + 400).forEach(c => batch.update(cardsRef.doc(String(c.id)), { tags: firebase.firestore.FieldValue.arrayRemove(tagId) }));
        batch.commit().catch(e => console.error('deleteCustomTag', e));
      }
      return;
    }
    columns = columns.map(col => {
      return { ...col, cards: (col.cards || []).map(card => { if (card.tags && card.tags.includes(tagId)) return { ...card, tags: card.tags.filter(id => id !== tagId) }; return card; }) };
    }); 
    persist();
  });
}

async function checkAILimit() {
  // ЭНТЕРПРАЙЗ: Система динамического квотирования ресурсов.
  // 1. Идентификация тарифа и базовых лимитов
  const currentPlanData = getPlanLimits(userPlan);
  let baseLimit = currentPlanData.aiLimit; 
  
  // Безлимит для тарифа Company
  if (baseLimit >= 999) return true; 

  try {
    const userRef = db.collection('users').doc(currentUser.id);
    const userDoc = await userRef.get();
    const data = userDoc.exists ? userDoc.data() : {};
    
    // 2. Проверка активных аддонов и бустеров
    const now = Date.now();
    if (data.aiDailySub && data.aiSubExpires && data.aiSubExpires > now) {
      baseLimit = Math.max(baseLimit, 250); 
    }
    
    const bonusLimit = data.bonusAiLimit || 0;
    const totalLimit = baseLimit + bonusLimit;

    // 3. Локальный счетчик с защитой от рассинхрона
    let aiUsage = JSON.parse(localStorage.getItem('blocko_ai_usage')) || { date: new Date().toDateString(), count: 0 };
    if (aiUsage.date !== new Date().toDateString()) {
      aiUsage = { date: new Date().toDateString(), count: 0 };
    }
    
    // 4. ТЕХНИЧЕСКИЙ ВЕНТИЛЬ: Проверка лимитов на стороне UI
    if (aiUsage.count >= totalLimit) {
      // Визуальный триггер достижения лимита
      showSystemToast('Ресурс исчерпан', `Лимит тарифа: ${totalLimit} запр./день. Дождитесь обновления или повысьте тариф.`, 'lock', 'text-amber-500', 'bg-amber-50 dark:bg-amber-900/20');
      
      // Перенаправление на страницу оплаты, если лимит достигнут критически
      if (aiUsage.count > totalLimit + 2) {
          setTimeout(() => { window.location.href = 'store.html?reason=ai_limit'; }, 2000);
      }
      return false;
    }
    
    // 5. Инкремент квоты
    aiUsage.count++;
    localStorage.setItem('blocko_ai_usage', JSON.stringify(aiUsage));
    return true;
  } catch (e) {
    console.error("Critical Limit Check Error:", e);
    return false;
  }
}
  
// ЭНТЕРПРАЙЗ: Генеративный контекстный движок для карточек
function setBtnLoading(btnId, isLoading, originalHtml) {
  const btn = document.getElementById(btnId);
  if (isLoading) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Думаю...';
  } else {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
  lucide.createIcons({ root: btn.parentElement });
}

async function generateAIDescFromTitle() {
  if (!navigator.onLine) return showSystemToast('Офлайн', 'AI недоступен без интернета.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
  if (!(await checkAILimit())) return;
  
  const title = document.getElementById('editTitle').value.trim();
  const textarea = document.getElementById('editDescription'); 
  if (!title) return showSystemToast('Внимание', 'Напишите название задачи, чтобы AI понял суть.', 'alert-circle', 'text-amber-500', 'bg-amber-50');
  
  const btnId = 'aiGenTitleBtn';
  const ogBtn = document.getElementById(btnId).innerHTML; 
  setBtnLoading(btnId, true, ogBtn);
  
  try {
    // ЭНТЕРПРАЙЗ: Оптимизированный промпт для компактной и содержательной генерации без перегрузки БД
    const prompt = `Действуй как опытный Project Manager. Напиши емкое, но содержательное описание для задачи: "${title}".
Требования к тексту:
1. Будь краток: максимум 2-3 небольших абзаца.
2. Сделай текст полезным: добавь пару неочевидных инсайтов, советов или укажи на возможные "подводные камни" при выполнении.
3. Используй легкий Markdown (жирный шрифт для акцентов, короткие маркированные списки).
4. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО генерировать таблицы и длинные массивы текста.
5. Не используй вводных фраз вроде "Вот план" или "Конечно, вот описание" — начинай сразу с сути.`;

    const response = await fetch(`${AI_ENDPOINT}${encodeURIComponent(prompt)}?model=openai`);
    textarea.value = await response.text();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (err) { 
    showSystemToast('Ошибка', 'Сбой нейросети.', 'alert-triangle', 'text-red-500', 'bg-red-50'); 
  } finally { 
    setBtnLoading(btnId, false, ogBtn); 
  }
}
  
async function generateAIDescFromText() {
  if (!navigator.onLine) return showSystemToast('Офлайн', 'AI недоступен без интернета.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
  if (!(await checkAILimit())) return;
  
  const textarea = document.getElementById('editDescription'); 
  const currentText = textarea.value.trim();
  if (!currentText) return showSystemToast('Внимание', 'Сначала напишите черновик описания.', 'alert-circle', 'text-amber-500', 'bg-amber-50');
  
  const btnId = 'aiGenTextBtn';
  const ogBtn = document.getElementById(btnId).innerHTML; 
  setBtnLoading(btnId, true, ogBtn);
  
  try {
    const prompt = `Перепиши, улучши и детально структурируй этот черновик задачи. Сделай текст профессиональным и легко читаемым для команды. Используй Markdown (заголовки H3, выделения). Вот текст:\n\n${currentText}`;
    const response = await fetch(`${AI_ENDPOINT}${encodeURIComponent(prompt)}?model=openai`);
    textarea.value = await response.text();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (err) { showSystemToast('Ошибка', 'Сбой нейросети.', 'alert-triangle', 'text-red-500', 'bg-red-50'); } 
  finally { setBtnLoading(btnId, false, ogBtn); }
}

async function generateAIChecklistFromDesc() {
  if (!navigator.onLine) return showSystemToast('Офлайн', 'AI недоступен без интернета.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
  if (!(await checkAILimit())) return;
  
  const title = document.getElementById('editTitle').value.trim();
  const desc = document.getElementById('editDescription').value.trim();
  if (!desc) return showSystemToast('Внимание', 'Описание пустое. Добавьте текст для генерации.', 'alert-circle', 'text-amber-500', 'bg-amber-50');
  
  const btnId = 'aiGenChecklistBtn';
  const ogBtn = document.getElementById(btnId).innerHTML; 
  setBtnLoading(btnId, true, ogBtn);
  
  try {
    const prompt = `Проанализируй описание задачи "${title}" и выдели из него от 3 до 5 самых важных конкретных шагов для выполнения. Выведи ТОЛЬКО список шагов (строго от 3 до 5 пунктов), каждый с новой строки. Без нумерации, без дефисов в начале. Только текст каждого шага. Описание:\n${desc}`;
    const response = await fetch(`${AI_ENDPOINT}${encodeURIComponent(prompt)}?model=openai`);
    const text = await response.text();
    
    // Чистим ответ от возможных маркеров списков, которые AI мог добавить от себя
    const lines = text.split('\n').map(l => l.replace(/^[-*•\d.\s]+(?:\[[ x]\])?\s*/i, '').trim()).filter(l => l.length > 0);
    
    if (lines.length > 0) {
      lines.forEach(line => {
        // Добавляем реальный физический элемент чек-листа в карточку!
        activeChecklist.push({ id: Date.now() + Math.random(), text: line, isCompleted: false });
      });
      renderChecklistEdit();
      showSystemToast('Готово', 'Чек-лист успешно сформирован!', 'check', 'text-green-500', 'bg-green-50');
    } else {
       showSystemToast('Внимание', 'AI не смог выделить конкретные шаги.', 'info', 'text-blue-500', 'bg-blue-50');
    }
  } catch (err) { showSystemToast('Ошибка', 'Сбой нейросети.', 'alert-triangle', 'text-red-500', 'bg-red-50'); } 
  finally { setBtnLoading(btnId, false, ogBtn); }
}

// ЭНТЕРПРАЙЗ: Мощный движок Voice-to-Text, Wake Word и Глобальный AI-Агент
let aiSpeechRecognition = null;
let isAiListening = false;
let wakeWordRecognition = null;
let isWakeWordActive = false;

let globalVoiceRecognition = null;
let isGlobalVoiceActive = false;

// ЭНТЕРПРАЙЗ: Глобальный перехватчик клавиши ENTER для вызова агента (Бронебойный)
document.addEventListener('keydown', (e) => {
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  const isInputFocused = activeTag === 'input' || activeTag === 'textarea' || document.activeElement.isContentEditable;
  const isModalOpen = document.querySelectorAll('.glass-modal:not(.hidden), [id$="Modal"]:not(.hidden)').length > 0;
  
  const sidebars = ['chatSidebar', 'settingsSidebar', 'membersSidebar', 'archiveSidebar', 'aiSidebar'];
  const isSidebarOpen = sidebars.some(id => {
      const el = document.getElementById(id);
      return el && el.style.display !== 'none' && !el.classList.contains('translate-x-full');
  });
  
  const focusOnPage = !document.activeElement || document.activeElement === document.body;
  if (e.key === 'Enter' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && focusOnPage && !isInputFocused && !isModalOpen && !isSidebarOpen) {
    e.preventDefault();
    activateGlobalVoiceAgent();
  }
});

function activateGlobalVoiceAgent() {
  if (isLocalBoard) return showSystemToast('Офлайн', 'Агент недоступен без интернета.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
  
  // ЭНТЕРПРАЙЗ БЕЗОПАСНОСТЬ: Читатели не могут создавать объекты
  const myRole = boardData.users && boardData.users[currentUser.id] ? boardData.users[currentUser.id].role : 'editor';
  if (myRole === 'viewer') return;

  if (isGlobalVoiceActive) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return showSystemToast('Ошибка', 'Голосовой ввод не поддерживается.', 'mic-off', 'text-red-500', 'bg-red-50');

  closeOtherSidebars('none'); // Очищаем экран

  const overlay = document.getElementById('globalVoiceOverlay');
  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.remove('opacity-0'), 10);
  lucide.createIcons({ root: overlay });

  if (wakeWordRecognition && isWakeWordActive) wakeWordRecognition.stop();

  globalVoiceRecognition = new SpeechRecognition();
  globalVoiceRecognition.lang = 'ru-RU';
  globalVoiceRecognition.interimResults = false; 

  globalVoiceRecognition.onstart = () => { isGlobalVoiceActive = true; };

  globalVoiceRecognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript.trim();
    const commandLower = transcript.toLowerCase();
    closeGlobalVoiceAgent();
    
    // ЭНТЕРПРАЙЗ: Голосовое подтверждение деструктивных действий (Если открыта модалка)
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal && !confirmModal.classList.contains('hidden')) {
        if (commandLower.includes('да') || commandLower.includes('подтверждаю') || commandLower.includes('удаляй') || commandLower.includes('согласен')) {
            const confirmBtn = document.getElementById('confirmModalBtn');
            if (confirmBtn) confirmBtn.click();
            return showSystemToast('Голос', 'Действие подтверждено', 'mic', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/30');
        } else if (commandLower.includes('нет') || commandLower.includes('отмена') || commandLower.includes('стоп')) {
            closeConfirmModal();
            return showSystemToast('Голос', 'Действие отменено', 'mic-off', 'text-gray-500', 'bg-gray-50 dark:bg-gray-800');
        }
    }

    if (transcript) {
      // Открываем шторку AI для демонстрации процесса работы агента
      const aiSidebar = document.getElementById('aiSidebar');
      if (aiSidebar && aiSidebar.classList.contains('translate-x-full')) toggleAiSidebar();
      
      const input = document.getElementById('aiChatInput');
      if (input) input.value = transcript;
      
      showSystemToast('Анализ...', `В работе: "${transcript}"`, 'sparkles', 'text-indigo-500', 'bg-indigo-50 dark:bg-indigo-900/30');
      await sendAiMessage();
    }
  };

  globalVoiceRecognition.onerror = () => closeGlobalVoiceAgent();
  globalVoiceRecognition.onend = () => closeGlobalVoiceAgent();

  try { globalVoiceRecognition.start(); } catch (e) {}
}

function closeGlobalVoiceAgent() {
  if (!isGlobalVoiceActive) return;
  isGlobalVoiceActive = false;
  if (globalVoiceRecognition) globalVoiceRecognition.stop();
  
  const overlay = document.getElementById('globalVoiceOverlay');
  if (overlay) {
      overlay.classList.add('opacity-0');
      setTimeout(() => overlay.classList.add('hidden'), 300);
  }

  // Перезапускаем фоновое прослушивание, если оно было активно
  if (wakeWordRecognition && isWakeWordActive) {
    try { wakeWordRecognition.start(); } catch(e){}
  }
}

function toggleWakeWord() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return showSystemToast('Ошибка', 'Ваш браузер не поддерживает фоновое распознавание.', 'mic-off', 'text-red-500', 'bg-red-50');

  const toggleBtn = document.getElementById('wakeWordToggleBtn');

  if (isWakeWordActive) {
      isWakeWordActive = false;
      if (wakeWordRecognition) wakeWordRecognition.stop();
      showSystemToast('Окей Блоко', 'Фоновый ассистент отключен.', 'mic-off', 'text-gray-500', 'bg-gray-50 dark:bg-gray-900/30');
      toggleBtn.classList.remove('text-indigo-600', 'bg-indigo-100', 'border-indigo-300', 'dark:text-indigo-400', 'dark:bg-indigo-900/50', 'dark:border-indigo-700');
      toggleBtn.classList.add('text-gray-500', 'border-transparent');
      return;
  }

  isWakeWordActive = true;
  toggleBtn.classList.remove('text-gray-500', 'border-transparent');
  toggleBtn.classList.add('text-indigo-600', 'bg-indigo-100', 'border-indigo-300', 'dark:text-indigo-400', 'dark:bg-indigo-900/50', 'dark:border-indigo-700');
  showSystemToast('Blocko AI', 'Скажите "Окей Блоко" или нажмите ENTER на пустом экране.', 'mic', 'text-indigo-500', 'bg-indigo-50 dark:bg-indigo-900/30');

  wakeWordRecognition = new SpeechRecognition();
  wakeWordRecognition.lang = 'ru-RU';
  wakeWordRecognition.continuous = true; 
  wakeWordRecognition.interimResults = false;

  wakeWordRecognition.onresult = (event) => {
      const last = event.results.length - 1;
      const command = event.results[last][0].transcript.trim().toLowerCase();
      
      if (command.includes('окей блоко') || command.includes('окей блок') || command.includes('ок блок') || command.includes('окей блэк')) {
          wakeWordRecognition.stop();
          // ЭНТЕРПРАЙЗ: Запускаем полноэкранного агента вместо открытия шторки
          activateGlobalVoiceAgent();
      }
  };

  wakeWordRecognition.onend = () => {
      if (isWakeWordActive && !isAiListening && !isGlobalVoiceActive) {
          try { wakeWordRecognition.start(); } catch(e){}
      }
  };

  try { wakeWordRecognition.start(); } catch(e){}
}

function toggleAiVoiceInput() {
  const micBtn = document.getElementById('aiMicBtn');
  const input = document.getElementById('aiChatInput');
  
  if (isAiListening && aiSpeechRecognition) {
    aiSpeechRecognition.stop();
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return showSystemToast('Ошибка', 'Голосовой ввод не поддерживается вашим браузером.', 'mic-off', 'text-red-500', 'bg-red-50');
  }
  
  aiSpeechRecognition = new SpeechRecognition();
  aiSpeechRecognition.lang = 'ru-RU';
  aiSpeechRecognition.interimResults = true;
  
  const initialText = input.value ? input.value + ' ' : '';
  
  aiSpeechRecognition.onstart = () => {
    isAiListening = true;
    if (wakeWordRecognition && isWakeWordActive) wakeWordRecognition.stop(); // Глушим фоновый сканер во избежание конфликтов портов
    
    micBtn.classList.remove('text-gray-500', 'bg-gray-100', 'dark:bg-gray-800');
    micBtn.classList.add('text-red-500', 'bg-red-100', 'dark:bg-red-900/40', 'animate-pulse');
  };
  
  aiSpeechRecognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    input.value = initialText + transcript;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  };
  
  aiSpeechRecognition.onend = () => {
    isAiListening = false;
    micBtn.classList.add('text-gray-500', 'bg-gray-100', 'dark:bg-gray-800');
    micBtn.classList.remove('text-red-500', 'bg-red-100', 'dark:bg-red-900/40', 'animate-pulse');
    
    // Поднимаем фонового сканера обратно
    if (wakeWordRecognition && isWakeWordActive) {
        try { wakeWordRecognition.start(); } catch(e){} 
    }
  };
  
  try { aiSpeechRecognition.start(); } catch (e) { console.error(e); }
}

async function generateAIQuickDescription() {
  if (!navigator.onLine) return showSystemToast('Офлайн', 'AI-ассистент недоступен без интернета.', 'wifi-off', 'text-amber-500', 'bg-amber-50');
  if (!(await checkAILimit())) return;
  
  const title = document.getElementById('quickAddInput').value.trim(); 
  const textarea = document.getElementById('quickAddDesc'); 
  const btn = document.getElementById('aiQuickGenBtn');
  
  if (!title) return showSystemToast('Ошибка', 'Введите заголовок.', 'alert-circle', 'text-red-500', 'bg-red-50');
  
  const ogBtn = btn.innerHTML; 
  btn.disabled = true; 
  btn.innerHTML = '<i data-lucide="loader-2" class="w-2.5 h-2.5 animate-spin"></i>'; 
  lucide.createIcons();
  
  try {
    // Используем AI_ENDPOINT из config.js
    const response = await fetch(`${AI_ENDPOINT}${encodeURIComponent(`Краткий план (3 пункта): "${title}"`)}?model=openai`);
    textarea.value = await response.text();
  } catch (err) { 
    showSystemToast('Ошибка AI', 'Не удалось создать задачу через AI.', 'alert-triangle', 'text-red-500', 'bg-red-50');
  } finally { 
    btn.disabled = false; 
    btn.innerHTML = ogBtn; 
    lucide.createIcons(); 
  }
}

function toggleChat() { 
  if (window.event) window.event.stopPropagation();
  closeOtherSidebars('chatSidebar'); 
  const sidebar = document.getElementById('chatSidebar');
  sidebar.classList.toggle('translate-x-full'); 
  
  if (!sidebar.classList.contains('translate-x-full')) {
    const badge = document.getElementById('chatBadge');
    if(badge) {
        badge.classList.add('hidden');
        badge.innerText = '0';
    }
    const chatBox = document.getElementById("chatMessages");
    setTimeout(() => chatBox.scrollTop = chatBox.scrollHeight, 50);
  }
}

// Закрытие модалок по клику на фон и умное скрытие боковых панелей
window.addEventListener('click', (e) => {
  // КРИТИЧЕСКИЙ ФИКС: Игнорируем клики по элементам, которые были удалены из DOM (например, при замене иконок Lucide)
  if (!document.body.contains(e.target)) return;

  // ЭНТЕРПРАЙЗ: Закрытие дропдауна приглашений при клике вне его области
  if (!e.target.closest('#shareMenuWrapper')) {
    const shareMenu = document.getElementById('shareMenuDropdown');
    if (shareMenu && !shareMenu.classList.contains('hidden')) {
      shareMenu.classList.add('hidden');
    }
  }

  // ЭНТЕРПРАЙЗ: Закрытие выпадающего меню фильтра тегов (Desktop & Mobile)
  if (!e.target.closest('#tagFilterWrapper')) {
    const tagMenu = document.getElementById('tagFilterDropdown');
    if (tagMenu && !tagMenu.classList.contains('hidden')) {
      tagMenu.classList.add('hidden');
    }
  }
  
  if (!e.target.closest('#mobileTagFilterWrapper')) {
    const mobTagMenu = document.getElementById('mobileTagFilterDropdown');
    if (mobTagMenu && !mobTagMenu.classList.contains('hidden')) {
      mobTagMenu.classList.add('hidden');
    }
  }
  
  // Закрытие меню сортировок колонок
  if (!e.target.closest('.relative.group\\/sort') && !e.target.closest('button[title="Авто-сортировка задач"]')) {
      document.querySelectorAll('.col-sort-menu').forEach(m => m.classList.add('hidden'));
  }

  // 1. Обработка кликов по фону модальных окон
  if (e.target.id === 'viewCardModal') closeViewModal();
  if (e.target.id === 'editCardModal') closeEditModal();
  if (e.target.id === 'colModal') closeColModal();
  if (e.target.id === 'quickAddModal') closeQuickAdd();
  if (e.target.id === 'fileTypeModal') closeFileTypeModal();
  if (e.target.id === 'customConfirmModal') closeConfirmModal();
  if (e.target.id === 'customPromptModal') closePromptModal();
  if (e.target.id === 'voiceMemoModal') closeVoiceMemoModal();
  if (e.target.id === 'pollStatsModal') closePollStatsModal();

  // 2. ЭНТЕРПРАЙЗ UX: Автоматическое скрытие открытых шторок при клике в рабочую область
  const isSidebar = e.target.closest('aside');
  const isHeader = e.target.closest('header');
  const isMobileMenu = e.target.closest('#mobileMenuDropdown');
  const isModal = e.target.closest('.glass-modal');
  
  if (!isSidebar && !isHeader && !isMobileMenu && !isModal) {
    if (typeof closeOtherSidebars === 'function') {
      closeOtherSidebars('none');
    }
  }
});

let toastTimeout;
window.pendingUndoAction = null;

function showSystemToast(title, desc, iconName, iconColor, bgColor, withUndo = false) {
  const toast = document.getElementById('globalToast');
  
  document.getElementById('toastTitle').innerText = title;
  document.getElementById('toastDesc').innerText = desc;
  
  const iconEl = document.getElementById('toastIcon');
  iconEl.setAttribute('data-lucide', iconName);
  iconEl.className = `w-5 h-5 ${iconColor}`;
  
  document.getElementById('toastIconBg').className = `p-2.5 rounded-full flex-shrink-0 ${bgColor}`;
  
  const existingUndoBtn = document.getElementById('toastUndoBtn');
  if (existingUndoBtn) existingUndoBtn.remove();
  
  if (withUndo) {
     const undoBtn = document.createElement('button');
     undoBtn.id = 'toastUndoBtn';
     undoBtn.className = 'ml-3 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-blue-500 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl active:scale-95 transition-all self-center whitespace-nowrap border border-gray-200 dark:border-gray-700 shadow-sm flex items-center';
     undoBtn.innerHTML = '<i data-lucide="undo-2" class="w-3.5 h-3.5 mr-1"></i> Вернуть';
     undoBtn.onclick = () => {
        if (window.pendingUndoAction) {
           window.pendingUndoAction();
           toast.classList.add('translate-y-24', 'opacity-0');
           window.pendingUndoAction = null;
        }
     };
     toast.appendChild(undoBtn);
  }

  lucide.createIcons({ root: toast });

  // Показываем
  toast.classList.remove('translate-y-24', 'opacity-0');
  
  // Прячем через 5 секунд
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('translate-y-24', 'opacity-0');
    if (withUndo) window.pendingUndoAction = null;
  }, 5000);
}

// ЭНТЕРПРАЙЗ: Вызов функции отмены действия
function setUndoAction(actionCallback, msg) {
   window.pendingUndoAction = actionCallback;
   showSystemToast('Удалено', msg + ' (или Ctrl+Z)', 'trash-2', 'text-red-500', 'bg-red-50 dark:bg-red-900/30', true);
}

// 1. Закрытие окон на клавишу Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (typeof closeViewModal === 'function') closeViewModal();
    if (typeof closeEditModal === 'function') closeEditModal();
    if (typeof closeColModal === 'function') closeColModal();
    if (typeof closeQuickAdd === 'function') closeQuickAdd();
    if (typeof closeFileTypeModal === 'function') closeFileTypeModal();
    if (typeof closeConfirmModal === 'function') closeConfirmModal();
    if (typeof closeOtherSidebars === 'function') closeOtherSidebars('none');
    if (typeof closeVoiceMemoModal === 'function') closeVoiceMemoModal();
    if (typeof closePollStatsModal === 'function') closePollStatsModal();
  }
});

// моб меню
function toggleMobileMenu() { document.getElementById('mobileMenuDropdown').classList.toggle('hidden'); }

// --- ЛОГИКА КАСТОМНЫХ ПОДТВЕРЖДЕНИЙ ---
let confirmCallback = null;

function openConfirmModal(title, desc, confirmText, isDanger, callback) {
  document.getElementById('confirmTitle').innerText = title;
  document.getElementById('confirmDesc').innerText = desc;
  
  const iconBg = document.getElementById('confirmIconBg');
  const icon = document.getElementById('confirmIcon');
  const btn = document.getElementById('confirmBtnAction');
  
  if (isDanger) {
    iconBg.className = "mx-auto w-16 h-16 bg-red-50 dark:bg-red-900/30 text-red-500 rounded-2xl flex items-center justify-center mb-5 shadow-sm";
    icon.setAttribute('data-lucide', 'trash-2');
    btn.className = "flex-1 py-3.5 text-sm font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-lg shadow-red-500/25 active:scale-95 transition-all";
  } else {
    iconBg.className = "mx-auto w-16 h-16 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-2xl flex items-center justify-center mb-5 shadow-sm";
    icon.setAttribute('data-lucide', 'alert-circle');
    btn.className = "flex-1 py-3.5 text-sm font-bold text-white bg-amber-500 hover:bg-amber-400 rounded-xl shadow-lg shadow-amber-500/25 active:scale-95 transition-all";
  }
  btn.innerText = confirmText;
  lucide.createIcons();
  confirmCallback = callback;
  
  const modal = document.getElementById('customConfirmModal');
  const content = document.getElementById('confirmModalContent');
  modal.classList.remove('hidden');
  setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); content.classList.add('scale-100'); }, 10);
}

function closeConfirmModal() {
  const modal = document.getElementById('customConfirmModal');
  const content = document.getElementById('confirmModalContent');
  modal.classList.add('opacity-0');
  content.classList.remove('scale-100'); content.classList.add('scale-95');
  setTimeout(() => { modal.classList.add('hidden'); confirmCallback = null; }, 300);
}

function executeConfirm() {
  if (confirmCallback) confirmCallback();
  closeConfirmModal();
}

// --- ЛОГИКА ЭПИЧНЫХ КОНФЕТТИ ---
function fireConfetti() {
  confetti({
    particleCount: 150,
    spread: 100,
    origin: { y: 0 }, // Выстрел сверху экрана
    zIndex: 9999, // Поверх всех модалок
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6']
  });
}

// --- СЛУЧАЙНЫЙ ФОН ---
async function setRandomBackground() {
  const statusEl = document.getElementById('bgUploadStatus');
  statusEl.innerText = 'Ищем красоту... ✨';
  try {
    // Берем красивую картинку с размытием
    const randomUrl = `https://picsum.photos/1920/1080?random=${Date.now()}&blur=2`;
    updateBoardData({ background: randomUrl });
    statusEl.innerText = 'Обои обновлены!';
    setTimeout(() => statusEl.innerText = '', 3000);
  } catch(e) {
    statusEl.innerText = 'Ошибка загрузки';
  }
}

// Система проверки дедлайнов
function checkDeadlines(columns) {
  const now = new Date().getTime();
  const dayInMs = 24 * 60 * 60 * 1000;
  let notifiedTasks = JSON.parse(sessionStorage.getItem('notified_tasks') || '[]');

  columns.forEach(col => {
    col.cards.forEach(card => {
      if (card.dueDate) {
        const deadline = new Date(card.dueDate).getTime();
        const diff = deadline - now;

        if (diff > 0 && diff <= dayInMs && !notifiedTasks.includes(card.id)) {
          // Отправляем уведомление
          sendPushNotification(`Дедлайн близко!`, `Задача "${card.title}" истекает менее чем через 24 часа.`);
          notifiedTasks.push(card.id);
          showSystemToast('Внимание', `Срок задачи "${card.title}" почти истек!`, 'clock', 'text-rose-500', 'bg-rose-50');
        }
      }
    });
  });
  sessionStorage.setItem('notified_tasks', JSON.stringify(notifiedTasks));
}

function sendPushNotification(title, body) {
  if (!("Notification" in window)) return;
  
  if (Notification.permission === "granted") {
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification(title, {
        body: body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%233b82f6" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black"><circle cx="12" cy="12" r="10"/></svg>'
      });
    });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission();
  }
}
