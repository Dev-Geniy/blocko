// ==========================================
// Blocko Pro · доска — modes.js
// Тема, компактный режим, OLED, фокус-режим
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. board.html.
// ==========================================

// ЭНТЕРПРАЙЗ: Смена темы для доски
function toggleTheme() { 
  document.documentElement.classList.toggle('dark'); 
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); 
}

// ЭНТЕРПРАЙЗ: Интерактивный Компактный режим (High-Density View)
function toggleCompactMode() {
  document.body.classList.toggle('compact-mode');
  const isCompact = document.body.classList.contains('compact-mode');
  localStorage.setItem('blocko_compact', isCompact ? 'true' : 'false');
  
  updateCompactUI(isCompact);
  
  showSystemToast(
    'Отображение', 
    isCompact ? 'Включен компактный вид доски.' : 'Включен стандартный вид доски.', 
    isCompact ? 'list' : 'align-justify', 
    'text-blue-500', 
    'bg-blue-50 dark:bg-blue-900/30'
  );
  
  // Вызываем перерасчет хитбоксов SortableJS, так как высоты карточек изменились
  if (typeof render === 'function') {
    setTimeout(() => render(), 150);
  }
}

// Служебная функция для обновления визуального состояния кнопки
function updateCompactUI(isCompact) {
  const iconWrap = document.getElementById('compactIconWrap');
  const textLabel = document.getElementById('compactTextLabel');
  const btn = document.getElementById('btnCompactToggle');
  
  if (iconWrap && textLabel && btn) {
    iconWrap.innerHTML = `<i data-lucide="${esc(isCompact ? 'list' : 'align-justify')}" class="w-5 h-5 pointer-events-none"></i>`;
    textLabel.innerText = isCompact ? 'Стандарт' : 'Компакт';
    
    if (isCompact) {
      btn.classList.add('bg-blue-50', 'dark:bg-blue-900/30', 'border-blue-200', 'dark:border-blue-800/50');
      btn.classList.remove('bg-gray-50', 'dark:bg-gray-900/50', 'border-gray-100', 'dark:border-gray-800');
      iconWrap.classList.add('text-blue-500');
      iconWrap.classList.remove('text-gray-500');
      textLabel.classList.add('text-blue-600', 'dark:text-blue-400');
      textLabel.classList.remove('text-gray-600', 'dark:text-gray-400');
    } else {
      btn.classList.remove('bg-blue-50', 'dark:bg-blue-900/30', 'border-blue-200', 'dark:border-blue-800/50');
      btn.classList.add('bg-gray-50', 'dark:bg-gray-900/50', 'border-gray-100', 'dark:border-gray-800');
      iconWrap.classList.remove('text-blue-500');
      iconWrap.classList.add('text-gray-500');
      textLabel.classList.remove('text-blue-600', 'dark:text-blue-400');
      textLabel.classList.add('text-gray-600', 'dark:text-gray-400');
    }
    lucide.createIcons({ root: btn });
  }
}

// Инициализация компактного режима при загрузке
if (localStorage.getItem('blocko_compact') === 'true') {
  document.body.classList.add('compact-mode');
  // Отложенное обновление UI, чтобы DOM шторки успел сформироваться
  setTimeout(() => updateCompactUI(true), 100);
}

// Инициализация компактного режима при загрузке
if (localStorage.getItem('blocko_compact') === 'true') {
  document.body.classList.add('compact-mode');
}

// ЭНТЕРПРАЙЗ: Интерактивный Режим OLED Black (Monochrome)
function toggleOledMode() {
  document.body.classList.toggle('oled-mode');
  
  // Автоматически включаем темную тему, если включаем OLED
  if (document.body.classList.contains('oled-mode') && !document.documentElement.classList.contains('dark')) {
      toggleTheme();
  }

  const isOled = document.body.classList.contains('oled-mode');
  localStorage.setItem('blocko_oled', isOled ? 'true' : 'false');
  
  updateOledUI(isOled);
  
  showSystemToast(
    'Интерфейс', 
    isOled ? 'Активирован монохромный OLED-режим. Идеально для концентрации.' : 'Обычный режим восстановлен.', 
    isOled ? 'contrast' : 'sun-dim', 
    'text-gray-500', 
    'bg-gray-50 dark:bg-gray-900/30'
  );
}

