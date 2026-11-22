import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deleteAccountSchema,
  landlordSignUpProfileSchema,
  signInSchema,
  signUpSchema,
  updateProfileSchema,
  ZALO_PUBLIC_NEEDS_NUMBER,
} from '../src/lib/validation/auth';
import { vnPhoneSchema } from '../src/lib/validation/phone';

test('vnPhoneSchema normalizes Vietnamese mobile numbers', () => {
  assert.equal(vnPhoneSchema.parse('0905 123 456'), '0905123456');
  assert.equal(vnPhoneSchema.parse('+84 905.123.456'), '0905123456');
  assert.equal(vnPhoneSchema.parse('84-905-123-456'), '0905123456');
});

test('vnPhoneSchema rejects landlines and wrong lengths', () => {
  for (const value of ['0256 3822 222', '090512345', '09051234567', 'abc']) {
    assert.equal(vnPhoneSchema.safeParse(value).success, false, value);
  }
});

test('signInSchema caps the password and next path length', () => {
  assert.equal(signInSchema.safeParse({ email: 'a@b.vn', password: 'x'.repeat(129) }).success, false);
  assert.equal(signInSchema.safeParse({ email: 'a@b.vn', password: 'x', next: `/${'a'.repeat(600)}` }).success, false);
  assert.equal(signInSchema.safeParse({ email: ' A@B.vn ', password: 'secret' }).success, true);
});

test('deleteAccountSchema needs the confirm word', () => {
  assert.equal(deleteAccountSchema.safeParse({ password: 'p', confirm: 'xóa' }).success, true);
  assert.equal(deleteAccountSchema.safeParse({ password: 'p', confirm: ' XÓA ' }).success, true);
  assert.equal(deleteAccountSchema.safeParse({ password: 'p', confirm: 'XOA' }).success, false);
  assert.equal(deleteAccountSchema.safeParse({ password: '', confirm: 'XÓA' }).success, false);
});

test('the Zalo opt-in defaults to off and needs a Zalo number', () => {
  const profile = { name: 'Lan', phone: '0905123456' };
  assert.equal(updateProfileSchema.parse(profile).zaloPublic, false);
  assert.equal(updateProfileSchema.parse({ ...profile, zalo: '0905 111 222', zaloPublic: true }).zaloPublic, true);

  const missing = updateProfileSchema.safeParse({ ...profile, zalo: '', zaloPublic: true });
  assert.equal(missing.success, false);
  assert.deepEqual(missing.error?.issues.map((issue) => [issue.path.join('.'), issue.message]), [
    ['zaloPublic', ZALO_PUBLIC_NEEDS_NUMBER],
  ]);

  const signUp = { ...profile, email: 'lan@example.vn', password: 'password123' };
  assert.equal(signUpSchema.safeParse({ ...signUp, zaloPublic: true }).success, false);
  assert.equal(signUpSchema.safeParse({ ...signUp, zalo: '0905111222', zaloPublic: true }).success, true);

  // The Better Auth hook re-checks the sign-up body.
  assert.equal(landlordSignUpProfileSchema.safeParse({ phone: '0905123456', zalo: '', zaloPublic: true }).success, false);
  assert.equal(landlordSignUpProfileSchema.parse({ phone: '0905123456', zalo: '' }).zaloPublic, false);
});
