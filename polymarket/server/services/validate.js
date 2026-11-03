// Wallet address validation. Polymarket wallets are EVM (Polygon) addresses.
// We validate the 0x + 40 hex format. If the address is mixed-case we verify the
// EIP-55 checksum; all-lower / all-upper addresses are accepted as-is (many
// tools emit lowercase). We never require or accept a private key/seed phrase.
import { createHash } from 'node:crypto';

const HEX40 = /^0x[0-9a-fA-F]{40}$/;

// keccak256 is not in node:crypto; EIP-55 needs keccak, not sha3-256's NIST
// variant. To stay dependency-free we implement a minimal keccak-256.
// (Compact reference implementation of Keccak-f[1600], 256-bit output.)
function keccak256(bytes) {
  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
  ];
  const R = [0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
  const MASK = (1n << 64n) - 1n;
  const rol = (x, n) => ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK;

  const rate = 136; // 1088 bits for keccak-256
  const input = Uint8Array.from(bytes);
  const padLen = rate - (input.length % rate);
  const padded = new Uint8Array(input.length + padLen);
  padded.set(input);
  padded[input.length] ^= 0x01; // keccak padding
  padded[padded.length - 1] ^= 0x80;

  const S = new Array(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 0; b < 8; b++) lane |= BigInt(padded[off + i * 8 + b]) << BigInt(8 * b);
      S[i] ^= lane;
    }
    // Keccak-f
    for (let round = 0; round < 24; round++) {
      const C = new Array(5);
      for (let x = 0; x < 5; x++) C[x] = S[x] ^ S[x+5] ^ S[x+10] ^ S[x+15] ^ S[x+20];
      const D = new Array(5);
      for (let x = 0; x < 5; x++) D[x] = C[(x+4)%5] ^ rol(C[(x+1)%5], 1);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) S[x+5*y] ^= D[x];
      const B = new Array(25);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++)
        B[y + 5*((2*x+3*y)%5)] = rol(S[x+5*y], R[x+5*y]);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++)
        S[x+5*y] = B[x+5*y] ^ ((~B[(x+1)%5+5*y]) & B[(x+2)%5+5*y] & MASK);
      S[0] ^= RC[round];
    }
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = S[i];
    for (let b = 0; b < 8; b++) { out[i*8+b] = Number(lane & 0xffn); lane >>= 8n; }
  }
  return out;
}

function toChecksumAddress(addr) {
  const lower = addr.toLowerCase().replace(/^0x/, '');
  const hash = keccak256(Buffer.from(lower, 'ascii'));
  let out = '0x';
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i];
    if (/[0-9]/.test(c)) { out += c; continue; }
    const nibble = (hash[i >> 1] >> (i % 2 === 0 ? 4 : 0)) & 0x0f;
    out += nibble >= 8 ? c.toUpperCase() : c;
  }
  return out;
}

// Returns { valid, normalized, reason }
export function validateWalletAddress(input) {
  if (typeof input !== 'string') return { valid: false, reason: 'address must be a string' };
  const addr = input.trim();
  if (!HEX40.test(addr)) return { valid: false, reason: 'not a 0x-prefixed 40-hex-character address' };
  const body = addr.slice(2);
  const isMixed = /[a-f]/.test(body) && /[A-F]/.test(body);
  if (isMixed) {
    const checksum = toChecksumAddress(addr);
    if (checksum !== addr) return { valid: false, reason: 'invalid EIP-55 checksum' };
  }
  return { valid: true, normalized: addr.toLowerCase() };
}

export const _internal = { keccak256, toChecksumAddress };
