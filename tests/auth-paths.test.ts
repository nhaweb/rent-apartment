import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DASHBOARD_PATH, isProtectedPath, safeNextPath } from '../src/lib/auth/paths';

test('safeNextPath keeps same-site paths with query and hash', () => {
  assert.equal(safeNextPath('/quan-ly/phong/moi'), '/quan-ly/phong/moi');
  assert.equal(safeNextPath('/quan-ly?xac-thuc=ok#anh'), '/quan-ly?xac-thuc=ok#anh');
});

test('safeNextPath rejects other origins and the auth pages', () => {
  for (const value of [null, undefined, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'quan-ly', '/dang-nhap', '/dang-ky?next=/x']) {
    assert.equal(safeNextPath(value), DASHBOARD_PATH, String(value));
  }
});

test('isProtectedPath covers /quan-ly and below only', () => {
  assert.ok(isProtectedPath('/quan-ly'));
  assert.ok(isProtectedPath('/quan-ly/tai-khoan'));
  assert.ok(!isProtectedPath('/quan-lyx'));
  assert.ok(!isProtectedPath('/phong'));
});
