// ==========================================
// Blocko Pro · главная — app.js
// Старт, авторизация, вход через Google, загрузка аватара
// Классический скрипт: объявления видны глобально (нужно для inline-обработчиков).
// Порядок подключения важен — см. index.html.
// ==========================================

// Выполнить fn, когда все синхронные скрипты страницы отработали (DOMContentLoaded)
function whenScriptsLoaded(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

// --- ИНИЦИАЛИЗАЦИЯ ПРИ СТАРТЕ (ИКОНКИ И ТЕМА) ---
if (localStorage.getItem('theme') === 'light') document.documentElement.classList.remove('dark');
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
});

// ЭНТЕРПРАЙЗ БЕЗОПАСНОСТЬ: Защита от BFCache (Сброс стейта при возврате кнопкой "Назад" для предотвращения утечки данных)
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});

// --- ТРЕКИНГ ПАРТНЕРСКОЙ ССЫЛКИ ---
const urlParams = new URLSearchParams(window.location.search);
const incomingRefId = urlParams.get('ref');
if (incomingRefId) {
  localStorage.setItem('blocko_ref_id', incomingRefId);
}

// Функция задержки для поиска
function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}
// Обернутая функция рендера
const debouncedRender = debounce(() => renderBoardsGrid());

let currentUser = null;
let onlineBoards = [];
// Порядок досок храним как массив id. Старые версии писали сюда целые объекты досок (вместе с паролями) — чистим.
let savedBoardOrder = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem('blocko_boards_order')) || [];
    const ids = Array.isArray(raw) ? raw.map(x => (x && typeof x === 'object') ? x.id : x).filter(x => typeof x === 'string') : [];
    localStorage.setItem('blocko_boards_order', JSON.stringify(ids));
    return ids;
  } catch (e) { return []; }
})();
let sortableInstance = null;

// Подписку на авторизацию запускаем, когда загружены ВСЕ модули страницы:
// иначе колбэк может сработать раньше, чем объявлены функции из следующих файлов.
whenScriptsLoaded(() => auth.onAuthStateChanged(async (user) => {
  const authScreen = document.getElementById('authScreen');
  const dashScreen = document.getElementById('dashboardScreen');
  const loader = document.getElementById('globalLoader');
  
  if (user) {
    currentUser = { id: user.uid, name: user.displayName, avatar: user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}` };
    
    try {
      const userRef = db.collection('users').doc(user.uid);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const data = userDoc.data();
        userPlan = data.plan || 'free';
        localStorage.setItem('blocko_user_plan', userPlan);
        currentUser = { ...currentUser, ...data };
      }
    } catch(e) {}

    // Скрываем лоадер и экран входа, показываем дашборд
    loader.style.opacity = '0';
    setTimeout(() => loader.classList.add('hidden'), 700);
    authScreen.classList.add('hidden');
    dashScreen.classList.remove('hidden');
    dashScreen.classList.add('flex');
    if (typeof OnboardingEngine !== 'undefined') OnboardingEngine.init();
    
    const dashAvatarEl = document.getElementById('dashAvatar');
    if(dashAvatarEl) {
        dashAvatarEl.outerHTML = renderUserAvatar(currentUser, 'w-11 h-11', 'dashAvatar', 'openProfileSettings()');
        lucide.createIcons();
    }

        // ЭНТЕРПРАЙЗ: Умное приветствие на основе времени суток
        const hour = new Date().getHours();
        let greeting = 'Доброй ночи';
        if (hour >= 5 && hour < 12) greeting = 'Доброе утро';
        else if (hour >= 12 && hour < 18) greeting = 'Добрый день';
        else if (hour >= 18 && hour < 23) greeting = 'Добрый вечер';
        
        document.getElementById('dashUserName').innerText = `${greeting}, ${currentUser.name.split(' ')[0]}!`;
        
        // Обновление нового Smart Welcome Дашборда
        const welcomeGreetingEl = document.getElementById('dashWelcomeGreeting');
        const welcomeNameEl = document.getElementById('dashWelcomeName');
        if (welcomeGreetingEl) welcomeGreetingEl.innerText = greeting;
        if (welcomeNameEl) welcomeNameEl.innerText = currentUser.name.split(' ')[0];

        subscribeToBoards(user.uid);

        const urlParams = new URLSearchParams(window.location.search);
        
        // ЭНТЕРПРАЙЗ: Умная маршрутизация после регистрации для Гифт-боксов
        const redirectAction = urlParams.get('redirect');
        const promoCode = urlParams.get('code');
        if (redirectAction === 'gift' && promoCode) {
            window.location.href = `gift.html?code=${promoCode}`;
            return;
        }

        const joinId = urlParams.get('join');
        const joinRole = urlParams.get('r') || 'editor'; // Читаем запрошенную роль из ссылки
        
        const authBoardId = urlParams.get('auth_board');
        const targetCardId = urlParams.get('c');
        const targetView = urlParams.get('target');
        const errorParam = urlParams.get('error');
        
        if (authBoardId) {
          window.history.replaceState({}, document.title, window.location.pathname);
          setTimeout(() => {
            let target = 'board';
            if (targetView === 'archive') target = 'archive';
            else if (targetCardId) target = `card_${targetCardId}`;
            tryEnterBoard(authBoardId, true, target);
          }, 500);
        } else if (joinId) {
          window.history.replaceState({}, document.title, window.location.pathname);
          setTimeout(() => joinBoardById(joinId, joinRole), 500); 
        } else if (errorParam === 'not_member') {
          window.history.replaceState({}, document.title, window.location.pathname);
          setTimeout(() => showSystemToast('Отказ в доступе', 'Вы не являетесь участником этого проекта.', 'shield-alert', 'text-red-500', 'bg-red-50 dark:bg-red-900/20'), 500);
        }
      } else {
    // Если не авторизован — показываем экран входа без долгого лоадера
    loader.classList.add('hidden');
    authScreen.classList.remove('hidden');
    dashScreen.classList.add('hidden');
  }
}));

// Дополнительная функция загрузки аватара
async function uploadProfileAvatarFile(input) {
  const file = input.files[0];
  if (!file) return;
  
  showSystemToast('Загрузка', 'Отправляем фото в облако...', 'loader-2', 'text-blue-500 animate-spin', 'bg-blue-50');
  
  try {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: fd });
    const data = await res.json();
    
    if (data.success) {
      document.getElementById('customAvatarUrl').value = data.data.url;
      updateProfileAvatar(); // Автосохранение
    }
  } catch (err) {
    showSystemToast('Ошибка', 'Сбой загрузки файла.', 'x-circle', 'text-red-500', 'bg-red-50');
  }
  input.value = '';
}
  
async function loginWithGoogle() { 
  try {
    const result = await auth.signInWithPopup(googleProvider);
    const user = result.user;
    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();
    
    if (!doc.exists) {
      const savedRefId = localStorage.getItem('blocko_ref_id');
      
      await userRef.set({
        name: user.displayName,
        email: user.email,
        avatar: user.photoURL,
        plan: 'free',
        referredBy: savedRefId || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        // Начальные настройки косметики
        badgeConfig: { frameColor: 'transparent', glowColor: 'transparent', animation: 'none' },
        rewardsClaimed: []
      });
      
      // Бонус пригласившему начисляет сервер (onUserCreated)
    }
  } catch (error) {
    console.error("Ошибка авторизации:", error);
    showSystemToast('Ошибка', 'Не удалось войти в систему.', 'alert-circle', 'text-red-500', 'bg-red-50');
  }
}
