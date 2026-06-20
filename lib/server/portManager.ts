import { exec } from 'child_process';

const PORT_START = 3000;
const PORT_END = 4999;

// Kullanımda olan portları bul
export function getUsedPorts(): Promise<number[]> {
  return new Promise((resolve) => {
    exec('ss -tlnp | awk \'{print $4}\' | grep -oP \'\\d+$\'', (err, stdout) => {
      if (err) return resolve([]);
      const ports = stdout
        .split('\n')
        .map((p) => parseInt(p.trim()))
        .filter((p) => !isNaN(p));
      resolve(ports);
    });
  });
}

// Bir sonraki boş portu bul
export async function findNextAvailablePort(reservedPorts: number[] = []): Promise<number> {
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
export async function isPortInUse(port: number): Promise<boolean> {
  const usedPorts = await getUsedPorts();
  return usedPorts.includes(port);
}
