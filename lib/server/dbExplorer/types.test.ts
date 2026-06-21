import { test } from 'node:test';
import assert from 'node:assert';
import { parseCsv, parseTsv } from './types';

test('parseCsv: tırnaklı alan + gömülü virgül/newline', () => {
  assert.deepStrictEqual(parseCsv('id,name\n1,"a,b"\n2,"x\ny"'), [['id','name'],['1','a,b'],['2','x\ny']]);
});

test('parseCsv: boş → []', () => { assert.deepStrictEqual(parseCsv(''), []); });

test('parseTsv: tab ayrımı + \\N null', () => {
  assert.deepStrictEqual(parseTsv('id\tname\n1\tali\n2\t\\N'), [['id','name'],['1','ali'],['2', null as never]]);
});
