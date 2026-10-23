// ==========================================
// Blocko Pro · главная — support.js
// Поддержка, модалки, подтверждения, детали тарифов
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. index.html.
// ==========================================

// --- ЛОГИКА САППОРТА (HELPDESK) ---
function openSupportModal() {
  if (!currentUser) return showSystemToast('Доступ закрыт', 'Авторизуйтесь, чтобы отправить обращение в поддержку.', 'lock', 'text-amber-500', 'bg-amber-50');
  const modal = document.getElementById('supportModal');
  const content = document.getElementById('supportContent');
  document.getElementById('supportMessage').value = '';
  modal.classList.remove('hidden');
  setTimeout(() => {
     modal.classList.remove('opacity-0');
     content.classList.remove('scale-95');
     content.classList.add('scale-100');
  }, 10);
}

function closeSupportModal() {
  const modal = document.getElementById('supportModal');
  const content = document.getElementById('supportContent');
  modal.classList.add('opacity-0');
  content.classList.remove('scale-100');
  content.classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 300);
}

async function submitSupportTicket() {
  const text = document.getElementById('supportMessage').value.trim();
  const type = document.querySelector('input[name="supportType"]:checked').value;
  const btn = document.getElementById('submitSupportBtn');
  
  if (!text) return showSystemToast('Пустое поле', 'Напишите текст сообщения.', 'alert-circle', 'text-amber-500', 'bg-amber-50');
  
  const ogBtn = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Отправка...';
  lucide.createIcons({ root: btn.parentElement });

  try {
     await db.collection('support_tickets').add({
         type: type,
         message: text,
         status: 'open',
         user: {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email || null,
            avatar: currentUser.customAvatar || currentUser.avatar || null
         },
         createdAt: new Date().toISOString()
     });
     
     showSystemToast('Отправлено!', 'Спасибо. Ваше обращение успешно доставлено команде Blocko.', 'check-circle', 'text-green-500', 'bg-green-50 dark:bg-green-900/30');
     closeSupportModal();
  } catch (e) {
     showSystemToast('Ошибка', 'Сбой отправки. Попробуйте позже.', 'x-circle', 'text-red-500', 'bg-red-50');
  } finally {
     btn.disabled = false;
     btn.innerHTML = ogBtn;
     lucide.createIcons({ root: btn.parentElement });
  }
}

// Закрытие модалок по клику на затемненный фон
    window.addEventListener('click', (e) => {
      if (e.target.id === 'createBoardModal') closeCreateModal();
      if (e.target.id === 'joinBoardModal') closeJoinModal();
      if (e.target.id === 'backupModal') closeBackupModal();
      if (e.target.id === 'pricingModal') closePricingModal();
      if (e.target.id === 'affiliateModal') closeAffiliateModal();
      if (e.target.id === 'topUpModal') closeTopUpModal();
      if (e.target.id === 'aboutModal') closeAboutModal();
      if (e.target.id === 'customConfirmModal') closeConfirmModal();
      if (e.target.id === 'planDetailsModal') closePlanDetails();
      if (e.target.id === 'importBoardModal') closeImportModal();
      if (e.target.id === 'supportModal') closeSupportModal();
      if (e.target.id === 'manageAdminsModal') closeManageAdminsModal();
      if (e.target.id === 'qrCodeModal') closeQrModal();
    });
  
let toastTimeout;
function showSystemToast(title, desc, iconName, iconColor, bgColor) {
  const toast = document.getElementById('globalToast');
  
  document.getElementById('toastTitle').innerText = title;
  document.getElementById('toastDesc').innerText = desc;
  
  const iconEl = document.getElementById('toastIcon');
  iconEl.setAttribute('data-lucide', iconName);
  iconEl.className = `w-5 h-5 ${iconColor}`;
  
  document.getElementById('toastIconBg').className = `p-2.5 rounded-full flex-shrink-0 ${bgColor}`;
  lucide.createIcons();

  // Показываем
  toast.classList.remove('translate-y-24', 'opacity-0');
  
  // Прячем через 5 секунд (сбрасывая таймер, если кликнули быстро несколько раз)
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 5000);
}

function openAboutModal() {
  const el = document.getElementById('aboutModal');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.remove('opacity-0'), 10);
}

function closeAboutModal() {
  const el = document.getElementById('aboutModal');
  el.classList.add('opacity-0');
  setTimeout(() => el.classList.add('hidden'), 300);
}

// Обновленный слушатель Escape
// ============================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (typeof closeAboutModal === 'function' && !document.getElementById('aboutModal').classList.contains('hidden')) closeAboutModal();
    if (typeof closeCreateModal === 'function' && !document.getElementById('createBoardModal').classList.contains('hidden')) closeCreateModal();
    if (typeof closeJoinModal === 'function' && !document.getElementById('joinBoardModal').classList.contains('hidden')) closeJoinModal();
    if (typeof closeBackupModal === 'function' && !document.getElementById('backupModal').classList.contains('hidden')) closeBackupModal();
    if (typeof closeAffiliateModal === 'function' && !document.getElementById('affiliateModal').classList.contains('hidden')) closeAffiliateModal();
    if (typeof closeTopUpModal === 'function' && !document.getElementById('topUpModal').classList.contains('hidden')) closeTopUpModal();
    if (typeof closeImportModal === 'function' && !document.getElementById('importBoardModal').classList.contains('hidden')) closeImportModal();
    
    if (!document.getElementById('planDetailsModal').classList.contains('hidden')) closePlanDetails();
    if (!document.getElementById('customConfirmModal').classList.contains('hidden')) closeConfirmModal();
    if (typeof closeQrModal === 'function' && !document.getElementById('qrCodeModal').classList.contains('hidden')) closeQrModal();
    
    if (typeof closePricingModal === 'function' && !document.getElementById('pricingModal').classList.contains('hidden') && document.getElementById('planDetailsModal').classList.contains('hidden')) {
      closePricingModal();
    }
  }
});


