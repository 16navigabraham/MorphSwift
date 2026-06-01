/**
 * Poll checkout status from MorphSwift API; optional demo simulation.
 */

import { apiUrl, CONFIG } from '../../config.js';
export async function createCheckout(payload) {
  const res = await fetch(apiUrl('checkouts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Checkout create failed (${res.status})`);
  }
  return res.json();
}

export async function fetchCheckout(checkoutId) {
  const res = await fetch(apiUrl(`checkouts/${checkoutId}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Checkout fetch failed (${res.status})`);
  }
  return res.json();
}

export async function confirmCheckout(checkoutId, txHash) {
  const res = await fetch(apiUrl(`checkouts/${checkoutId}/confirm`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Confirm failed (${res.status})`);
  }
  return res.json();
}

/**
 * Poll until checkout is confirmed or timeout.
 * @param {string} checkoutId
 * @param {{ onPending?: Function, onConfirmed?: Function, onError?: Function }} handlers
 */
export function watchCheckout(checkoutId, handlers = {}) {
  const { onPending, onConfirmed, onError } = handlers;
  const started = Date.now();
  const timeoutMs = CONFIG.checkout.expirySeconds * 1000;

  const tick = async () => {
    if (Date.now() - started > timeoutMs) {
      onError?.(new Error('Checkout expired'));
      return;
    }

    try {
      const checkout = await fetchCheckout(checkoutId);
      if (checkout.status === 'confirmed') {
        onConfirmed?.(checkout);
        return;
      }
      onPending?.(checkout);
      setTimeout(tick, CONFIG.checkout.pollIntervalMs);
    } catch (error) {
      onError?.(error);
    }
  };

  tick();
  return () => {};
}

/**
 * Demo flow matching checkout.html block confirmations (no API).
 */
export function simulatePaymentFlow(callbacks = {}) {
  const { onMempool, onBlock, onConfirmed } = callbacks;
  const delay = 5000 + Math.random() * 7000;

  const t1 = setTimeout(() => {
    onMempool?.();
    const t2 = setTimeout(() => {
      onBlock?.();
      const t3 = setTimeout(() => {
        const txHash = `0x${Array.from({ length: 16 }, () =>
          Math.floor(Math.random() * 16).toString(16),
        ).join('')}…`;
        onConfirmed?.({ txHash, status: 'confirmed' });
      }, 2500);
      return () => clearTimeout(t3);
    }, 2500);
    return () => clearTimeout(t2);
  }, delay);

  return () => clearTimeout(t1);
}
