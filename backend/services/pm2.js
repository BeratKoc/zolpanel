const { execFile } = require('child_process');
const { addLog } = require('../db/database');

// PM2 komutunu çalıştır — execFile ile (shell YOK → komut enjeksiyonu imkansız).
// args bir DİZİdir: pm2Exec(['stop', name])
function pm2Exec(args) {
  return new Promise((resolve, reject) => {
    execFile('pm2', args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

// PM2 process isimleri için güvenli karakter seti (defense-in-depth).
function assertSafeName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(name)) {
    throw new Error('Geçersiz process adı (sadece harf, rakam, . _ - ve max 100 karakter)');
  }
}

// PM2 kurulu mu kontrol et
function isPm2Available() {
  return new Promise((resolve) => {
    execFile('which', ['pm2'], (err) => resolve(!err));
  });
}

// Tüm processleri listele
async function listProcesses() {
  try {
    const available = await isPm2Available();
    if (!available) return [];
    const output = await pm2Exec(['jlist']);
    const list = JSON.parse(output);
    return list.map(p => ({
      id: p.pm_id,
      name: p.name,
      status: p.pm2_env.status,
      pid: p.pid,
      cpu: p.monit?.cpu ?? 0,
      memory: p.monit?.memory ?? 0,
      restarts: p.pm2_env.restart_time,
      uptime: p.pm2_env.pm_uptime,
      script: p.pm2_env.pm_exec_path,
      cwd: p.pm2_env.pm_cwd,
    }));
  } catch (e) {
    return [];
  }
}

// Process başlat
async function startProcess(name, script, cwd) {
  assertSafeName(name);
  await pm2Exec(['start', script, '--name', name, '--cwd', cwd]);
  await pm2Exec(['save']);
  addLog(name, 'info', 'PM2 process başlatıldı');
}

// Process durdur
async function stopProcess(name) {
  assertSafeName(name);
  await pm2Exec(['stop', name]);
  addLog(name, 'info', 'PM2 process durduruldu');
}

// Process yeniden başlat
async function restartProcess(name) {
  assertSafeName(name);
  await pm2Exec(['restart', name]);
  addLog(name, 'info', 'PM2 process yeniden başlatıldı');
}

// Process sil
async function deleteProcess(name) {
  assertSafeName(name);
  await pm2Exec(['delete', name]);
  await pm2Exec(['save']);
  addLog(name, 'info', 'PM2 process silindi');
}

// Process logları
async function getProcessLogs(name, lines = 100) {
  try {
    assertSafeName(name);
    const n = Math.max(1, Math.min(parseInt(lines) || 100, 5000));
    const output = await pm2Exec(['logs', name, '--lines', String(n), '--nostream']);
    return output;
  } catch (e) {
    return '';
  }
}

module.exports = {
  listProcesses,
  startProcess,
  stopProcess,
  restartProcess,
  deleteProcess,
  getProcessLogs,
  isPm2Available,
};
