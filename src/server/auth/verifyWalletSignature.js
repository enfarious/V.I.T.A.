import { fromBase64 } from '@mysten/bcs';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyMessage } from 'ethers';

function isBase64(str = '') {
  return typeof str === 'string' && /^[A-Za-z0-9+/=]+={0,2}$/.test(str.trim());
}

function decodeMaybeBase64(str) {
  if (typeof str !== 'string') return null;
  try {
    return fromBase64(str);
  } catch {
    return null;
  }
}

export function normalizePayload(body = {}) {
  const { address, wallet_address, publicKey, bytes } = body;
  const sigObj = body.signature;
  const sig =
    typeof sigObj === 'object' && sigObj !== null ? sigObj.signature || sigObj.sig || sigObj.result || sigObj : sigObj;
  const pub =
    typeof sigObj === 'object' && sigObj !== null ? sigObj.publicKey || sigObj.pubKey || publicKey : publicKey;
  const addr =
    (typeof address === 'string' && address) ||
    (typeof wallet_address === 'string' && wallet_address) ||
    (typeof sigObj === 'object' && sigObj !== null && sigObj.address);
  const msgBytes = typeof bytes === 'string' ? decodeMaybeBase64(bytes) : null;

  const normalizeAddress = (value) => {
    if (!value) return null;
    if (value.startsWith('0x')) return value.toLowerCase();
    try {
      return normalizeSuiAddress(value);
    } catch {
      return value.toLowerCase();
    }
  };

  return {
    address: normalizeAddress(addr),
    signature: typeof sig === 'string' ? sig : null,
    publicKey: typeof pub === 'string' ? pub : null,
    bytes: msgBytes
  };
}

export async function verifyWalletSignature({ payload, message, authDebug = false }) {
  const normalized = normalizePayload(payload);
  if (!normalized.address || !normalized.signature) {
    const err = new Error('UNSUPPORTED_SIGNATURE_FORMAT');
    err.code = 'UNSUPPORTED_SIGNATURE_FORMAT';
    err.debug = { hasAddress: Boolean(normalized.address), hasSignature: Boolean(normalized.signature) };
    throw err;
  }

  const messageBytes = normalized.bytes || new TextEncoder().encode(message);
  const addressLower = normalized.address.toLowerCase();

  let publicKey;
  try {
    publicKey = await verifyPersonalMessageSignature(messageBytes, normalized.signature);
  } catch (e) {
    // If this looks like an EVM address, fall back to EVM verification before failing.
    if (!addressLower.startsWith('0x')) {
      const err = new Error('SIGNATURE_INVALID');
      err.code = 'SIGNATURE_INVALID';
      err.debug = { message: e?.message };
      throw err;
    }
  }

  if (publicKey) {
    try {
      const derived = normalizeSuiAddress(publicKey.toSuiAddress());
      if (derived === addressLower) {
        return { ok: true, address: derived, publicKey };
      }
    } catch (_) {
      // fall through
    }
  }

  // EVM-style fallback (personal_sign)
  if (addressLower.startsWith('0x')) {
    const evmResult = verifyEvmPersonalSign(addressLower, normalized.signature, message);
    if (evmResult.ok) {
      return { ok: true, address: addressLower, publicKey: null };
    }
    if (authDebug) {
      // Dev bypass: accept EVM payload in debug mode even if recovery fails, to unblock flow.
      return { ok: true, address: addressLower, publicKey: null, bypass: true, attempts: evmResult.attempts };
    }
    const err = new Error('SIGNATURE_INVALID');
    err.code = 'SIGNATURE_INVALID';
    err.debug = { message: 'EVM personal_sign path failed', attempts: evmResult.attempts };
    throw err;
  }

  const err = new Error('ADDRESS_MISMATCH');
  err.code = 'ADDRESS_MISMATCH';
  err.debug = { derived: publicKey?.toSuiAddress?.(), provided: normalized.address };
  throw err;
}

export function describePayload(payload = {}) {
  const norm = normalizePayload(payload);
  return {
    keys: Object.keys(payload || {}),
    signaturePresent: Boolean(norm.signature),
    signatureLength: norm.signature ? norm.signature.length : 0,
    signatureIsBase64: isBase64(norm.signature),
    publicKeyPresent: Boolean(norm.publicKey),
    publicKeyIsBase64: isBase64(norm.publicKey),
    addressPresent: Boolean(norm.address),
    bytesPresent: Boolean(norm.bytes),
    bytesLength: norm.bytes ? norm.bytes.length : 0
  };
}

function verifyEvmPersonalSign(address, signature, message) {
  const attempts = [];
  try {
    // ethers verifyMessage handles the EIP-191 prefix and recovers the address
    const recovered = verifyMessage(message, signature);
    attempts.push({ recovered });
    if (recovered.toLowerCase() === address.toLowerCase()) {
      return { ok: true, attempts };
    }
    return { ok: false, attempts };
  } catch (err) {
    attempts.push({ error: err?.message });
    return { ok: false, attempts };
  }
}
