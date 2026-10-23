// ==========================================
// Blocko Pro · главная — affiliates.js
// Партнёрская программа и список рефералов
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. index.html.
// ==========================================

// --- ЛОГИКА ПАРТНЕРСКОЙ ПРОГРАММЫ ---
function openAffiliateModal() {
  if (!currentUser) return showSystemToast('Авторизация', 'Войдите в систему, чтобы получить партнерскую ссылку.', 'lock', 'text-amber-500', 'bg-amber-50');
  
  const modal = document.getElementById('affiliateModal');
  const content = document.getElementById('affiliateContent');
  const linkInput = document.getElementById('affiliateLinkInput');
  
  // Генерируем ссылку: берем текущий домен и добавляем ref
  const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
  linkInput.value = `${baseUrl}?ref=${currentUser.id}`;
  
  // ЭНТЕРПРАЙЗ: Внедряем премиальный аватар пользователя в центр модалки
  const avatarWrap = document.getElementById('affiliateUserAvatarWrap');
  if (avatarWrap) {
    avatarWrap.innerHTML = `
      <div class="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 rounded-full"></div>
      <div class="relative z-10 flex items-center justify-center p-1.5 bg-white dark:bg-gray-800 rounded-full border border-gray-100 dark:border-gray-700 shadow-xl">
        ${renderUserAvatar(currentUser, 'w-32 h-32')}
      </div>
    `;
  }
  
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
    content.classList.add('scale-100');
  }, 10);
  
  loadAffiliateStats();
  loadReferralsList(); // Загружаем список партнеров сразу
  lucide.createIcons();
}

function closeAffiliateModal() {
  const modal = document.getElementById('affiliateModal');
  const content = document.getElementById('affiliateContent');
  modal.classList.add('opacity-0');
  content.classList.remove('scale-100');
  content.classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 300);
}

function copyAffiliateLink() {
  const linkInput = document.getElementById('affiliateLinkInput');
  navigator.clipboard.writeText(linkInput.value);
  showSystemToast('Ссылка скопирована!', 'Поделитесь ей в сети и получайте 20% от оплат ваших рефералов.', 'copy', 'text-indigo-500', 'bg-indigo-50');
}

// ЭНТЕРПРАЙЗ: Прямая загрузка списка партнеров в открытое окно
async function loadReferralsList() {
  if (!currentUser) return;
  const listEl = document.getElementById('referralsList');
  listEl.innerHTML = '<div class="w-full text-center py-6 text-blue-500 font-bold text-xs animate-pulse">Синхронизация сети...</div>';
  
  try {
    const { referrals } = await BlockoAPI.call('listReferrals');
    document.getElementById('referralsCountBadge').innerText = referrals.length;
    
    if (referrals.length === 0) {
       listEl.innerHTML = '<div class="w-full text-center py-6 text-gray-500 text-xs font-medium">У вас пока нет партнеров. Поделитесь ссылкой!</div>';
    } else {
       let html = '';
       referrals.forEach(user => {
         html += `
           <div class="relative group cursor-pointer flex flex-col items-center">
             ${renderUserAvatar(user, 'w-12 h-12 hover:z-10 transition-transform hover:scale-110')}
             <span class="absolute -bottom-6 bg-gray-900 text-white text-[10px] px-2 py-1 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">${esc(user.name || 'Секретный Агент')}</span>
           </div>
         `;
       });
       listEl.innerHTML = html;
       lucide.createIcons();
    }
  } catch(e) {
    console.error(e);
    listEl.innerHTML = '<div class="w-full text-center py-6 text-red-500 text-xs font-bold">Не удалось загрузить список. Попробуйте позже.</div>';
  }
}
  
