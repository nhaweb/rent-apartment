import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toastFromParams } from '../src/lib/toast';

test('toastFromParams picks the first present flag and clears only it', () => {
  const params = new URLSearchParams('trang=2&da-xoa=1');
  assert.deepEqual(toastFromParams(params, { 'da-luu': 'Đã lưu.', 'da-xoa': 'Đã xóa.' }), {
    tone: 'info',
    text: 'Đã xóa.',
    clearParams: ['da-xoa'],
  });
  assert.equal(toastFromParams(new URLSearchParams('trang=2'), { 'da-luu': 'Đã lưu.' }), null);
});
