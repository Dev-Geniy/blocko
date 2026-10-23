// ==========================================
// Blocko Pro · главная — billing.js
// Тарифы, пополнение PayPal, промокоды, создание досок
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. index.html.
// ==========================================

// --- ЛОГИКА ТАРИФОВ И ЛИМИТОВ ---
// Читаем тариф из памяти или ставим Free
let userPlan = localStorage.getItem('blocko_user_plan') || 'free'; 

// --- ФРОНТЕНД БИЛЛИНГ И ПАРТНЕРСКИЕ НАЧИСЛЕНИЯ (MVP БЕЗ СЕРВЕРА) ---
async function upgradeTo(planId) {
  if (!currentUser) {
    closePricingModal();
    return showSystemToast('Ошибка', 'Войдите в систему.', 'lock', 'text-red-500', 'bg-red-50');
  }

  // Переход на Free — просто понижение тарифа
  if (planId === 'free') {
    openConfirmModal('Перейти на Free?', 'Платные возможности будут отключены.', 'Перейти', true, async () => {
      try {
        await db.collection('users').doc(currentUser.id).update({ plan: 'free', planExpiresAt: firebase.firestore.FieldValue.delete() });
        userPlan = 'free';
        localStorage.setItem('blocko_user_plan', 'free');
        closePricingModal();
        renderBoardsGrid();
      } catch (e) {
        showSystemToast('Сбой', 'Не удалось сменить тариф.', 'alert-circle', 'text-red-500', 'bg-red-50');
      }
    });
    return;
  }

  // Цены для подтверждения (списывает и проверяет сервер)
  const prices = { 'freelancer': 600, 'pro': 1900 };
  const requiredCoins = prices[planId];
  if (!requiredCoins) return;

  openConfirmModal('Подтверждение оплаты', `С вашего баланса будет списано ${requiredCoins} B-Coins. Вы уверены?`, 'Оплатить', false, async () => {
    try {
      const res = await BlockoAPI.call('purchasePlan', { planId });
      userPlan = res.plan;
      localStorage.setItem('blocko_user_plan', res.plan);
      closePricingModal();
      if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, zIndex: 9999 });
      const until = res.planExpiresAt ? ` до ${new Date(res.planExpiresAt).toLocaleDateString('ru-RU')}` : '';
      showSystemToast('Поздравляем! 🎉', `Тариф ${res.plan.toUpperCase()} активирован${until}`, 'shield-check', 'text-green-500', 'bg-green-50');
      renderBoardsGrid();
    } catch (error) {
      if (BlockoAPI.errorMessage(error) === 'not_enough_coins') {
        closePricingModal();
        openTopUpModal();
        return showSystemToast('Недостаточно монет', 'Пополните баланс, чтобы активировать тариф.', 'coins', 'text-amber-500', 'bg-amber-50');
      }
      console.error("Ошибка активации:", error);
      showSystemToast('Сбой', 'Не удалось провести оплату.', 'alert-circle', 'text-red-500', 'bg-red-50');
    }
  });
}

