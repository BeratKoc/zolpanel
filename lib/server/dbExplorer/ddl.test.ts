import { test } from 'node:test';
import assert from 'node:assert';
import { validateColumnType, validateIdentifier } from './types';
import {
  buildAddColumn as pgAdd, buildDropColumn as pgDrop,
  buildRenameColumn as pgRename, buildAlterColumnType as pgAlter,
} from './postgres';
import {
  buildAddColumn as myAdd, buildDropColumn as myDrop,
  buildRenameColumn as myRename, buildAlterColumnType as myAlter,
} from './mysql';

test('validateColumnType: izinli tipler + uzunluk', () => {
  assert.strictEqual(validateColumnType('varchar(255)', 'postgres'), 'varchar(255)');
  assert.strictEqual(validateColumnType('NUMERIC(10,2)', 'postgres'), 'numeric(10,2)');
  assert.strictEqual(validateColumnType('double precision', 'postgres'), 'double precision');
  assert.strictEqual(validateColumnType('int', 'mysql'), 'int');
  assert.strictEqual(validateColumnType('datetime', 'mysql'), 'datetime');
});

test('validateColumnType: injection/izinsiz reddedilir', () => {
  assert.strictEqual(validateColumnType('text; DROP TABLE x', 'postgres'), null);
  assert.strictEqual(validateColumnType('varchar(255) foo', 'postgres'), null);
  assert.strictEqual(validateColumnType("varchar(1)'", 'postgres'), null);
  assert.strictEqual(validateColumnType('jsonb', 'mysql'), null); // mysql'de yok
  assert.strictEqual(validateColumnType('bogustype', 'postgres'), null);
});

test('validateIdentifier', () => {
  assert.strictEqual(validateIdentifier('user_id'), true);
  assert.strictEqual(validateIdentifier('_x1'), true);
  assert.strictEqual(validateIdentifier('1col'), false);
  assert.strictEqual(validateIdentifier('a;b'), false);
  assert.strictEqual(validateIdentifier('a b'), false);
  assert.strictEqual(validateIdentifier(''), false);
});

test('pg builders: doğru DDL + ident escape', () => {
  assert.strictEqual(
    pgAdd('public', 'users', { name: 'age', type: 'integer', nullable: true }),
    'ALTER TABLE "public"."users" ADD COLUMN "age" integer',
  );
  assert.strictEqual(
    pgAdd('public', 'users', { name: 'nm', type: 'varchar(20)', nullable: false, default: 'x' }),
    `ALTER TABLE "public"."users" ADD COLUMN "nm" varchar(20) NOT NULL DEFAULT 'x'`,
  );
  assert.strictEqual(pgDrop('public', 'users', 'age'), 'ALTER TABLE "public"."users" DROP COLUMN "age"');
  assert.strictEqual(
    pgRename('public', 'users', 'old', 'new', 'integer'),
    'ALTER TABLE "public"."users" RENAME COLUMN "old" TO "new"',
  );
  assert.strictEqual(
    pgAlter('public', 'users', 'age', 'bigint', false),
    'ALTER TABLE "public"."users" ALTER COLUMN "age" TYPE bigint, ALTER COLUMN "age" SET NOT NULL',
  );
  assert.strictEqual(
    pgAlter('public', 'users', 'age', 'bigint', true),
    'ALTER TABLE "public"."users" ALTER COLUMN "age" TYPE bigint, ALTER COLUMN "age" DROP NOT NULL',
  );
});

test('mysql builders: backtick + CHANGE/MODIFY', () => {
  assert.strictEqual(
    myAdd('shop', 'users', { name: 'age', type: 'int', nullable: true }),
    'ALTER TABLE `shop`.`users` ADD COLUMN `age` int',
  );
  assert.strictEqual(myDrop('shop', 'users', 'age'), 'ALTER TABLE `shop`.`users` DROP COLUMN `age`');
  assert.strictEqual(
    myRename('shop', 'users', 'old', 'new', 'int(11)'),
    'ALTER TABLE `shop`.`users` CHANGE COLUMN `old` `new` int(11)',
  );
  assert.strictEqual(
    myAlter('shop', 'users', 'age', 'bigint', false),
    'ALTER TABLE `shop`.`users` MODIFY COLUMN `age` bigint NOT NULL',
  );
  assert.strictEqual(
    myAlter('shop', 'users', 'age', 'bigint', true),
    'ALTER TABLE `shop`.`users` MODIFY COLUMN `age` bigint',
  );
});
