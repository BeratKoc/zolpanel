// PM2 config — Next.js (next start) uygulamasını /opt/zolpanel'de çalıştırır.
// .env'i doğrudan okuyup env'e geçirir (dotenv bağımlılığı yok). Next ayrıca
// .env'i kendi de yükler; bu, env'in pm2 process'ine de geçmesini garanti eder.
const fs = require('fs');

const ENV_PATH = '/opt/zolpanel/.env';
const env = { NODE_ENV: 'production' };

if (fs.existsSync(ENV_PATH)) {
  fs.readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .forEach((l) => {
      const [k, ...v] = l.split('=');
      if (k) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    });
}

module.exports = {
  apps: [
    {
      name: 'zolpanel',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3999',
      cwd: '/opt/zolpanel',
      env,
    },
  ],
};
