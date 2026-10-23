# Blocko API (Cloudflare Worker)

Серверная часть оплаты и наград, которая работает **без тарифа Firebase Blaze**.
Делает то же, что `functions/` (Cloud Functions), но запускается на бесплатном Cloudflare Workers
(100 000 запросов в день бесплатно).

- `src/index.js` — приём запросов, CORS, проверка входа пользователя (Firebase ID-токен).
- `src/handlers.js` — операции: PayPal, покупки, промокоды, награды, пароли досок.
- `src/firestore.js` — доступ к базе Firestore через REST от имени сервисного аккаунта.
- Цены берутся из общего каталога `functions/lib/catalog.js`.

Тесты: `npm test` (Node 20+, без установки зависимостей).
Деплой: GitHub → Actions → «Деплой API (Cloudflare)» → Run workflow. Подробно — `DEPLOY.md`.
