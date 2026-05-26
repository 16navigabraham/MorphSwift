/**
 * Ledger data layer — API + local history + stats helpers.
 */

import { apiUrl, CONFIG } from '../../config.js';
import { getMerchantId } from './magic.js';

const STATUS_MAP = {
  settled: 'confirmed',
  confirmed: 'confirmed',
  pending: 'pending',
  failed: 'failed',
};

export function loadLocalHistory() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.storage.history) || '[]');
  } catch {
    return [];
  }
}

export function saveLocalTransaction(entry) {
  const history = loadLocalHistory();
  history.unshift(entry);
  localStorage.setItem(CONFIG.storage.history, JSON.stringify(history.slice(0, 100)));
}

export function mapApiTransaction(tx) {
  return {
    id: tx.id,
    timestamp: tx.confirmedAt ?? tx.createdAt ?? new Date().toISOString(),
    usdAmount: Number(tx.stablecoinAmount ?? tx.usdAmount ?? 0),
    fiatAmount: Number(tx.amountFiat ?? 0),
    fiatCurrency: tx.currency ?? 'USD',
    token: tx.token ?? 'USDC',
    network: tx.network ?? 'Morph',
    status: STATUS_MAP[tx.status] ?? tx.status ?? 'confirmed',
    hash: tx.txHash ?? '',
  };
}

export async function fetchLedger(merchantId, limit = 50) {
  const id = merchantId ?? getMerchantId();
  if (!id) return null;

  const res = await fetch(apiUrl(`merchants/${id}/ledger?limit=${limit}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Ledger fetch failed (${res.status})`);
  }

  const data = await res.json();
  return {
    ...data,
    transactions: (data.transactions ?? []).map(mapApiTransaction),
  };
}

export function mergeTransactions(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const tx of list) {
      if (!tx?.id) continue;
      byId.set(String(tx.id), tx);
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function computeStats(transactions) {
  const today = new Date().toDateString();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const confirmed = transactions.filter((t) => t.status === 'confirmed');
  const todayTxs = confirmed.filter((t) => new Date(t.timestamp).toDateString() === today);
  const weekTxs = confirmed.filter((t) => new Date(t.timestamp).getTime() >= weekAgo);

  const todayRev = todayTxs.reduce((s, t) => s + t.usdAmount, 0);
  const weekRev = weekTxs.reduce((s, t) => s + t.usdAmount, 0);
  const balance = confirmed.reduce((s, t) => s + t.usdAmount, 0);

  const buckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toDateString();
  });

  const chartTotals = buckets.map((ds) =>
    confirmed
      .filter((t) => new Date(t.timestamp).toDateString() === ds)
      .reduce((s, t) => s + t.usdAmount, 0),
  );

  return {
    todayRev,
    todayCount: todayTxs.length,
    weekRev,
    balance,
    chartTotals,
    chartLabels: buckets.map((ds) =>
      new Date(ds).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
    ),
  };
}

export function transactionsToCsv(transactions) {
  const header = 'ID,Date,Amount USD,Token,Network,Fiat Amount,Fiat Currency,Status,Hash';
  const rows = transactions.map(
    (t) =>
      `${t.id},${new Date(t.timestamp).toLocaleDateString()},${t.usdAmount},${t.token},${t.network},${t.fiatAmount},${t.fiatCurrency},${t.status},${t.hash ?? ''}`,
  );
  return `${header}\n${rows.join('\n')}`;
}

export function downloadCsv(transactions, filename = 'payflow-ledger.csv') {
  const blob = new Blob([transactionsToCsv(transactions)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
