# Blocko Pro — запуск серверной части

Деньги, тарифы, промокоды, награды и пароли облачных досок теперь меняет только сервер.
Firestore Rules запрещают клиенту писать эти поля напрямую. Поэтому порядок выкладки важен:
**сначала функции, потом правила, потом фронтенд**.

## 1. Подготовка (один раз)

```bash
npm install -g firebase-tools
firebase login
firebase use blocko-pro
cd functions && npm install && cd ..
```

Для Cloud Functions 2-го поколения проект должен быть на тарифе **Blaze**.

## 2. Секреты PayPal

Нужны Client ID и Secret из того же приложения PayPal, чей `client-id` подключён в `index.html` и `store.html`.

```bash
firebase functions:secrets:set PAYPAL_CLIENT_ID
firebase functions:secrets:set PAYPAL_SECRET
```

По умолчанию функции работают с боевым PayPal (`PAYPAL_ENV=live`). Для песочницы создайте `functions/.env`
со строкой `PAYPAL_ENV=sandbox` и подключите на страницах sandbox `client-id`.

## 3. Выкладка

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
