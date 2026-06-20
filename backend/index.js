require("./load-env");
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initAdmin } = require('./db/database');
const { startTracker } = require('./services/memoryTracker');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3999;

// Middleware
// Token Authorization header'da taşınıyor (cookie değil) → credentials gerekmiyor.
// origin:'*' + credentials:true geçersiz bir kombinasyondu; credentials:false ile düzeltildi.
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: false,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/domains', require('./routes/domains'));
app.use('/api/processes', require('./routes/processes'));
app.use('/api/system', require('./routes/system'));

// Sağlık kontrolü
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Zolpanel', timestamp: new Date().toISOString() });
});

// Production'da frontend'i serve et
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Başlat
async function start() {
  await initAdmin();
  startTracker();
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🚀 Zolpanel backend çalışıyor: http://127.0.0.1:${PORT}`);
    console.log(`📋 API: http://127.0.0.1:${PORT}/api`);
    console.log(`\n⚠️  Panel sadece localhost'tan erişilebilir.`);
    console.log(`🌐 Dış erişim için: https://panel.zolvix.app\n`);
  });
}

start().catch(console.error);
