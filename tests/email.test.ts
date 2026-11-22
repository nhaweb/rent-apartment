import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMailer, parseEmailTransport } from '../src/lib/email-core';
import { newContactRequest, resetPassword } from '../src/lib/email/templates';

test('templates escape user input in HTML and keep it readable in text', () => {
  const email = newContactRequest({
    landlordName: 'An',
    roomTitle: 'Phòng <b>đẹp</b>',
    renterName: '<script>x</script>',
    renterPhone: '0905123456',
    message: '',
    dashboardUrl: 'https://example.com/quan-ly/lien-he',
  });
  assert.ok(!email.html.includes('<script>'));
  assert.ok(email.html.includes('&#60;script&#62;'));
  assert.ok(email.text.includes('<script>x</script>'));
  assert.ok(email.text.includes('0905 123 456'));
  assert.ok(!email.text.includes('Lời nhắn'), 'empty message is left out');
});

test('reset template carries the link in both parts', () => {
  const url = 'https://example.com/reset?token=a&b=1';
  const email = resetPassword({ name: 'An', url });
  assert.ok(email.text.includes(url));
  assert.ok(email.html.includes('https://example.com/reset?token=a&#38;b=1'));
});

test('parseEmailTransport accepts known values and rejects others', () => {
  assert.equal(parseEmailTransport(undefined, 'console'), 'console');
  assert.equal(parseEmailTransport('gmail', 'console'), 'gmail');
  assert.throws(() => parseEmailTransport('smtp', 'console'));
});

test('console transport never reports success in production', async () => {
  const message = { to: 'a@example.com', subject: 's', text: 'https://x.test/t', html: '' };
  const quiet = console.warn;
  console.warn = () => {};
  try {
    const prod = createMailer({ transport: 'console', siteName: 'S', production: true });
    assert.deepEqual(await prod.sendEmail(message), { ok: false, reason: 'not-configured' });
  } finally {
    console.warn = quiet;
  }
});

test('gmail without credentials fails without throwing', async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const mailer = createMailer({ transport: 'gmail', siteName: 'S', production: false });
    const result = await mailer.sendEmail({ to: 'a@example.com', subject: 's', text: 't', html: '' });
    assert.deepEqual(result, { ok: false, reason: 'not-configured' });
  } finally {
    console.error = quiet;
  }
});
