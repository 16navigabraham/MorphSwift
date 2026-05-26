/**
 * Merchant withdrawal API client.
 */

import { apiUrl } from '../../config.js';
import { getMerchantId } from './magic.js';

export async function createWithdrawal({ amount, token = 'USDC', destination, merchantId }) {
  const id = merchantId ?? getMerchantId();
  if (!id) throw new Error('Merchant not signed in');

  const res = await fetch(apiUrl('withdrawals'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId: id,
      amount,
      token,
      destination,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Withdrawal failed (${res.status})`);
  }

  return res.json();
}

export function estimateNet(amount, feeUsd = 0.02) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value - feeUsd);
}
