/**
 * Fiat / stablecoin conversion using MorphSwift API config.
 */

import { apiUrl, CONFIG } from '../../config.js';

const DEMO_RATES = {
  PHP: 56.12,
  USD: 1,
  NGN: 1580,
  SGD: 1.35,
  MYR: 4.7,
};

let cachedSettings = null;
let lastFetchAt = 0;
const CACHE_MS = 60_000;
const FETCH_TIMEOUT_MS = 6_000;

function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

const FALLBACK_SETTINGS = {
  fiatRates: DEMO_RATES,
  tokenRates: { USDC: 1, USDT: 1 },
  supportedCurrencies: Object.keys(DEMO_RATES),
  supportedStablecoins: ['USDC', 'USDT'],
};

export async function loadPriceSettings(force = false) {
  const stale = Date.now() - lastFetchAt > CACHE_MS;
  if (!force && cachedSettings && !stale) return cachedSettings;

  try {
    const res = await fetchWithTimeout(apiUrl('config'));
    if (!res.ok) throw new Error(`config ${res.status}`);
    cachedSettings = await res.json();
    lastFetchAt = Date.now();
    return cachedSettings;
  } catch {
    // Server sleeping or unreachable — use built-in rates so the terminal is usable
    if (!cachedSettings) cachedSettings = FALLBACK_SETTINGS;
    lastFetchAt = Date.now();
    return cachedSettings;
  }
}

export function fiatToUsd(amountFiat, currency, settings) {
  const rates = settings?.fiatRates ?? DEMO_RATES;
  const rate = rates[currency];
  if (!rate) throw new Error(`Unsupported currency: ${currency}`);
  return amountFiat / rate;
}

export function usdToStablecoin(usdAmount, token, settings) {
  const rates = settings?.tokenRates ?? { USDC: 1, USDT: 1 };
  const rate = rates[token] ?? 1;
  return usdAmount / rate;
}

export async function quoteStablecoin({ amountFiat, currency, token }) {
  const res = await fetchWithTimeout(apiUrl('quotes'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountFiat, currency, token }),
  }, 10_000);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Quote failed (${res.status})`);
  }
  return res.json();
}

export function formatFiatSymbol(currency) {
  return CONFIG.currencySymbols[currency] ?? currency;
}

export function formatStablecoin(amount, token = 'USDC', digits = 2) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `0.${'0'.repeat(digits)}`;
  return `${n.toFixed(digits)} ${token}`;
}

/**
 * Local conversion for terminal keypad (no network round-trip).
 */
export async function convertFiatToStablecoins(amountFiat, currency) {
  const settings = await loadPriceSettings();
  const usd = fiatToUsd(amountFiat, currency, settings);
  const usdc = usdToStablecoin(usd, 'USDC', settings);
  const usdt = usdToStablecoin(usd, 'USDT', settings);
  return {
    usd,
    USDC: usdc,
    USDT: usdt,
    USDT_TRON: usdt * 1.0001,
  };
}