// --- ЛОГИКА ПОПОЛНЕНИЯ (РЕАЛЬНАЯ ОПЛАТА PAYPAL) ---
  function openTopUpModal() {
    const el = document.getElementById('topUpModal');
    backToPacks(); // Сбрасываем вид на выбор пакетов при открытии
    el.classList.remove('hidden');
    setTimeout(() => el.classList.remove('opacity-0'), 10);
  }

  function closeTopUpModal() {
    const el = document.getElementById('topUpModal');
    el.classList.add('opacity-0');
    setTimeout(() => { 
        el.classList.add('hidden'); 
        backToPacks();
    }, 300);
  }

  function backToPacks() {
     document.getElementById('packsContainer').classList.remove('hidden');
     document.getElementById('paypalPaymentContainer').classList.add('hidden');
     document.getElementById('paypalPaymentContainer').classList.remove('flex');
     document.getElementById('paypal-button-container').innerHTML = ''; // Очищаем старые кнопки
  }

  function preparePayPalPayment(amountCoins, usdPrice, itemName) {
     const packId = ({ 1000: 'starter', 5000: 'popular', 12000: 'max' })[amountCoins];
     if (!packId) return showSystemToast('Ошибка', 'Неизвестный пакет монет.', 'x-circle', 'text-red-500', 'bg-red-50');
     document.getElementById('packsContainer').classList.add('hidden');
     document.getElementById('paypalPaymentContainer').classList.remove('hidden');
     document.getElementById('paypalPaymentContainer').classList.add('flex');
     
     document.getElementById('checkoutTotal').innerText = `$${usdPrice.toFixed(2)}`;
     document.getElementById('checkoutItemName').innerText = `${itemName} (${amountCoins} Монет)`;

     const container = document.getElementById('paypal-button-container');
     container.innerHTML = '<div class="absolute inset-0 flex items-center justify-center"><i data-lucide="loader-2" class="w-8 h-8 animate-spin text-blue-500"></i></div>';
     lucide.createIcons({ root: container });

     if (typeof paypal === 'undefined') {
         container.innerHTML = '<div class="text-sm text-red-500 font-bold p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">Ошибка: скрипт PayPal не загружен. Проверьте интернет или блокировщики рекламы.</div>';
         return;
     }

     setTimeout(() => {
         container.innerHTML = ''; // Убираем лоадер
         
         // Инициализация Smart Buttons
         paypal.Buttons({
            style: {
                color:  'gold',
                shape:  'rect',
                label:  'paypal',
                height: 45
            },
            // Заказ создаёт сервер: сумма берётся из серверного каталога, а не из браузера
            createOrder: async function() {
              const res = await BlockoAPI.call('createPaypalOrder', { packId });
              return res.orderId;
            },
            // Оплату захватывает и зачисляет монеты тоже сервер (с проверкой суммы в PayPal)
            onApprove: async function(data) {
              container.innerHTML = '<div class="p-6 text-center bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800"><i data-lucide="loader-2" class="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-3"></i><p class="text-sm font-bold text-emerald-700 dark:text-emerald-300">Подтверждаем оплату...</p></div>';
              lucide.createIcons({ root: container });
              try {
                const res = await BlockoAPI.call('capturePaypalOrder', { orderId: data.orderID });
                closeTopUpModal();
                if (typeof confetti === 'function') confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 }, zIndex: 9999 });
                showSystemToast('Оплата прошла успешно!', `Вам начислено ${res.coins} B-Coins. Открываем окно тарифов...`, 'check-circle', 'text-emerald-500', 'bg-emerald-50 dark:bg-emerald-900/30');
                setTimeout(() => openPricingModal(), 2000);
              } catch (e) {
                console.error('capturePaypalOrder', e);
                showSystemToast('Сбой зачисления', 'Не удалось подтвердить оплату. Если деньги списались, напишите в поддержку и укажите номер заказа: ' + data.orderID, 'alert-triangle', 'text-red-500', 'bg-red-50 dark:bg-red-900/30');
              }
            },
            onCancel: function (data) {
              showSystemToast('Отменено', 'Вы закрыли окно оплаты.', 'info', 'text-gray-500', 'bg-gray-50 dark:bg-gray-900/30');
            },
            onError: function (err) {
              showSystemToast('Ошибка PayPal', 'Не удалось инициализировать платеж.', 'x-circle', 'text-red-500', 'bg-red-50 dark:bg-red-900/30');
            }
         }).render('#paypal-button-container');
     }, 300);
  }