function updateOledUI(isOled) {
  const iconWrap = document.getElementById('oledIconWrap');
  const textLabel = document.getElementById('oledTextLabel');
  const btn = document.getElementById('btnOledToggle');
  
  if (iconWrap && textLabel && btn) {
    iconWrap.innerHTML = `<i data-lucide="${esc(isOled ? 'sun-dim' : 'contrast')}" class="w-5 h-5 pointer-events-none"></i>`;
    textLabel.innerText = isOled ? 'Обычный' : 'OLED Black';
    
    if (isOled) {
      btn.classList.add('bg-gray-200', 'dark:bg-gray-800', 'border-gray-400', 'dark:border-gray-600');
      btn.classList.remove('bg-gray-50', 'dark:bg-gray-900/50', 'border-gray-100', 'dark:border-gray-800');
      iconWrap.classList.add('text-gray-900', 'dark:text-white');
      iconWrap.classList.remove('text-gray-500');
      textLabel.classList.add('text-gray-900', 'dark:text-white');
      textLabel.classList.remove('text-gray-600', 'dark:text-gray-400');
    } else {
      btn.classList.remove('bg-gray-200', 'dark:bg-gray-800', 'border-gray-400', 'dark:border-gray-600');
      btn.classList.add('bg-gray-50', 'dark:bg-gray-900/50', 'border-gray-100', 'dark:border-gray-800');
      iconWrap.classList.remove('text-gray-900', 'dark:text-white');
      iconWrap.classList.add('text-gray-500');
      textLabel.classList.remove('text-gray-900', 'dark:text-white');
      textLabel.classList.add('text-gray-600', 'dark:text-gray-400');
    }
    lucide.createIcons({ root: btn });
  }
}

// Инициализация OLED при загрузке
if (localStorage.getItem('blocko_oled') === 'true') {
  document.body.classList.add('oled-mode');
  if (!document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
  }
  setTimeout(() => updateOledUI(true), 100);
}

// ЭНТЕРПРАЙЗ: Интерактивный Режим Фокуса (Fullscreen API)
function toggleFocusMode() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      showSystemToast('Ошибка', 'Ваш браузер не поддерживает полноэкранный режим.', 'alert-circle', 'text-red-500', 'bg-red-50');
    });
    showSystemToast('Фокус', 'Полноэкранный режим активирован. Нажмите ESC для выхода.', 'maximize', 'text-indigo-500', 'bg-indigo-50 dark:bg-indigo-900/30');
    
    // Закрываем шторку настроек, чтобы юзер остался наедине с доской
    closeOtherSidebars('none');
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

// Глобальный слушатель изменений полноэкранного режима (Отрабатывает даже при нажатии ESC)
function updateFocusUI() {
  const isFocus = !!document.fullscreenElement;
  const iconWrap = document.getElementById('focusIconWrap');
  const textLabel = document.getElementById('focusTextLabel');
  const btn = document.getElementById('btnFocusToggle');
  
  if (iconWrap && textLabel && btn) {
    iconWrap.innerHTML = `<i data-lucide="${esc(isFocus ? 'minimize' : 'maximize')}" class="w-5 h-5 pointer-events-none"></i>`;
    textLabel.innerText = isFocus ? 'Свернуть' : 'Фокус';
    
    if (isFocus) {
      btn.classList.add('bg-indigo-50', 'dark:bg-indigo-900/30', 'border-indigo-200', 'dark:border-indigo-800/50');
      btn.classList.remove('bg-gray-50', 'dark:bg-gray-900/50', 'border-gray-100', 'dark:border-gray-800');
      iconWrap.classList.add('text-indigo-500');
      iconWrap.classList.remove('text-gray-500');
      textLabel.classList.add('text-indigo-600', 'dark:text-indigo-400');
      textLabel.classList.remove('text-gray-600', 'dark:text-gray-400');
    } else {
      btn.classList.remove('bg-indigo-50', 'dark:bg-indigo-900/30', 'border-indigo-200', 'dark:border-indigo-800/50');
      btn.classList.add('bg-gray-50', 'dark:bg-gray-900/50', 'border-gray-100', 'dark:border-gray-800');
      iconWrap.classList.remove('text-indigo-500');
      iconWrap.classList.add('text-gray-500');
      textLabel.classList.remove('text-indigo-600', 'dark:text-indigo-400');
      textLabel.classList.add('text-gray-600', 'dark:text-gray-400');
    }
    lucide.createIcons({ root: btn });
  }
}

// Вешаем глобального слушателя на браузер
document.addEventListener('fullscreenchange', updateFocusUI);
document.addEventListener('webkitfullscreenchange', updateFocusUI); // Поддержка Safari
