// ==========================================
// 1. КЛЮЧИ И НАСТРОЙКИ FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAUfLY36bB1oWhBxNYXIzFIrAe61iCoZFM",
  authDomain: "flowboard-3d053.firebaseapp.com",
  projectId: "flowboard-3d053",
  storageBucket: "flowboard-3d053.firebasestorage.app",
  messagingSenderId: "59601989968",
  appId: "1:59601989968:web:f8143594d0d712340dbc55",
  measurementId: "G-WM851HTC0E"
};

// ==========================================
// 2. ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ И АВТОРИЗАЦИИ
// ==========================================
// Проверяем, чтобы Firebase не инициализировался дважды (полезно для стабильности)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ==========================================
// 3. API КЛЮЧ ДЛЯ ЗАГРУЗКИ КАРТИНОК
// ==========================================
const IMGBB_KEY = "22de10db6eb1f3ec3fca012dcc566961";

// ==========================================
// 4. ДИЗАЙН-СИСТЕМА (Общая для всех страниц)
// ==========================================

// Цвета для шапок колонок
const COL_COLORS = {
  default: { bg: 'bg-gray-100 dark:bg-gray-800/60', border: 'border-gray-200 dark:border-gray-700/50', hex: '#64748b' },
  blue:    { bg: 'bg-blue-50 dark:bg-indigo-900/30', border: 'border-blue-200 dark:border-indigo-500/30', hex: '#3b82f6' },
  green:   { bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-500/30', hex: '#10b981' },
  rose:    { bg: 'bg-rose-50 dark:bg-rose-900/30', border: 'border-rose-200 dark:border-rose-500/30', hex: '#f43f5e' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-200 dark:border-amber-500/30', hex: '#f59e0b' }
};

// Доступные теги (Labels) для карточек
const AVAILABLE_TAGS = [
  { id: 'bug', name: 'Bug', color: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800' },
  { id: 'feature', name: 'Feature', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  { id: 'urgent', name: 'Urgent', color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  { id: 'design', name: 'Design', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400 border-purple-200 dark:border-purple-800' }
];
