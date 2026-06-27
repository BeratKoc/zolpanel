import { test } from 'node:test';
import assert from 'node:assert';
import { validateS3Config } from './config';
test('validateS3Config', () => {
  assert.strictEqual(validateS3Config({ endpoint:'https://s3.amazonaws.com', region:'us-east-1', bucket:'my-bucket', accessKeyId:'AK', secretAccessKey:'SK' }), null);
  assert.strictEqual(validateS3Config({ endpoint:'ftp://x', region:'r', bucket:'b1234', accessKeyId:'a', secretAccessKey:'s' }), 'Geçerli endpoint (https://...) gerekli');
  assert.strictEqual(validateS3Config({ endpoint:'https://x', region:'us', bucket:'AB', accessKeyId:'a', secretAccessKey:'s' }), 'Geçerli bucket adı gerekli');
  assert.match(validateS3Config({ endpoint:'https://x', region:'us', bucket:'okbucket', accessKeyId:'', secretAccessKey:'s' }) || '', /Access Key/);
});
