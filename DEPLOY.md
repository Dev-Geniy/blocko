# Blocko Pro — запуск серверной части

Деньги, тарифы, промокоды, награды и пароли облачных досок меняет только сервер.
Правила базы (Firestore Rules) запрещают сайту писать эти поля напрямую.

Есть два варианта сервера, код у них одинаковый по смыслу:

| | Вариант А — Cloudflare (рекомендуется сейчас) | Вариант Б — Firebase Cloud Functions |
|---|---|---|
| Тариф Firebase | бесплатный Spark подходит | нужен Blaze (с картой) |
| Банковская карта | не нужна | нужна |
| Цена | бесплатно до 100 000 запросов в день | обычно $0 на старте |
| Папка в репозитории | `worker/` | `functions/` |

Сайт сам выбирает сервер: если в файле `api-endpoint.json` записан адрес — работает Cloudflare, иначе Cloud Functions.

## Вариант А: сервер на Cloudflare (без Blaze, без карты)

Всё делается в браузере, программы ставить не нужно. Займёт 15–20 минут.

**Шаг 1. Зарегистрируйтесь в Cloudflare.**
Откройте https://dash.cloudflare.com/sign-up → введите email и пароль → подтвердите email из письма.
Затем слева в меню откройте **Workers & Pages** (если Cloudflare попросит придумать имя поддомена — введите любое, например `blocko`).

**Шаг 2. Скопируйте Account ID.**
На странице **Workers & Pages** справа есть блок **Account details** → строка **Account ID** → нажмите «копировать».
(Ещё он виден в адресной строке: `dash.cloudflare.com/`**`вот-этот-набор-букв-и-цифр`**`/...`.)

**Шаг 3. Создайте токен для GitHub.**
Откройте https://dash.cloudflare.com/profile/api-tokens → **Create Token** → напротив шаблона **Edit Cloudflare Workers** нажмите **Use template** →
в **Account Resources** выберите свой аккаунт, остальное не трогайте → внизу **Continue to summary** → **Create Token** → **Copy**.
Токен показывается один раз — сразу переходите к шагу 5.

**Шаг 4. Скачайте ключ Firebase (работает на бесплатном тарифе).**
Firebase Console → проект blocko-pro → ⚙️ **Project settings** → вкладка **Service accounts** → **Generate new private key** → **Generate key**.
Скачается файл `.json`. Никому его не отправляйте и не загружайте в репозиторий.

**Шаг 5. Добавьте ключи в GitHub.**
Откройте https://github.com/Dev-Geniy/blocko/settings/secrets/actions → кнопка **New repository secret**. Создайте по очереди:

| Name | Secret (что вставить) |
|---|---|
| `CLOUDFLARE_API_TOKEN` | токен из шага 3 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID из шага 2 |
| `FIREBASE_SERVICE_ACCOUNT` | всё содержимое файла `.json` из шага 4 (открыть блокнотом → Ctrl+A → Ctrl+C) |
| `PAYPAL_CLIENT_ID` | если ещё нет: https://developer.paypal.com/dashboard/applications → приложение (**Live**) → Client ID |
| `PAYPAL_SECRET` | там же → Secret |

PayPal-ключи должны быть из того же приложения, чей `client-id` стоит на сайте (`index.html`, `store.html`).

