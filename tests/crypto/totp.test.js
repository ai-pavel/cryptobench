import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hotp, totpAt, decodeSecret, parseOtpUri, newSecret, checkCounter, checkPeriod } from '../../src/crypto/totp/totp.js';

const ascii = s => new TextEncoder().encode(s);
const K20 = ascii('12345678901234567890');
const K32 = ascii('12345678901234567890123456789012');
const K64 = ascii('1234567890123456789012345678901234567890123456789012345678901234');

test('RFC 4226 Appendix D HOTP values', () => {
  const want = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  want.forEach((code, c) => assert.equal(hotp(K20, c), code));
});

test('RFC 6238 Appendix B TOTP values (8 digits, 30 s)', () => {
  const rows = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];
  for (const [t, s1, s256, s512] of rows) {
    assert.equal(totpAt(K20, t, 30, 8, 'SHA-1').current, s1, `SHA-1 @${t}`);
    assert.equal(totpAt(K32, t, 30, 8, 'SHA-256').current, s256, `SHA-256 @${t}`);
    assert.equal(totpAt(K64, t, 30, 8, 'SHA-512').current, s512, `SHA-512 @${t}`);
  }
});

test('TOTP time step, seconds left and neighbouring codes', () => {
  const t = totpAt(K20, 59, 30, 6);
  assert.equal(t.step, 1);
  assert.equal(t.left, 1);
  assert.deepEqual([t.previous, t.current, t.next], [hotp(K20, 0), hotp(K20, 1), hotp(K20, 2)]);
  assert.deepEqual([t.previous, t.current, t.next], ['755224', '287082', '359152']);
});

test('Example secret is RFC 6238\'s "12345678901234567890" in base32', () => {
  assert.deepEqual(decodeSecret('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), K20);
  // Spaces, dashes, lowercase and padding are tolerated.
  assert.deepEqual(decodeSecret('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq=='), K20);
  assert.deepEqual(decodeSecret('JBSWY3DPEHPK3PXP'), Uint8Array.of(0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef)); // "Hello!" + DEADBEEF
});

test('secret errors', () => {
  assert.throws(() => decodeSecret('  '), /^Error: Enter a secret\.$/);
  assert.throws(() => decodeSecret('ABC1'), /not base32 \(letters A–Z and digits 2–7\)/);
  assert.throws(() => decodeSecret('A'), /not valid base32/);
});

test('otpauth URIs (Google Authenticator key URI format)', () => {
  const r = parseOtpUri('otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30');
  assert.deepEqual(r, {
    type: 'totp', algo: 'SHA-1', algoError: null, digits: '6', period: '30', counter: null,
    label: 'Issuer: ACME Co · Account: ACME Co:john.doe@email.com', secret: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
  });
  const h = parseOtpUri('otpauth://hotp/alice?secret=JBSWY3DPEHPK3PXP&counter=7&algorithm=sha512&digits=8');
  assert.equal(h.type, 'hotp'); assert.equal(h.counter, '7'); assert.equal(h.algo, 'SHA-512'); assert.equal(h.digits, '8');
  assert.equal(h.period, '30'); assert.equal(h.label, 'Account: alice');
  assert.equal(parseOtpUri('otpauth://hotp/x?secret=AA').counter, '0');
  const md5 = parseOtpUri('otpauth://totp/x?secret=AA&algorithm=MD5');
  assert.equal(md5.algo, null);
  assert.equal(md5.algoError, 'Unsupported algorithm MD5.');
});

test('otpauth URI errors', () => {
  assert.throws(() => parseOtpUri('otpauth://a b/x?secret=AA'), /Not a valid otpauth:\/\/ URI\./);
  assert.throws(() => parseOtpUri('https://totp/x?secret=AA'), /URI must start with otpauth:\/\//);
  assert.throws(() => parseOtpUri('otpauth://motp/x?secret=AA'), /Unknown OTP type “motp”\./);
  assert.throws(() => parseOtpUri('otpauth://totp/x?issuer=A'), /no secret parameter/);
});

test('new secrets and their URI round-trip', () => {
  const { secret, uri } = newSecret(K20, 'Example', 'alice@example.com');
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(uri, 'otpauth://totp/Example%3Aalice%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Example&algorithm=SHA1&digits=6&period=30');
  const back = parseOtpUri(uri);
  assert.equal(back.secret, secret);
  assert.equal(back.label, 'Issuer: Example · Account: Example:alice@example.com');
  assert.equal(newSecret(Uint8Array.of(1, 2, 3, 4, 5, 6), '', 'user').uri, 'otpauth://totp/user?secret=AEBAGBAFAY&algorithm=SHA1&digits=6&period=30');
});

test('counter and period checks', () => {
  assert.equal(checkCounter(0), 0);
  assert.throws(() => checkCounter(-1), /Counter must be a non-negative whole number\./);
  assert.throws(() => checkCounter(1.5), /Counter/);
  assert.equal(checkPeriod(30), 30);
  assert.throws(() => checkPeriod(0), /Period must be a positive whole number\./);
});
