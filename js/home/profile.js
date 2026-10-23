// ==========================================
// Blocko Pro · главная — profile.js
// Рендер аватара, награды, статистика партнёрки, профиль
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. index.html.
// ==========================================

// ЭНТЕРПРАЙЗ: Усовершенствованный рендер аватара (с поддержкой ID и OnClick для шапки)
function renderUserAvatar(userConfig, sizeClass = "w-11 h-11", idAttr = '', onclickAttr = '') {
  userConfig = userConfig || {};
  const rawConfig = userConfig.badgeConfig || {};
  const config = { frameColor: safeColor(rawConfig.frameColor), glowColor: safeColor(rawConfig.glowColor), animation: rawConfig.animation || 'none' };
  const avatarUrl = esc(safeUrl(userConfig.customAvatar) || safeUrl(userConfig.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(userConfig.name || 'User')}`);
  const safeName = esc(userConfig.name || '');
  const badge = userConfig.badgeStatus || userConfig.badge || 'none'; 
  
  let animationClass = "";
  if (config.animation === 'pulse') animationClass = "animate-pulse";
  if (config.animation === 'rainbow') animationClass = "animate-[spin_4s_linear_infinite] filter hue-rotate-180"; 
  if (config.animation === 'flicker') animationClass = "animate-bounce"; 
  
  let badgeIconHtml = '';
  // Распределяем иконки геймификации для профиля и карточек
  if (badge === 'ambassador') {
    badgeIconHtml = `<div class="absolute -top-1.5 -right-1.5 bg-white dark:bg-gray-900 rounded-full p-0.5 transform rotate-12 shadow border border-gray-200 dark:border-gray-700 z-10"><i data-lucide="crown" class="w-3.5 h-3.5 text-amber-500 fill-current"></i></div>`;
  } else if (badge === 'partner') {
    badgeIconHtml = `<div class="absolute -bottom-1 -right-1.5 bg-white dark:bg-gray-900 rounded-full p-0.5 shadow border border-gray-200 dark:border-gray-700 z-10"><i data-lucide="award" class="w-3 h-3 text-amber-500 fill-current"></i></div>`;
  } else if (badge === 'friend') {
    badgeIconHtml = `<div class="absolute -bottom-1 -right-1.5 bg-white dark:bg-gray-900 rounded-full p-0.5 shadow border border-gray-200 dark:border-gray-700 z-10"><i data-lucide="shield-check" class="w-3 h-3 text-blue-500 fill-current"></i></div>`;
  }

  // ЭНТЕРПРАЙЗ ИЗОЛЯЦИЯ: Выделяем эффекты наведения и фиксируем слои
  const hasHoverEffects = sizeClass.includes('hover:scale-110');
  const cleanSizeClass = sizeClass.replace('hover:z-10', '').replace('transition-transform', '').replace('hover:scale-110', '').trim();
  const wrapperEffects = hasHoverEffects ? 'hover:z-20 transition-transform hover:scale-110' : '';

  const idString = idAttr ? `id="${esc(idAttr)}"` : '';
  const clickString = onclickAttr 
    ? `onclick="${onclickAttr}" class="cursor-pointer relative inline-block flex-shrink-0 isolate ${wrapperEffects}"` 
    : `class="relative inline-block flex-shrink-0 isolate ${wrapperEffects}"`;

  if (config.frameColor === 'transparent' || !config.frameColor) {
     return `<div ${idString} ${clickString}><img src="${avatarUrl}" class="${cleanSizeClass} rounded-full object-cover border border-gray-200 dark:border-gray-700 shadow-sm ${animationClass}" title="${safeName}" alt="" referrerpolicy="no-referrer" />${badgeIconHtml}</div>`;
  }

  // Создаем контейнер с рамкой, свечением и иконкой статуса
  return `
    <div ${idString} ${clickString}>
      <div class="relative ${cleanSizeClass} rounded-full transition-all duration-500" 
           style="padding: 3px; background: ${config.frameColor}; box-shadow: 0 0 15px ${config.glowColor};">
        <img src="${avatarUrl}" class="w-full h-full rounded-full object-cover border-2 border-white dark:border-gray-950 ${animationClass}" title="${safeName}" alt="" referrerpolicy="no-referrer" />
        ${config.animation === 'rainbow' ? '<div class="absolute inset-0 rounded-full border-2 border-white/20 animate-spin"></div>' : ''}
      </div>
      ${badgeIconHtml}
    </div>
  `;
}

async function claimReward(tier) {
  if (!currentUser) return;
  try {
    const res = await BlockoAPI.call('claimReferralReward', { tier });
    userPlan = res.plan;
    localStorage.setItem('blocko_user_plan', res.plan);
    currentUser.badgeStatus = tier;
    if (typeof confetti === 'function') confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
    showSystemToast('Бонус активирован!', `Начислено ${res.days} дней тарифа ${res.plan.toUpperCase()} и разблокирован новый бейдж!`, 'zap', 'text-amber-500', 'bg-amber-50');
    loadAffiliateStats();
  } catch (e) {
    console.error(e);
    showSystemToast('Не получилось', BlockoAPI.errorMessage(e) || 'Попробуйте позже.', 'info', 'text-blue-500', 'bg-blue-50');
  }
}

// Обновление функции статистики в модалке
async function loadAffiliateStats() {
  if (!currentUser) return;
  const affDoc = await db.collection('affiliates').doc(currentUser.id).get();
  const userDoc = await db.collection('users').doc(currentUser.id).get();
  
  const affData = affDoc.exists ? affDoc.data() : { signups: 0, paidSignups: 0, earnedCredits: 0 };
  const userData = userDoc.data();
  
  document.getElementById('statSignups').innerText = affData.signups || 0;
  document.getElementById('statEarned').innerText = (affData.earnedCredits || 0) + ' кр.';

  // Проверка условий и показ кнопок активации
  const checkTier = (id, req, tierKey) => {
    const isReached = affData.signups >= req;
    const isClaimed = userData.rewardsClaimed?.includes(tierKey);
    const badge = document.getElementById('badge' + id);
    const btn = document.getElementById('btn_activate_' + tierKey);
    const rewardText = document.getElementById('reward_text_' + tierKey);

    if (isReached) {
      badge.classList.remove('opacity-40', 'grayscale');
      if (!isClaimed) {
        btn.classList.remove('hidden');
        rewardText.classList.remove('hidden');
      } else {
        // ЭНТЕРПРАЙЗ: Премиальный дизайн статуса вместо обычного текста со смайликом[cite: 8]
        rewardText.innerHTML = `<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-lg shadow-sm"><i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Активировано</span>`;
        rewardText.classList.remove('hidden');
        lucide.createIcons();
      }
    }
  };
  checkTier('Friend', REWARDS.FRIEND.required, 'friend');
  checkTier('Partner', REWARDS.PARTNER.required, 'partner');
  
  // Особое условие для Амбассадора
  if (affData.signups >= 50 && (affData.paidSignups || 0) >= 10) {
     checkTier('Ambassador', 50, 'ambassador');
  }
}