**Шаг 6. Запустите сервер.**
https://github.com/Dev-Geniy/blocko/actions → слева **«Деплой API (Cloudflare)»** → справа **Run workflow** → зелёная кнопка **Run workflow**.
Через 1–3 минуты появится зелёная галочка ✅. Робот сам запишет адрес сервера в `api-endpoint.json`
(в истории коммитов появится «Адрес сервера оплаты: https://blocko-api….workers.dev»), и через 1–2 минуты сайт начнёт им пользоваться.

Проверка: откройте адрес из этого коммита и допишите в конце `/health` — должно показать `{"ok":true,...}`.

Если красный крестик ❌ — откройте запуск, нажмите на шаг с ошибкой: там написано по-русски, чего не хватает.

**Шаг 7. Опубликуйте правила базы (обязательно, после шага 6).**
Без них кто угодно может «нарисовать» себе монеты через консоль браузера. Правила работают на бесплатном тарифе.
Самый простой способ — вручную:
1. Откройте файл https://github.com/Dev-Geniy/blocko/blob/main/firestore.rules → кнопка **Copy raw file** (два квадратика справа сверху).
2. Firebase Console → **Firestore Database** → вкладка **Rules** → выделите всё (Ctrl+A) → вставьте (Ctrl+V) → **Publish**.

Чтобы правила публиковались сами после каждого PR (по желанию, один раз):
1. Откройте https://console.cloud.google.com/iam-admin/iam?project=blocko-pro
2. Найдите строку `firebase-adminsdk-…@blocko-pro.iam.gserviceaccount.com` → значок ✏️ справа.
3. **Add another role** → в поиске введите `Firebase Rules Admin` → выберите → **Save**.

После этого «Деплой сервера (Firebase)» будет публиковать правила сам. Без этой роли он просто покажет жёлтое предупреждение — сайт при этом работает.

Готово. Дальше сервер обновляется сам после каждого принятого PR, который меняет `worker/` или цены в `functions/lib/catalog.js`.

## Вариант Б: Cloud Functions (когда получится включить Blaze)

Если Firebase показывает ошибку **OR-CBAT-14** при переходе на Blaze — это ошибка платёжной системы Google, а не нашего кода.
Иногда помогает другая карта (не виртуальная и не предоплаченная), разрешённые в банке платежи за рубеж, другой браузер
или создание платёжного аккаунта напрямую на https://console.cloud.google.com/billing; если нет — только поддержка Google.
Пока Blaze недоступен, используйте вариант А — он делает то же самое.

**1. Включите в Firebase тариф Blaze.**
Firebase Console → проект blocko-pro → внизу слева «Spark» → **Upgrade** → **Blaze** → привяжите карту. Можно сразу задать лимит бюджета, например $5.

**2. Ключ доступа** — как в шаге 4 варианта А, и дайте ему права:
https://console.cloud.google.com/iam-admin/iam?project=blocko-pro → строка `firebase-adminsdk-…@blocko-pro.iam.gserviceaccount.com` → ✏️ → **Add another role**: **Editor** и **Secret Manager Admin** → **Save**.

**3. Секреты GitHub:** `FIREBASE_SERVICE_ACCOUNT`, `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` (как в шаге 5 варианта А).

**4. Включите деплой функций:** https://github.com/Dev-Geniy/blocko/settings/variables/actions → **New repository variable** → Name `DEPLOY_FUNCTIONS`, Value `true`.

**5. Запустите:** Actions → **«Деплой сервера (Firebase)»** → **Run workflow**.
Чтобы сайт перешёл с Cloudflare на Cloud Functions, очистите адрес в `api-endpoint.json` (`"url": ""`).

## Вручную через терминал (если удобнее)

### 1. Подготовка (один раз)

```bash
npm install -g firebase-tools
firebase login
firebase use blocko-pro
cd functions && npm install && cd ..
```

Для Cloud Functions 2-го поколения проект должен быть на тарифе **Blaze**.

### 2. Секреты PayPal

Нужны Client ID и Secret из того же приложения PayPal, чей `client-id` подключён в `index.html` и `store.html`.

```bash
firebase functions:secrets:set PAYPAL_CLIENT_ID
firebase functions:secrets:set PAYPAL_SECRET
```

По умолчанию функции работают с боевым PayPal (`PAYPAL_ENV=live`). Для песочницы создайте `functions/.env`
со строкой `PAYPAL_ENV=sandbox` и подключите на страницах sandbox `client-id`.

### 3. Выкладка

```bash
firebase deploy --only functions          # сначала сервер
firebase deploy --only firestore:rules    # затем правила
```

После этого загрузите обновлённые HTML/JS на хостинг (GitHub Pages и т. п.).

## 4. Миграция старых паролей досок (один раз)

Сейчас пароли старых досок лежат в документе доски в открытом виде, и их видит любой участник.
Скрипт переносит их в хэши (`board_secrets`), куда у клиента нет доступа:

```bash
cd functions
gcloud auth application-default login
GOOGLE_CLOUD_PROJECT=blocko-pro node scripts/migrate-board-passwords.js          # пробный прогон
GOOGLE_CLOUD_PROJECT=blocko-pro node scripts/migrate-board-passwords.js --apply  # применить
```

Если не запустить скрипт, пароль каждой доски всё равно перенесётся при первом успешном входе участника.

## 5. Администраторы

* Вход в `admin.html`: владелец `uajerryua@gmail.com` или email из `system/admins.emails`. Старый ключ `blocko_god_mode_2026` удалён.
* Список `system/admins` может менять только владелец.
* Если раньше кто-то получил `isAdmin: true` через ключ, этот флаг больше ничего не даёт. Его можно удалить из профилей.

## Что делает сервер (worker/ и functions/ — одинаково)

| Функция | Что делает |
|---|---|
| `createPaypalOrder` / `capturePaypalOrder` | Заказ PayPal с ценой из серверного каталога; монеты зачисляются только после проверки оплаты в PayPal (повторный вызов не начисляет дважды); комиссия CPA-партнёру по рангу: 30 / 40 / 50 % |
| `purchasePlan` | Тариф за монеты на 30 дней (продлевает, если тариф тот же) |
| `storePurchase` | Товары магазина за монеты/кредиты, подарочные коды |
| `redeemPromo` | Промокоды и подарки (срок, лимит, повтор — в транзакции) |
| `claimDailyGift`, `claimDailyQuest` | Ежедневные награды раз в сутки |
| `registerReferral` (Cloudflare) / `onUserCreated` (Functions), `claimReferralReward`, `listReferrals` | Реферальная программа: бонус пригласившему — один раз и только для нового аккаунта |
| `cpaWithdraw`, `cpaTransferToCoins` | Заявка на вывод CPA (подтверждает админ) и перевод в монеты |
| `enterBoard`, `setBoardPassword` | Вход на доску, лимит участников, пароли (хэш PBKDF2 / scrypt — оба формата понимают оба сервера), 5 попыток → пауза 10 минут |
| `onBoardCreated`, `onBoardDeleted` | Только Cloud Functions: лимит досок по тарифу на сервере; очистка карточек, чата и журнала при удалении |

## Проверки

```bash
node --test tests/*.test.js                   # помощники экранирования (security.js)
cd functions && npm test                      # каталог, пароли, разбор ответа PayPal
cd worker && npm test                         # сервер Cloudflare: все операции на базе в памяти
firebase emulators:start --only functions,firestore   # ручная проверка правил и функций
```
