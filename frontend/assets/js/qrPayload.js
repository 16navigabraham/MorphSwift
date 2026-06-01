/**
 * MorphSwift POS QR payload helpers (morphswift-pos-v1).
 */

export const QR_PROTOCOL = 'morphswift-pos-v1';

function toBase64Url(value) {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded) {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function encodeCheckoutPayload(fields) {
  return toBase64Url({
    protocol: QR_PROTOCOL,
    ...fields,
  });
}

export function decodeCheckoutPayload(encoded) {
  if (!encoded || typeof encoded !== 'string') {
    throw new Error('Invalid QR payload');
  }
  const data = fromBase64Url(encoded);
  if (data.protocol !== QR_PROTOCOL) {
    throw new Error(`Unsupported protocol: ${data.protocol ?? 'unknown'}`);
  }
  return data;
}

/**
 * Wallet-scan URI shown inside the QR (EIP-681 style for EVM chains).
 */
export function buildPaymentUri({ address, amount, token = 'USDC', network = 'Morph Hoodi' }) {
  const value = Number(amount);
  const safeAmount = Number.isFinite(value) ? value : 0;
  return `ethereum:${address}?value=${safeAmount}&token=${token}&network=${network}`;
}

export function shortAddress(address, head = 6, tail = 4) {
  if (!address || address.length <= head + tail) return address ?? '';
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