async function openProfileSettings() {
  if (!currentUser) return;
  
  const modal = document.getElementById('profileModal');
  const content = document.getElementById('profileContent');
  
  try {
    const userDoc = await db.collection('users').doc(currentUser.id).get();
    const data = userDoc.exists ? userDoc.data() : {};
    const rewards = data.rewardsClaimed || [];

    // Обновляем баланс
    document.getElementById('profileCoinsVal').innerText = data.coins || 0;
    
    // ЭНТЕРПРАЙЗ: Расчет тарифа и оставшихся дней для прозрачности UI
    let planText = (data.plan || 'free').toUpperCase();
    if (data.planExpiresAt) {
      const daysLeft = Math.ceil((data.planExpiresAt - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0) planText += ` (${daysLeft} ДН.)`;
    }
    document.getElementById('profilePlanVal').innerText = planText;

    // 1. Смена аватара (уровень Friend+)
    if (rewards.length > 0) {
      document.getElementById('avatarUploadBlock').classList.remove('hidden');
      document.getElementById('customAvatarUrl').value = data.customAvatar || "";
      
      // Панель управления бейджами
      document.getElementById('badgeSettingsBlock').classList.remove('hidden');
      renderBadgeSelector(data.badgeStatus || 'none', rewards);
    } else {
      document.getElementById('avatarUploadBlock').classList.add('hidden');
      document.getElementById('badgeSettingsBlock').classList.add('hidden');
    }
    
    // 2. Рамки (уровень Partner+)
    if (rewards.includes('partner') || rewards.includes('ambassador')) {
      document.getElementById('frameSettingsBlock').classList.remove('hidden');
      renderFrameColors(data.badgeConfig?.glowColor);
    } else {
      document.getElementById('frameSettingsBlock').classList.add('hidden');
    }

    // 3. Анимации (уровень Ambassador)
        if (rewards.includes('ambassador')) {
          document.getElementById('animationSettingsBlock').classList.remove('hidden');
          document.getElementById('frameAnimationSelect').value = data.badgeConfig?.animation || 'none';
        } else {
          document.getElementById('animationSettingsBlock').classList.add('hidden');
        }

        // ЭНТЕРПРАЙЗ: Усовершенствованный RBAC Engine (Role-Based Access Control)
        // Определяем константу главного архитектора системы (тебя)
        const MASTER_OWNER_EMAIL = 'uajerryua@gmail.com'; 
        const userEmail = (data.email || auth.currentUser?.email || '').toLowerCase();
        
        let isSystemAdmin = false;
        let isSystemOwner = (userEmail === MASTER_OWNER_EMAIL);

        // 1. Проверка на главного владельца
        if (isSystemOwner) {
            isSystemAdmin = true;
        } else {
            // 2. Проверка дополнительных админов через защищенную коллекцию
            try {
                const sysDoc = await db.collection('system').doc('admins').get();
                if (sysDoc.exists) {
                    const adminList = sysDoc.data().emails || [];
                    if (adminList.map(e => e.toLowerCase()).includes(userEmail)) {
                        isSystemAdmin = true;
                    }
                }
            } catch(e) {
                console.warn("RBAC System: Access to system/admins restricted.");
            }
        }

        // Рендерим блок управления, если права подтверждены
        const adminBlock = document.getElementById('adminControlsBlock');
        const btnManageAdmins = document.getElementById('btnManageAdmins');

        if (isSystemAdmin) {
            adminBlock.classList.remove('hidden');
            // Кнопка "Доступ" (управление другими админами) видна только главному Владельцу
            if (isSystemOwner) {
                btnManageAdmins.classList.remove('hidden');
                btnManageAdmins.classList.add('flex');
            } else {
                btnManageAdmins.classList.add('hidden');
                btnManageAdmins.classList.remove('flex');
            }
        } else {
            adminBlock.classList.add('hidden');
        }

        updateProfilePreview(data);
        
        modal.classList.remove('hidden');
    setTimeout(() => { 
      modal.classList.remove('opacity-0'); 
      content.classList.remove('scale-95'); 
      content.classList.add('scale-100'); 
    }, 10);
    lucide.createIcons();
    
  } catch (e) {
    showSystemToast('Ошибка', 'Не удалось загрузить данные профиля.', 'alert-triangle', 'text-red-500', 'bg-red-50');
  }
}

// Оптимизированные и компактные бейджи-иконки
// ЭНТЕРПРАЙЗ: Сегментированный контрол бейджей (Apple-style Segmented Control)
function renderBadgeSelector(currentBadge, rewards) {
  const container = document.getElementById('badgeSelector');
  
  // Убраны индивидуальные рамки. Активный элемент выделяется заливкой (карточкой) и тенью
  let html = `<button onclick="setActiveBadge('none')" class="w-10 h-10 rounded-lg transition-all duration-300 flex items-center justify-center flex-shrink-0 ${currentBadge === 'none' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}" title="Скрыть бейдж"><i data-lucide="x" class="w-5 h-5"></i></button>`;
  
  if (rewards.includes('friend')) {
    html += `<button onclick="setActiveBadge('friend')" class="w-10 h-10 rounded-lg transition-all duration-300 flex items-center justify-center flex-shrink-0 ${currentBadge === 'friend' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-500' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}" title="Бейдж: Друг"><i data-lucide="shield-check" class="w-5 h-5"></i></button>`;
  }
  if (rewards.includes('partner')) {
    html += `<button onclick="setActiveBadge('partner')" class="w-10 h-10 rounded-lg transition-all duration-300 flex items-center justify-center flex-shrink-0 ${currentBadge === 'partner' ? 'bg-white dark:bg-gray-700 shadow-sm text-amber-500' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}" title="Бейдж: Партнер"><i data-lucide="award" class="w-5 h-5"></i></button>`;
  }
  if (rewards.includes('ambassador')) {
     html += `<button onclick="setActiveBadge('ambassador')" class="w-10 h-10 rounded-lg transition-all duration-300 flex items-center justify-center flex-shrink-0 ${currentBadge === 'ambassador' ? 'bg-white dark:bg-gray-700 shadow-sm text-amber-500' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}" title="Бейдж: Амбассадор"><i data-lucide="crown" class="w-5 h-5"></i></button>`;
  }
  container.innerHTML = html;
  lucide.createIcons({ root: container });
}

async function setActiveBadge(badge) {
  if (!currentUser) return;
  await db.collection('users').doc(currentUser.id).update({ badgeStatus: badge });
  
  // Отправляем изменения во все проекты пользователя
  await syncUserProfileToBoards({ badgeStatus: badge });
  
  const doc = await db.collection('users').doc(currentUser.id).get();
  currentUser.badgeStatus = badge; // Обновляем локально
  updateProfilePreview(doc.data());
  renderBadgeSelector(badge, doc.data().rewardsClaimed || []);
  
  // ЭНТЕРПРАЙЗ: Корректное обновление динамического компонента аватара
  const dashAvatarEl = document.getElementById('dashAvatar');
  if(dashAvatarEl) {
      dashAvatarEl.outerHTML = renderUserAvatar(doc.data(), 'w-11 h-11', 'dashAvatar', 'openProfileSettings()');
      lucide.createIcons();
  }
  
  showSystemToast('Сохранено', 'Отображаемый бейдж изменен везде!', 'check-circle', 'text-green-500', 'bg-green-50');
}
