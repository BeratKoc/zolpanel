const Datastore = require('nedb');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'data');

const db = {
  domains: new Datastore({ filename: path.join(dbPath, 'domains.db'), autoload: true }),
  users: new Datastore({ filename: path.join(dbPath, 'users.db'), autoload: true }),
  logs: new Datastore({ filename: path.join(dbPath, 'logs.db'), autoload: true }),
};

db.domains.ensureIndex({ fieldName: 'domain', unique: true });
db.users.ensureIndex({ fieldName: 'username', unique: true });

// İlk kurulumda admin kullanıcısı oluştur
async function initAdmin() {
  return new Promise((resolve) => {
    db.users.findOne({ username: 'admin' }, async (err, user) => {
      if (!user) {
        const hash = await bcrypt.hash('admin123', 10);
        db.users.insert({
          username: 'admin',
          password: hash,
          createdAt: new Date().toISOString()
        });
        console.log('Admin kullanıcısı oluşturuldu. Kullanıcı: admin, Şifre: admin123');
      }
      resolve();
    });
  });
}

// Log kaydet
function addLog(domain, level, message) {
  db.logs.insert({
    domain: domain || 'system',
    level: level || 'info',
    message,
    timestamp: new Date().toISOString()
  });
  // 30 günden eski logları temizle
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.logs.remove({ timestamp: { $lt: thirtyDaysAgo } }, { multi: true });
}

module.exports = { db, initAdmin, addLog };

// Memory snapshots koleksiyonu
db.memorySnapshots = new Datastore({
  filename: path.join(dbPath, 'memory_snapshots.db'),
  autoload: true
});
