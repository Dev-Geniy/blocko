// =====================================================================
// Blocko Pro — дизайн-система (общая конфигурация Tailwind)
// Подключается сразу после cdn.tailwindcss.com на всех страницах.
//
// Принципы: нейтральная серая основа, один акцентный цвет (синий),
// смысловые цвета только для статусов: красный — опасно/просрочено,
// жёлтый — внимание, зелёный — готово. Декоративные оттенки сведены к ним,
// поэтому старые классы вроде text-purple-500 автоматически становятся синими.
// =====================================================================
(function () {
  'use strict';

  // Нейтральная шкала (чуть тёплее и чище, чем синеватый gray по умолчанию)
  const neutral = {
    50: '#fafafa', 100: '#f4f4f5', 200: '#e4e4e7', 300: '#d4d4d8', 400: '#a1a1aa',
    500: '#71717a', 600: '#52525b', 700: '#3f3f46', 750: '#33333a', 800: '#27272a',
    850: '#1f1f23', 900: '#18181b', 950: '#0f0f11',
  };
  // Акцент
  const accent = {
    50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa',
    500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
  };
  // Смысловые
  const success = {
    50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80',
    500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d', 950: '#052e16',
  };
  const warning = {
    50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24',
    500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03',
  };
  const danger = {
    50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171',
    500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a',
  };

  const config = {
    darkMode: 'class',
    theme: {
      extend: {
        fontFamily: {
          sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
          mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        },
        colors: {
          gray: neutral, slate: neutral, zinc: neutral, stone: neutral, neutral: neutral,
          blue: accent, indigo: accent, violet: accent, purple: accent, sky: accent, cyan: accent, fuchsia: accent, pink: accent,
          green: success, emerald: success, teal: success, lime: success,
          amber: warning, yellow: warning, orange: warning,
          red: danger, rose: danger,
        },
        borderRadius: { lg: '0.5rem', xl: '0.75rem', '2xl': '1rem', '3xl': '1.25rem' },
        boxShadow: {
          sm: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
          DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
          md: '0 4px 12px -2px rgb(0 0 0 / 0.08)',
          lg: '0 8px 24px -6px rgb(0 0 0 / 0.10)',
          xl: '0 12px 32px -8px rgb(0 0 0 / 0.14)',
          '2xl': '0 20px 48px -12px rgb(0 0 0 / 0.20)',
          inner: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.04)',
        },
        letterSpacing: { wider: '0.02em', widest: '0.04em', tight: '-0.015em', tighter: '-0.02em' },
        fontWeight: { extrabold: '650', black: '700' },
      },
    },
  };

  if (typeof window.tailwind !== 'undefined') window.tailwind.config = config;
  window.BLOCKO_TAILWIND_CONFIG = config;

  // Шрифт Inter с кириллицей (Plus Jakarta Sans её не содержит — русский текст падал на системный шрифт)
  if (!document.querySelector('link[data-blocko-font]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    link.setAttribute('data-blocko-font', '');
    document.head.appendChild(link);
  }
})();
