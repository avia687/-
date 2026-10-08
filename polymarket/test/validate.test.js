import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWalletAddress, _internal } from '../server/services/validate.js';

test('accepts a valid lowercase address and normalizes it', () => {
  const r = validateWalletAddress('0x' + 'a'.repeat(40));
  assert.equal(r.valid, true);
  assert.equal(r.normalized, '0x' + 'a'.repeat(40));
});

test('rejects wrong length / non-hex', () => {
  assert.equal(validateWalletAddress('0x123').valid, false);
  assert.equal(validateWalletAddress('nope').valid, false);
  assert.equal(validateWalletAddress('0x' + 'z'.repeat(40)).valid, false);
});

test('rejects non-string input', () => {
  assert.equal(validateWalletAddress(null).valid, false);
  assert.equal(validateWalletAddress(12345).valid, false);
});

test('keccak256 matches the known empty-input digest', () => {
  // keccak-256("") = c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
  const hex = Buffer.from(_internal.keccak256(Buffer.from(''))).toString('hex');
  assert.equal(hex, 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
});

test('validates a correct EIP-55 checksum address and rejects a corrupted one', () => {
  const lower = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
  const checksummed = _internal.toChecksumAddress(lower);
  assert.equal(validateWalletAddress(checksummed).valid, true);
  // flip the case of one checksum-significant char -> invalid
  const broken = checksummed.replace(/([A-F])/, (c) => c.toLowerCase()) !==
    checksummed
    ? checksummed.replace(/([A-F])/, (c) => c.toLowerCase())
    : checksummed.replace(/([a-f])/, (c) => c.toUpperCase());
  assert.equal(validateWalletAddress(broken).valid, false);
});
