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
    chargeAmount: 'morphswift-charge-amount',
    chargeUsd: 'morphswift-charge-usd',
    chargeCurrency: 'morphswift-charge-currency',
    checkoutReference: 'morphswift-checkout-reference',
    activeMerchant: 'morphswift-active-merchant',
    checkoutData: 'morphswift-checkout',
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
    gatewayAbiUrl: '/assets/abi/MorphSwiftGateway.abi.json',
    usdcAddress: '0x7433b41C6c5e1d58D4Da99483609520255ab661B',
    usdtAddress: '0xb646c743B4BA47ac03Bee360BB2484Fb55Db8d7e',
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
