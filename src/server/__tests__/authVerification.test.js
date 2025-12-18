import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { verifyWalletSignature, normalizePayload } from '../auth/verifyWalletSignature.js';
import * as secp from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { Wallet } from 'ethers';

secp.etc.hmacSha256Sync = (key, ...msgs) => hmac(sha256, key, Buffer.concat(msgs.map((m) => Buffer.from(m))));
secp.etc.sha256Sync = (...msgs) => sha256(Buffer.concat(msgs.map((m) => Buffer.from(m))));

const msg = 'hello-world';

function buildPayloadForms(signature, address, publicKey, bytesBase64) {
  return {
    A: { address, signature, nonce_id: 1 },
    B: { address, signature, publicKey, nonce_id: 1 },
    C: { address, signature: { signature, publicKey }, nonce_id: 1 },
    D: { address, signature, bytes: bytesBase64, nonce_id: 1 }
  };
}

describe('auth payload normalization', () => {
  it('maps payload shapes A/B/C/D', () => {
    const forms = buildPayloadForms('sig', '0xabc', 'pub', 'YmFzZTY0');
    const normA = normalizePayload(forms.A);
    const normB = normalizePayload(forms.B);
    const normC = normalizePayload(forms.C);
    const normD = normalizePayload(forms.D);
    assert.equal(normA.address, '0xabc');
    assert.equal(normA.signature, 'sig');
    assert.equal(normB.publicKey, 'pub');
    assert.equal(normC.signature, 'sig');
    assert.equal(normC.publicKey, 'pub');
    assert.ok(normD.bytes instanceof Uint8Array);
  });
});

describe('auth signature verification', () => {
  it('verifies a valid Sui personal message signature', async () => {
    const kp = Ed25519Keypair.generate();
    const msgBytes = new TextEncoder().encode(msg);
    const { signature } = await kp.signPersonalMessage(msgBytes);
    const payload = { address: kp.toSuiAddress(), signature };
    const result = await verifyWalletSignature({ payload, message: msg });
    assert.equal(result.address, kp.toSuiAddress());
  });

  it('fails on mismatched message', async () => {
    const kp = Ed25519Keypair.generate();
    const msgBytes = new TextEncoder().encode(msg);
    const { signature } = await kp.signPersonalMessage(msgBytes);
    const payload = { address: kp.toSuiAddress(), signature };
    await assert.rejects(
      () => verifyWalletSignature({ payload, message: 'different-message' }),
      (err) => err.code === 'SIGNATURE_INVALID' || err.code === 'ADDRESS_MISMATCH'
    );
  });

  it('verifies an EVM personal_sign signature', async () => {
    const wallet = Wallet.createRandom();
    const signature = await wallet.signMessage(msg);
    const payload = { address: wallet.address, signature };
    const result = await verifyWalletSignature({ payload, message: msg });
    assert.equal(result.address.toLowerCase(), wallet.address.toLowerCase());
  });
});
