import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const storeUrl = new URL('../../data/store.json', import.meta.url);
const storePath = fileURLToPath(storeUrl);

const defaultState = {
  settings: {
    brandName: 'MorphSwift',
    networkName: 'Morph',
    settlementTargetSeconds: 3,
    supportedCurrencies: ['USD', 'PHP', 'SGD', 'MYR', 'IDR', 'THB', 'VND'],
    supportedStablecoins: ['USDC', 'USDT'],
    fiatRates: {
      USD: 1,
      PHP: 56.2,
      SGD: 1.35,
      MYR: 4.7,
      IDR: 15750,
      THB: 35.8,
      VND: 25250,
    },
    tokenRates: {
      USDC: 1,
      USDT: 1,
    },
    feeModel: {
      networkBps: 8,
      platformBps: 12,
      minimumNetworkFeeUsd: 0.003,
    },
  },
  merchants: [],
  checkouts: [],
  transactions: [],
  withdrawals: [],
};

async function ensureStoreFile() {
  try {
    await readFile(storePath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }

    await mkdir(dirname(storePath), { recursive: true });
    await writeFile(storeUrl, JSON.stringify(defaultState, null, 2), 'utf8');
  }
}

export async function readStore() {
  await ensureStoreFile();

  const raw = await readFile(storePath, 'utf8');
  return JSON.parse(raw);
}

export async function writeStore(state) {
  await ensureStoreFile();
  await writeFile(storeUrl, JSON.stringify(state, null, 2), 'utf8');
}

export async function updateStore(updater) {
  const state = await readStore();
  const result = await updater(state);
  await writeStore(state);
  return result;
}

export function getDefaultState() {
  return structuredClone(defaultState);
}