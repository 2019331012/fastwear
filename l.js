const db = require('./database');
const users = db.prepare('SELECT DISTINCT user_id FROM orders WHERE user_id IS NOT NULL').all();
const upd = db.prepare('UPDATE orders SET user_seq = ? WHERE id = ?');
db.transaction(() => {
  for (const u of users) {
    const rows = db.prepare('SELECT id FROM orders WHERE user_id = ? ORDER BY id').all(u.user_id);
    rows.forEach((r, i) => upd.run(i + 1, r.id));
  }
})();
console.log('✅ backfilled user_seq');