async function activatePromoCode(inputId = 'promoCodeInput', btnId = 'activatePromoBtn') {
  if (!currentUser) return showSystemToast('Ошибка', 'Авторизуйтесь для активации.', 'lock', 'text-amber-500', 'bg-amber-50');
  
  const input = document.getElementById(inputId);
  const code = input.value.trim().toUpperCase();
  const btn = document.getElementById(btnId);
  
  if (!code) return;
  
  const ogBtn = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>';
  lucide.createIcons({ root: btn.parentElement });

  try {
     const reward = await BlockoAPI.call('redeemPromo', { code });
     let successMsg = 'Промокод применён.';
     if (reward.type === 'plan') {
         userPlan = reward.plan;
         localStorage.setItem('blocko_user_plan', reward.plan);
         successMsg = `Активирован тариф ${reward.plan.toUpperCase()}`;
     } else if (reward.type === 'coins') {
         successMsg = `Начислено ${reward.coins} B-Coins!`;
     } else if (reward.type === 'discount') {
         successMsg = `Получена скидка ${reward.discount}% на следующую покупку!`;
     }

     if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, zIndex: 9999 });
     showSystemToast('Промокод активирован!', successMsg, 'ticket', 'text-amber-500', 'bg-amber-50 dark:bg-amber-900/30');
     input.value = '';
     
     // Обновляем UI
     if (typeof loadAffiliateStats === 'function') loadAffiliateStats();
     setTimeout(() => {
         if (typeof closeTopUpModal === 'function') closeTopUpModal();
         if (typeof closePricingModal === 'function') closePricingModal();
     }, 1500);

  } catch (err) {
     let errMsg = 'Не удалось активировать промокод.';
     if (err.message === 'not_found') errMsg = 'Такой промокод не существует.';
     else if (err.message === 'expired') errMsg = 'Срок действия промокода истек.';
     else if (err.message === 'limit') errMsg = 'Лимит активаций этого промокода исчерпан.';
     else if (err.message === 'already_used') errMsg = 'Вы уже активировали этот промокод ранее.';
     
     showSystemToast('Ошибка активации', errMsg, 'x-circle', 'text-red-500', 'bg-red-50 dark:bg-red-900/30');
  } finally {
     btn.disabled = false;
     btn.innerHTML = ogBtn;
     lucide.createIcons({ root: btn.parentElement });
  }
}

// Открытие модалки тарифов
function openPricingModal() {
  const modal = document.getElementById('pricingModal');
  const content = document.getElementById('pricingContent');
  if (!modal) return;
  
  // ЭНТЕРПРАЙЗ: Итерируем ТОЛЬКО по видимым тарифам
  const plans = ['free', 'freelancer', 'pro'];
  
  plans.forEach(p => {
    const card = document.getElementById('planCard_' + p);
    const btn = document.getElementById('btnUpgrade_' + p);
    const badge = document.getElementById('planBadge_' + p);
    
    if (card && btn && badge) {
      if (p === userPlan) {
        // Активный тариф: синяя рамка, scale-105, кнопка заблокирована
        card.className = "group bg-white dark:bg-gray-900 border-2 border-blue-500 p-10 rounded-[2.5rem] flex flex-col shadow-2xl shadow-blue-500/10 scale-105 z-10 relative overflow-hidden transition-all duration-500 hover:shadow-blue-500/20";
        badge.classList.remove('hidden');
        
        btn.innerText = "Ваш тариф";
        btn.className = "w-full py-3.5 bg-gray-100 dark:bg-gray-800 text-gray-400 font-bold rounded-2xl cursor-default transition-colors";
        btn.onclick = null;
      } else {
        // Неактивный тариф: обычная рамка, стандартный hover
        card.className = "group bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-10 rounded-[2.5rem] flex flex-col hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500 relative overflow-hidden hover:-translate-y-1";
        badge.classList.add('hidden');
        
        btn.innerText = "Активировать план";
        btn.className = p === 'freelancer' 
          ? "w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
          : "w-full py-3.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl";
        btn.onclick = () => upgradeTo(p);
      }
    }
  });

  // ЭНТЕРПРАЙЗ: Управление баннером Infinity
  const infinityBanner = document.getElementById('infinityBannerWrapper');
  if (userPlan === 'infinity') {
      // Блокируем кнопки других тарифов
      plans.forEach(p => {
          const btn = document.getElementById('btnUpgrade_' + p);
          if (btn) {
              btn.innerText = "Заблокировано (GOD MODE)";
              btn.className = "w-full py-3.5 bg-gray-100 dark:bg-gray-800 text-gray-500 font-bold rounded-2xl cursor-not-allowed transition-colors";
              btn.onclick = null;
          }
      });
      if (infinityBanner) {
          infinityBanner.classList.remove('hidden');
          infinityBanner.classList.add('flex');
      }
  } else {
      if (infinityBanner) {
          infinityBanner.classList.add('hidden');
          infinityBanner.classList.remove('flex');
      }
  }

  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
    content.classList.add('scale-100');
  }, 10);
  lucide.createIcons();
}

// Закрытие модалки тарифов
function closePricingModal() {
  const modal = document.getElementById('pricingModal');
  const content = document.getElementById('pricingContent');
  if (!modal) return;
  modal.classList.add('opacity-0');
  content.classList.remove('scale-100');
  content.classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 300);
}

