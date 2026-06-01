/**
 * MorphSwift frontend configuration.
 * Import from page scripts: import { CONFIG } from './config.js';
 */

export const CONFIG = {
  apiBaseUrl: '/api',

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
    payerReceipt: 'morphswift-payer-receipt',
    chargeAmount: 'chargeAmount',
    chargeUsd: 'chargeUSD',
    chargeCurrency: 'chargeCurrency',
  },

  checkout: {
    expirySeconds: 900,
    pollIntervalMs: 2500,
  },

  settlementNetwork: 'Morph Hoodi',
  networks: {
    USDC: 'Morph Hoodi',
    USDT: 'Morph Hoodi',
  },

  contract: {
    gatewayAddress: '0x91F8763B119CA7EC990ECCD0Db6A19ca13cAfDDa',
    gatewayAbiUrl: './assets/abi/MorphSwiftGateway.abi.json',
    chainId: 2910,
    nativeCurrency: 'ETH',
    chainName: 'Morph Hoodi',
    rpcUrls: ['https://rpc-hoodi.morphl2.io'],
    blockExplorerUrls: ['https://explorer-hoodi.morphl2.io'],
  },

};

export function apiUrl(path = '') {
  const base = CONFIG.apiBaseUrl.replace(/\/$/, '');
  const suffix = String(path).replace(/^\//, '');
  return suffix ? `${base}/${suffix}` : base;
}
