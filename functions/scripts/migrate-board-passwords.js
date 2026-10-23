'use strict';
// Одноразовая миграция: переносит пароли досок из boards/{id}.password (открытый текст)
// в board_secrets/{id}.hash и ставит boards/{id}.hasPassword = true.
//
// Запуск (из папки functions, после `npm install`):
//   gcloud auth application-default login
//   GOOGLE_CLOUD_PROJECT=blocko-pro node scripts/migrate-board-passwords.js          # пробный прогон
//   GOOGLE_CLOUD_PROJECT=blocko-pro node scripts/migrate-board-passwords.js --apply  # записать изменения
const admin = require('firebase-admin');
const { hashPassword } = require('../lib/passwords');

admin.initializeApp();
const db = admin.firestore();
const apply = process.argv.includes('--apply');

(async () => {
  const snap = await db.collection('boards').where('password', '!=', null).get();
  let migrated = 0;
  for (const doc of snap.docs) {
    const password = doc.get('password');
    if (typeof password !== 'string' || !password) continue;
    migrated++;
    console.log(`${apply ? 'migrate' : 'would migrate'} ${doc.id}`);
    if (!apply) continue;
    const batch = db.batch();
    batch.set(db.collection('board_secrets').doc(doc.id), { hash: hashPassword(password), attempts: {} }, { merge: true });
    batch.update(doc.ref, { password: admin.firestore.FieldValue.delete(), hasPassword: true });
    await batch.commit();
  }
  console.log(`${apply ? 'Перенесено' : 'Будет перенесено'}: ${migrated}`);
})().catch((e) => { console.error(e); process.exit(1); });
