// .env dosyasını doğrudan okur (dotenv bağımlılığı YOK).
// Not: index.js zaten require('./load-env') ile .env'i yüklüyor; bu dosya
// `pm2 start ecosystem.config.js` ile başlatıldığında env'i pm2'ye de geçirir.
const fs = require('fs');

const ENV_PATH = '/opt/vps-panel/backend/.env';
const envVars = {};

if (fs.existsSync(ENV_PATH)) {
  fs.readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .forEach(l => {
      const [k, ...v] = l.split('=');
      if (k) envVars[k.trim()] = v.join('=').trim();
    });
}

module.exports = {
  apps: [{
    name: 'vps-panel',
    script: 'index.js',
    cwd: '/opt/vps-panel/backend',
    env: envVars,
  }],
};
