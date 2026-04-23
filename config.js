// config.js
// ⚠️ ВСТАВЬ СЮДА СВОИ КЛЮЧИ ИЗ FIREBASE CONSOLE!
const firebaseConfig = {
  apiKey: "AIzaSyAUfLY36bB1oWhBxNYXIzFIrAe61iCoZFM", // Твой ключ
  authDomain: "flowboard-3d053.firebaseapp.com",
  projectId: "flowboard-3d053",
  storageBucket: "flowboard-3d053.firebasestorage.app",
  messagingSenderId: "59601989968",
  appId: "1:59601989968:web:f8143594d0d712340dbc55",
  measurementId: "G-WM851HTC0E"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Цвета для колонок (тоже общие)
const COL_COLORS = {
  default: { bg: 'bg-gray-100 dark:bg-gray-800/60', border: 'border-gray-200 dark:border-gray-700/50', hex: '#64748b' },
  blue:    { bg: 'bg-blue-50 dark:bg-indigo-900/30', border: 'border-blue-200 dark:border-indigo-500/30', hex: '#3b82f6' },
  green:   { bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-500/30', hex: '#10b981' },
  rose:    { bg: 'bg-rose-50 dark:bg-rose-900/30', border: 'border-rose-200 dark:border-rose-500/30', hex: '#f43f5e' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-200 dark:border-amber-500/30', hex: '#f59e0b' }
};
