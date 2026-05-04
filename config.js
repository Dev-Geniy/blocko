// ========================================== 
// 1. КЛЮЧИ И НАСТРОЙКИ FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyD9qC7dTYFeuy7JwKAiCDwq1jFdVwSSzPY",
  authDomain: "blocko-pro.firebaseapp.com",
  projectId: "blocko-pro",
  storageBucket: "blocko-pro.firebasestorage.app",
  messagingSenderId: "624610548711",
  appId: "1:624610548711:web:338aa1cb69a887447b7b42",
  measurementId: "G-YQTHGKRLJJ"
};

// ==========================================
// 2. ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ И АВТОРИЗАЦИИ (OFFLINE-FIRST ENTERPRISE)
// ==========================================
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

// Включаем агрессивное локальное кэширование (IndexedDB)
// Это обеспечит Zero-Latency загрузку данных и бесшовную работу без интернета
db.enablePersistence({ synchronizeTabs: true }).catch(() => {
    // Молчаливый фоллбэк, если браузер (например, режим инкогнито) не поддерживает локальное хранилище
});

const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ==========================================
// 3. API КЛЮЧИ И ВНЕШНИЕ СЕРВИСЫ
// ==========================================
const IMGBB_KEY = "22de10db6eb1f3ec3fca012dcc566961";
const AI_ENDPOINT = "https://text.pollinations.ai/";

// ==========================================
// 4. БИЗНЕС-ЛОГИКА И ТАРИФЫ (Курс: $1 = 100 credits)
// ==========================================
const PLANS = {
  FREE: { id: 'free', boardsLimit: 1, aiLimit: 3, priceCredits: 0 },
  FREELANCER: { id: 'freelancer', boardsLimit: 10, aiLimit: 15, priceCredits: 600 },
  COMPANY: { id: 'pro', boardsLimit: 999, aiLimit: 999, priceCredits: 1900 }
};

// Дополнительные платные услуги
const ADDONS = {
  AI_PACK: { id: 'addon_ai', name: '+50 AI запросов', price: 200 },
  CUSTOM_THEME: { id: 'addon_theme', name: 'Premium обои', price: 100 }
};

// Разовые услуги Blocko Pro
const BLOCKO_STORE = [
  { id: 'extra_ai', name: '+50 запросов AI', price: 250, icon: 'sparkles' },
  { id: 'custom_bg', name: 'Premium обои (1 шт)', price: 150, icon: 'image' },
  { id: 'vip_badge', name: 'Статус Амбассадора', price: 1000, icon: 'award' }
];
// ==========================================
// 5. ДИЗАЙН-СИСТЕМА
// ==========================================
const COL_COLORS = {
  default: { bg: 'bg-gray-100 dark:bg-gray-800/60', border: 'border-gray-200 dark:border-gray-700/50', hex: '#64748b' },
  blue:    { bg: 'bg-blue-50 dark:bg-indigo-900/30', border: 'border-blue-200 dark:border-indigo-500/30', hex: '#3b82f6' },
  green:   { bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-500/30', hex: '#10b981' },
  rose:    { bg: 'bg-rose-50 dark:bg-rose-900/30', border: 'border-rose-200 dark:border-rose-500/30', hex: '#f43f5e' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-200 dark:border-amber-500/30', hex: '#f59e0b' }
};

const AVAILABLE_TAGS = [
  { id: 'bug', name: 'Bug', color: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800' },
  { id: 'feature', name: 'Feature', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  { id: 'urgent', name: 'Urgent', color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  { id: 'design', name: 'Design', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400 border-purple-200 dark:border-purple-800' }
];

// ==========================================
// 6. НАГРАДЫ ПАРТНЕРСКОЙ ПРОГРАММЫ
// ==========================================
const REWARDS = {
  FRIEND: { 
    required: 10, 
    plan: 'freelancer', 
    days: 14, 
    desc: "Доступ к смене аватара + 14 дней тарифа Freelancer" 
  },
  PARTNER: { 
    required: 25, 
    plan: 'pro', 
    days: 14, 
    desc: "Светящаяся рамка + 14 дней тарифа Company" 
  },
  AMBASSADOR: { 
    required: 50, 
    paidRequired: 10, 
    plan: 'pro', 
    days: 60, 
    desc: "Анимированная рамка + 60 дней тарифа Company" 
  }
};
