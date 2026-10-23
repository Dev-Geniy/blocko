# Blocko Pro — структура кода

Сайт статический (GitHub Pages, домен blocko.cloud). Сборки нет: страницы подключают скрипты напрямую.

## Общие файлы
| Файл | Назначение |
|---|---|
| `config.js` | Инициализация Firebase, ключи, тарифы (`PLANS`, `getPlanLimits`), награды |
| `security.js` | Экранирование: `esc`, `jsArg`, `safeUrl`, `safeColor`, `sanitizeHTML` (DOMPurify) |
| `api.js` | Вызов Cloud Functions: `BlockoAPI.call(name, data)` |
| `sw.js` | Service Worker (stale-while-revalidate). **При каждом релизе повышайте `CORE_CACHE_NAME`** |

## Доска — `board.html` + `js/board/`
Модули подключаются в таком порядке (порядок важен):

1. `core.js` — старт, Markdown, сеть, поиск, горячие клавиши, drag&drop
2. `state.js` — константы, состояние, вкладки, авторизация
3. `sync.js` — аватары, синхронизация с Firestore, журнал
4. `chat.js` — чат команды
5. `store.js` — мета колонок и запись карточек
6. `panels.js` — боковые панели (архив, участники, чат)
7. `cards.js` — модалка карточки и редактор
8. `render.js` — делегирование событий и отрисовка доски
9. `interactions.js` — панорамирование, подтверждения, AI для карточек, голосовой агент
10. `content.js` — опросы, аудио, просмотр контента
11. `tables.js` — таблицы
12. `modes.js` — тема, компактный, OLED, фокус-режим
13. `ai.js` — AI-ассистент и автопилот

Стили — `css/board.css`.

## Главная — `index.html` + `js/home/`
`app.js` → `affiliates.js` → `boards.js` → `billing.js` → `backup.js` → `support.js` → `access.js` → `profile.js` → `profile-tools.js` → `dashboard.js`. Стили — `css/home.css`.

## Правила для модулей
* Это классические скрипты, не ES-модули: функции и `let/const` верхнего уровня видны всем файлам и inline-обработчикам `onclick="..."`.
* Код, который выполняется сразу при загрузке, может вызывать только функции из своего или предыдущих файлов. Всё, что зависит от всех модулей (подписка на авторизацию), запускайте через `whenScriptsLoaded(fn)`.
* После изменения JS повышайте `?v=` в тегах `<script>` и `<link>` — иначе браузеры могут смешать старый и новый код.
* Пользовательские данные в HTML вставляйте только через `esc()` / `jsArg()` / `safeUrl()`.

## Сервер — `functions/` и `firestore.rules`
См. `DEPLOY.md`.
