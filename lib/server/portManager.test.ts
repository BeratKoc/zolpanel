import { test } from 'node:test';
import assert from 'node:assert';
import { findNextAvailablePort } from './portManager';

// NOT: getUsedPorts() Linux'ta `ss` çağırır; Windows/CI'da `ss` yoksa err döner
// ve [] verir. Bu testler reservedPorts üzerinden saf seçim mantığını doğrular;
// gerçek sistem portlarına bağımlı assertion yapmaz.

test('reservedPorts ilk uygun portu atlar', async () => {
  // 3000..3004 rezerve → 3005 boş olmalı (sistemde o portlar boşsa).
  const reserved = [3000, 3001, 3002, 3003, 3004];
  const port = await findNextAvailablePort(reserved);
  assert.ok(!reserved.includes(port), `dönen port (${port}) rezerve listede olmamalı`);
  assert.ok(port >= 3000 && port <= 4999, `port aralık içinde olmalı: ${port}`);
});

test('panel portu 3999 asla seçilmez', async () => {
  // 3000..3998 hepsi rezerve → 3999 (panel) atlanmalı, >= 4000 dönmeli.
  const reserved: number[] = [];
  for (let p = 3000; p <= 3998; p++) reserved.push(p);
  const port = await findNextAvailablePort(reserved);
  assert.notStrictEqual(port, 3999, '3999 (panel portu) seçilmemeli');
  assert.ok(port >= 4000, `port 4000 ve üzeri olmalı: ${port}`);
});

test('tüm aralık rezerve ise hata fırlatır', async () => {
  const reserved: number[] = [];
  for (let p = 3000; p <= 4999; p++) reserved.push(p);
  await assert.rejects(() => findNextAvailablePort(reserved), /Kullanılabilir port bulunamadı/);
});
