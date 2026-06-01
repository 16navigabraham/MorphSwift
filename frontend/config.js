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
    payerReceipt: 'morphswift-payer-receipt',
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
    // USDC token address on Morph Hoodi — update if the testnet address changes
    usdcAddress: '0x9E12AD42c4E4d2acFBADE01a96446e48e6764B98',
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
