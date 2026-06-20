const { exec } = require('child_process');

const PORT_START = 3000;
const PORT_END = 4999;

// Kullanımda olan portları bul
function getUsedPorts() {
  return new Promise((resolve) => {
    exec('ss -tlnp | awk \'{print $4}\' | grep -oP \'\\d+$\'', (err, stdout) => {
      if (err) return resolve([]);
      const ports = stdout
        .split('\n')
        .map(p => parseInt(p.trim()))
        .filter(p => !isNaN(p));
      resolve(ports);
    });
  });
}

// Bir sonraki boş portu bul
async function findNextAvailablePort(reservedPorts = []) {
  const usedPorts = await getUsedPorts();
  const allUsed = new Set([...usedPorts, ...reservedPorts]);

  for (let port = PORT_START; port <= PORT_END; port++) {
    // Panel'in kendi portunu atla
    if (port === 3999) continue;
    if (!allUsed.has(port)) {
      return port;
    }
  }
  throw new Error('Kullanılabilir port bulunamadı');
}

// Bir portun kullanımda olup olmadığını kontrol et
async function isPortInUse(port) {
  const usedPorts = await getUsedPorts();
  return usedPorts.includes(port);
}

module.exports = { findNextAvailablePort, isPortInUse, getUsedPorts };