// ==========================================
// ЛОГИКА КАСТОМНЫХ ОКЕН ПОДТВЕРЖДЕНИЯ
// ==========================================
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

// ==========================================
// ЛОГИКА ДЕТАЛЕЙ ТАРИФОВ (Безрамочное окно)
// ==========================================
const PLAN_DETAILS_MAP = {
  'free': {
    name: 'Тариф Free',
    desc: 'Идеальный старт для личного использования и маленьких проектов. Вы получаете базовый функционал без ограничений по времени. Переходите на новый уровень, когда почувствуете, что готовы к большему.',
    color: 'emerald', icon: 'leaf',
    features: [
      { icon: 'cloud', val: '1 Проект', title: 'Облачное хранилище' },
      { icon: 'users', val: 'До 3-х', title: 'Членов команды' },
      { icon: 'hard-drive', val: '∞', title: 'Офлайн проекты' },
      { icon: 'bot', val: '5 / день', title: 'AI Ассистент' }
    ]
  },
  'freelancer': {
    name: 'Тариф Freelancer',
    desc: 'Расширяет границы вашего творчества. Управляйте сразу несколькими проектами одновременно, приглашайте фрилансеров в команду и используйте продвинутые инструменты искусственного интеллекта для ускорения рутины.',
    color: 'blue', icon: 'zap',
    features: [
      { icon: 'cloud', val: '10 Проектов', title: 'Облачное хранилище' },
      { icon: 'users', val: 'До 10-ти', title: 'В каждой команде' },
      { icon: 'bot', val: '30 / день', title: 'AI Ассистент' },
      { icon: 'headphones', val: '24/7', title: 'Саппорт' }
    ]
  },
  'pro': {
    name: 'Тариф Company',
    desc: 'Профессиональная среда для компаний. Никаких лимитов. Продвинутое управление ролями, полная безопасность файлов и максимальные мощности нейросетей. Построен для бизнеса, требующего полного контроля.',
    color: 'amber', icon: 'building-2',
    features: [
      { icon: 'cloud', val: 'Безлимит', title: 'Облачные проекты' },
      { icon: 'users', val: 'Безлимит', title: 'Команды и роли' },
      { icon: 'flame', val: 'Сгорающие', title: 'Файлы в чате' },
      { icon: 'sparkles', val: 'Безлимит', title: 'Мощь нейросетей' }
    ]
  },
  'infinity': {
    name: 'GOD MODE (Infinity)',
    desc: 'Эксклюзивный доступ для разработчиков и VIP-клиентов. Абсолютный безлимит на все ресурсы системы Blocko Pro.',
    color: 'purple', icon: 'crown',
    features: [
      { icon: 'infinity', val: 'Infinity', title: 'Облачные проекты' },
      { icon: 'infinity', val: 'Infinity', title: 'Участники и роли' },
      { icon: 'infinity', val: 'Infinity', title: 'Файлы в чате' },
      { icon: 'infinity', val: 'Infinity', title: 'Нейросети' }
    ]
  }
};

function openPlanDetails(planId) {
  closePricingModal(); // Закрываем основное окно тарифов
  
  const data = PLAN_DETAILS_MAP[planId];
  if (!data) return;

  const modal = document.getElementById('planDetailsModal');
  const content = document.getElementById('planDetailsContent');
  
  document.getElementById('planTitle').innerText = data.name;
  document.getElementById('planDesc').innerText = data.desc;
  
  // Оформление главной иконки
  const iconWrapper = document.getElementById('planIconWrapper');
  iconWrapper.className = `w-24 h-24 rounded-[2rem] flex items-center justify-center mb-8 mx-auto shadow-2xl relative bg-${data.color}-50 dark:bg-${data.color}-500/10 text-${data.color}-500 border border-${data.color}-200 dark:border-${data.color}-800`;
  document.getElementById('planIconGlow').className = `absolute inset-0 rounded-[2rem] blur-2xl opacity-60 bg-${data.color}-500`;
  
  const iconEl = document.getElementById('planIcon');
  iconEl.setAttribute('data-lucide', data.icon);
  iconEl.className = "w-12 h-12 relative z-10";

  // Сетка фич
  const grid = document.getElementById('planFeaturesGrid');
  grid.innerHTML = data.features.map(f => `
    <div class="flex items-start gap-4 p-4 rounded-2xl bg-white/5 dark:bg-black/20 hover:bg-white/10 dark:hover:bg-white/5 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-800">
      <div class="p-3 rounded-xl bg-${data.color}-50 dark:bg-${data.color}-500/20 text-${data.color}-500 flex-shrink-0">
         <i data-lucide="${f.icon}" class="w-6 h-6"></i>
      </div>
      <div>
         <h4 class="font-extrabold text-gray-900 dark:text-white text-lg">${f.val}</h4>
         <p class="text-xs text-gray-500 font-medium uppercase tracking-widest mt-1">${f.title}</p>
      </div>
    </div>
  `).join('');

  lucide.createIcons();

  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
    content.classList.add('scale-100');
  }, 10);
}

function closePlanDetails() {
  const modal = document.getElementById('planDetailsModal');
  const content = document.getElementById('planDetailsContent');
  modal.classList.add('opacity-0');
  content.classList.remove('scale-100');
  content.classList.add('scale-95');
  setTimeout(() => { 
    modal.classList.add('hidden');
    openPricingModal(); // Возвращаемся к выбору тарифов
  }, 300);
}