// ОБНОВЛЕННАЯ ФУНКЦИЯ СОЗДАНИЯ (с проверкой лимитов)
async function confirmCreateBoard() {
  const title = document.getElementById('newBoardTitle').value.trim() || "Новый проект";
  const company = document.getElementById('newBoardCompany').value.trim() || null;
  const password = document.getElementById('newBoardPassword').value.trim() || null;
  const type = document.querySelector('input[name="boardType"]:checked').value;
  
  if (!currentUser) return;

  // ЭНТЕРПРАЙЗ МИКРО-UX: Блокируем кнопку на время загрузки
  const submitBtn = document.querySelector('#createBoardModal button.w-full.bg-blue-600');
  const originalBtnHTML = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Создаем...';
    lucide.createIcons({ root: submitBtn.parentNode });
  }

  if (type === 'online') {
    const ownedOnlineCount = onlineBoards.filter(b => b.owner === currentUser.id).length;
    
    // КРИТИЧЕСКИЙ ФИКС БИЛЛИНГА: Безопасный поиск тарифа
    const planLimits = getPlanLimits(userPlan); 
    
    // ЭНТЕРПРАЙЗ: Полный безлимит для Infinity и Pro (God Mode)
    const isUnlimited = userPlan === 'infinity' || userPlan === 'pro';
    
    if (!isUnlimited && ownedOnlineCount >= planLimits.boardsLimit) {
      if (submitBtn) {
        submitBtn.disabled = false; 
        submitBtn.innerHTML = originalBtnHTML; 
        lucide.createIcons({ root: submitBtn.parentNode }); 
      }
      closeCreateModal();
      openPricingModal();
      showSystemToast('Лимит достигнут', `На вашем тарифе доступно до ${planLimits.boardsLimit} облачных проектов.`, 'lock', 'text-amber-500', 'bg-amber-50 dark:bg-amber-900/30');
      return;
    }
  }

  const newBoard = {
    title, 
    company,  // ЭНТЕРПРАЙЗ: Сохраняем компанию
    owner: currentUser.id, 
    members: [currentUser.id],
    // ЭНТЕРПРАЙЗ: Сохраняем все премиальные настройки создателя для отображения на доске
    users: { [currentUser.id]: { 
      name: currentUser.name, 
      avatar: currentUser.avatar, 
      role: 'owner',
      customAvatar: currentUser.customAvatar || null,
      badgeStatus: currentUser.badgeStatus || null,
      badgeConfig: currentUser.badgeConfig || null
    } },
    columns: [
      { id: Date.now(), name: "Бэклог", color: 'default', cards: [] },
      { id: Date.now()+1, name: "В работе", color: 'blue', cards: [] },
      { id: Date.now()+2, name: "Готово", color: 'green', cards: [] }
    ],
    createdAt: type === 'local' ? Date.now() : firebase.firestore.FieldValue.serverTimestamp()
  };

  if (type === 'local') {
    newBoard.id = 'local_' + Date.now();
    if (password) newBoard.password = password; // локально — только на этом устройстве
    const localBoards = getLocalBoards();
    localBoards[newBoard.id] = newBoard;
    localStorage.setItem('blocko_local_boards', JSON.stringify(localBoards));
    // Сохраняем в сессию, чтобы сразу войти без повторного ввода пароля
    if(password) sessionStorage.setItem('blocko_auth_' + newBoard.id, password);
    window.location.href = `board.html?b=${newBoard.id}`;
  } else {
    try {
      const docRef = await db.collection("boards").add(newBoard);
      // Пароль облачной доски хранится на сервере в виде хэша
      if (password) await BlockoAPI.call('setBoardPassword', { boardId: docRef.id, password });
      window.location.href = `board.html?b=${docRef.id}`;
    } catch (e) { 
      if (submitBtn) { 
        submitBtn.disabled = false; 
        submitBtn.innerHTML = originalBtnHTML; 
        lucide.createIcons({ root: submitBtn.parentNode }); 
      }
      showSystemToast('Ошибка', 'Не удалось создать проект в облаке.', 'alert-circle', 'text-red-500', 'bg-red-50 dark:bg-red-900/30');
    }
  }
}
