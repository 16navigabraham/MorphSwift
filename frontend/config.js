/**
 * MorphSwift frontend configuration.
 * Import from page scripts: import { CONFIG } from './config.js';
 */

const isLocalhost =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

export const CONFIG = {
  apiBaseUrl: isLocalhost ? 'http://localhost:4000/api' : '/api',

  brandName: 'MorphSwift',

  /** Demo fiat symbols when API config is unavailable */
  currencySymbols: {
    USD: '$',
    PHP: '₱',
    SGD: 'S$',
    MYR: 'RM',
    IDR: 'Rp',
    THB: '฿',
    VND: '₫',
    NGN: '₦',
  },

  storage: {
    sessionToken: 'morphswift-session-token',
    merchant: 'morphswift-merchant',
    history: 'morphswift-history',
    chargeAmount: 'chargeAmount',
    chargeUsd: 'chargeUSD',
    chargeCurrency: 'chargeCurrency',
  },

  checkout: {
    expirySeconds: 900,
    pollIntervalMs: 2500,
  },

  settlementNetwork: 'Morph',
  networks: {
    USDC: 'Morph',
    USDT: 'Morph',
  },

  /** Placeholder for Magic Link publishable key (set in deployment) */
  magicPublishableKey: '',
};

export function apiUrl(path = '') {
  const base = CONFIG.apiBaseUrl.replace(/\/$/, '');
  const suffix = String(path).replace(/^\//, '');
  return suffix ? `${base}/${suffix}` : base;
}
