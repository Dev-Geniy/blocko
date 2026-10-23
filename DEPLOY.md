# Blocko Pro — запуск серверной части

Деньги, тарифы, промокоды, награды и пароли облачных досок теперь меняет только сервер.
Firestore Rules запрещают клиенту писать эти поля напрямую. Поэтому порядок выкладки важен:
**сначала функции, потом правила, потом фронтенд**.


## Самый простой способ: автодеплой через GitHub (без установки программ)

В репозитории есть готовый сценарий `.github/workflows/deploy-firebase.yml`. Он сам выкладывает серверную часть, когда меняются файлы сервера, и его можно запустить кнопкой.

**1. Включите в Firebase тариф Blaze** (нужен для Cloud Functions; на старте обычно $0).
Firebase Console → проект blocko-pro → внизу слева «Spark» → **Upgrade** → **Blaze** → привяжите карту. Можно сразу задать лимит бюджета, например $5.

**2. Создайте ключ доступа.**
Firebase Console → ⚙️ **Project settings** → вкладка **Service accounts** → **Generate new private key** → **Generate key**. Скачается файл `.json` — никому его не отправляйте.

**3. Дайте ключу права на деплой.**
Откройте https://console.cloud.google.com/iam-admin/iam?project=blocko-pro → найдите строку `firebase-adminsdk-…@blocko-pro.iam.gserviceaccount.com` → ✏️ (карандаш) → **Add another role**:
- **Editor** (Редактор);
- **Secret Manager Admin** (Администратор Secret Manager).

Затем нажмите **Save**.

**4. Положите ключи в GitHub.**
https://github.com/Dev-Geniy/blocko/settings/secrets/actions → **New repository secret**:
- Name: `FIREBASE_SERVICE_ACCOUNT`, Secret: всё содержимое скачанного `.json` (откройте файл блокнотом, Ctrl+A, Ctrl+C).
- Name: `PAYPAL_CLIENT_ID` и `PAYPAL_SECRET` — из https://developer.paypal.com/dashboard/applications → ваше приложение (**Live**) → Client ID и Secret.

**5. Запустите деплой.**
https://github.com/Dev-Geniy/blocko/actions → слева **«Деплой сервера (Firebase)»** → справа **Run workflow** → **Run workflow**. Через 3–8 минут появится зелёная галочка ✅.
Если красный крестик ❌ — откройте запуск, нажмите на шаг с ошибкой и пришлите текст разработчику. Первый запуск иногда падает, пока Google включает сервисы; подождите 5 минут и нажмите **Re-run jobs**.

Дальше сервер обновляется сам после каждого принятого PR, который меняет `functions/` или `firestore.rules`.

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

## Что делает сервер (functions/index.js)

| Функция | Что делает |
|---|---|
| `createPaypalOrder` / `capturePaypalOrder` | Заказ PayPal с ценой из серверного каталога; монеты зачисляются только после проверки оплаты в PayPal (повторный вызов не начисляет дважды); комиссия CPA-партнёру по рангу: 30 / 40 / 50 % |
| `purchasePlan` | Тариф за монеты на 30 дней (продлевает, если тариф тот же) |
| `storePurchase` | Товары магазина за монеты/кредиты, подарочные коды |
| `redeemPromo` | Промокоды и подарки (срок, лимит, повтор — в транзакции) |
| `claimDailyGift`, `claimDailyQuest` | Ежедневные награды раз в сутки |
| `onUserCreated`, `claimReferralReward`, `listReferrals` | Реферальная программа |
| `cpaWithdraw`, `cpaTransferToCoins` | Заявка на вывод CPA (подтверждает админ) и перевод в монеты |
| `enterBoard`, `setBoardPassword` | Вход на доску, лимит участников, пароли (scrypt), 5 попыток → пауза 10 минут |
| `onBoardCreated`, `onBoardDeleted` | Лимит досок по тарифу; очистка карточек, чата и журнала при удалении |

## Проверки

```bash
node --test tests/*.test.js                   # помощники экранирования (security.js)
cd functions && npm test                      # каталог, пароли, разбор ответа PayPal
firebase emulators:start --only functions,firestore   # ручная проверка правил и функций
```
