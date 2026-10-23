// ==========================================
// Blocko Pro · главная — dashboard.js
// Онбординг, живое время, QR-донаты
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. index.html.
// ==========================================

// --- ЛОГИКА ЖИВОГО ВРЕМЕНИ ДЛЯ ДАШБОРДА (ENTERPRISE PERFORMANCE) ---
let lastTimeStr = '';

function updateDashTime() {
  requestAnimationFrame(() => {
    const el = document.getElementById('dashDateTimeBadge');
    if(!el) return;
    
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const newTimeStr = `${h}:${m}:${s}`;
    
    // Batching DOM updates: блокируем ре-рендер, если время не изменилось
    if (lastTimeStr === newTimeStr) return; 
    lastTimeStr = newTimeStr;
    
    const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const dayName = days[d.getDay()].toUpperCase();
    const day = d.getDate();
    const month = months[d.getMonth()].toUpperCase();
    
    let dateNode = document.getElementById('dashDateText');
    let timeNode = document.getElementById('dashTimeText');
    
    if (!dateNode || !timeNode) {
      // Исключаем использование innerHTML, строим гранулярный DOM
      el.textContent = ''; 
      
      dateNode = document.createElement('span');
      dateNode.id = 'dashDateText';
      dateNode.className = 'text-[10px] sm:text-[11px] font-extrabold tracking-widest text-blue-500 uppercase mt-0.5';
      
      timeNode = document.createElement('span');
      timeNode.id = 'dashTimeText';
      timeNode.className = 'text-base sm:text-lg font-black text-gray-900 dark:text-white tracking-widest ml-auto';
      timeNode.style.fontVariantNumeric = 'tabular-nums';
      
      el.appendChild(dateNode);
      el.appendChild(timeNode);
    }
    
    // Точечное обновление через textContent (никаких reflow)
    dateNode.textContent = `${dayName}, ${day} ${month}`;
    timeNode.textContent = newTimeStr;
  });
}

// Запускаем луп с мягким setTimeout + requestAnimationFrame для 60 FPS
function timeLoop() {
  updateDashTime();
  setTimeout(timeLoop, 1000);
}
timeLoop();

// Функция открытия микросервиса Pomodoro
function openPomodoroApp() {
  const width = 340;
  const height = 540;
  // Центрируем окно по центру экрана пользователя
  const left = (screen.width / 2) - (width / 2);
  const top = (screen.height / 2) - (height / 2);
  
  window.open('pomodoro.html', 'BlockoPomodoro', `width=${width},height=${height},top=${top},left=${left},resizable=no,scrollbars=no,status=no,menubar=no`);
}

// --- ЛОГИКА МОДАЛЬНОГО ОКНА ДЛЯ QR ДОНАТОВ ---
function openDonateQrModal(url) {
  const overlay = document.getElementById('donateQrOverlay');
  const img = document.getElementById('donateQrSrc');
  const wrap = document.getElementById('donateQrSrcWrap');
  img.src = url;
  overlay.classList.remove('hidden');
  setTimeout(() => {
     overlay.classList.remove('opacity-0');
     wrap.classList.remove('scale-95');
     wrap.classList.add('scale-100');
  }, 10);
  lucide.createIcons({ root: wrap });
}

function closeDonateQrModal() {
  const overlay = document.getElementById('donateQrOverlay');
  const wrap = document.getElementById('donateQrSrcWrap');
  overlay.classList.add('opacity-0');
  wrap.classList.remove('scale-100');
  wrap.classList.add('scale-95');
  setTimeout(() => { overlay.classList.add('hidden'); document.getElementById('donateQrSrc').src = ''; }, 300);
}

// Добавляем закрытие Donate QR окна по кнопке ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!document.getElementById('donateQrOverlay')?.classList.contains('hidden')) {
      closeDonateQrModal();
    }
  }
});
