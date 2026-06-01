/**
 * Poll checkout status from MorphSwift API; optional demo simulation.
 */

import { apiUrl, CONFIG } from '../../config.js';

function fetchWithTimeout(url, options = {}, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

export async function createCheckout(payload) {
  const res = await fetchWithTimeout(apiUrl('checkouts'), {
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
  const res = await fetchWithTimeout(apiUrl(`checkouts/${checkoutId}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Checkout fetch failed (${res.status})`);
  }
  return res.json();
}

export async function confirmCheckout(checkoutId, txHash) {
  const res = await fetchWithTimeout(apiUrl(`checkouts/${checkoutId}/confirm`), {
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

