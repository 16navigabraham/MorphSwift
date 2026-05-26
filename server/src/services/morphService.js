import { randomUUID } from 'node:crypto';

import { HttpError } from '../lib/httpError.js';
import { getDefaultState, readStore, updateStore } from '../lib/store.js';

function normalizeCurrency(value) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeToken(value) {
  return String(value ?? '').trim().toUpperCase();
}

function toNumber(value, fieldName) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new HttpError(400, `${fieldName} must be a positive number`);
  }

  return numberValue;
}

function round(value, precision = 6) {
  return Number(value.toFixed(precision));
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function getFiatUsdAmount(amount, currency, settings) {
  const rate = settings.fiatRates[currency];
  if (!rate) {
    throw new HttpError(400, `Unsupported currency: ${currency}`);
  }

  return amount / rate;
}

function getStablecoinAmount(usdAmount, token, settings) {
  const rate = settings.tokenRates[token];
  if (!rate) {
    throw new HttpError(400, `Unsupported stablecoin: ${token}`);
  }

  return usdAmount / rate;
}

function createMerchantSessionRecord(state, { email, displayName, provider }) {
  const cleanEmail = String(email ?? '').trim().toLowerCase();
  if (!cleanEmail) {
    throw new HttpError(400, 'email is required');
  }

  const merchant = state.merchants.find((entry) => entry.email === cleanEmail);
  if (merchant) {
    merchant.lastLoginAt = new Date().toISOString();
    merchant.provider = provider ?? merchant.provider;
    merchant.displayName = displayName?.trim() || merchant.displayName;
    return merchant;
  }

  const newMerchant = {
    id: `mrc_${randomUUID()}`,
    email: cleanEmail,
    displayName: displayName?.trim() || cleanEmail.split('@')[0],
    provider: provider ?? 'magic-link',
    status: 'active',
    balance: 0,
    currency: 'USDC',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  state.merchants.push(newMerchant);
  return newMerchant;
}

function serializeMerchant(merchant, state) {
  const settledTransactions = state.transactions.filter((entry) => entry.merchantId === merchant.id);
  const pendingCheckouts = state.checkouts.filter(
    (entry) => entry.merchantId === merchant.id && entry.status === 'pending',
  );

  return {
    ...merchant,
    openCheckouts: pendingCheckouts.length,
    transactionCount: settledTransactions.length,
  };
}

export async function getBrandConfig() {
  const state = await readStore();
  return {
    ...state.settings,
    checkoutMode: 'mobile-first-pos',
    router: 'smart-contract',
  };
}

export async function createAuthSession(input) {
  return updateStore(async (state) => {
    const merchant = createMerchantSessionRecord(state, input);

    return {
      merchant: serializeMerchant(merchant, state),
      sessionToken: `msw_${randomUUID()}`,
      onboardingComplete: true,
    };
  });
}

export async function getMerchant(merchantId) {
  const state = await readStore();
  const merchant = state.merchants.find((entry) => entry.id === merchantId);
  if (!merchant) {
    throw new HttpError(404, 'Merchant not found');
  }

  return serializeMerchant(merchant, state);
}

export async function listMerchantLedger(merchantId, limit = 20) {
  const state = await readStore();
  const merchant = state.merchants.find((entry) => entry.id === merchantId);
  if (!merchant) {
    throw new HttpError(404, 'Merchant not found');
  }

  const transactions = state.transactions
    .filter((entry) => entry.merchantId === merchantId)
    .sort((left, right) => new Date(right.confirmedAt).getTime() - new Date(left.confirmedAt).getTime())
    .slice(0, limit);

  const withdrawals = state.withdrawals
    .filter((entry) => entry.merchantId === merchantId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, limit);

  return {
    merchant: serializeMerchant(merchant, state),
    balance: round(merchant.balance, 6),
    transactions,
    withdrawals,
  };
}

export async function createQuote(input) {
  const state = await readStore();
  const amountFiat = toNumber(input.amountFiat, 'amountFiat');
  const currency = normalizeCurrency(input.currency ?? 'USD');
  const token = normalizeToken(input.token ?? 'USDC');

  const usdAmount = getFiatUsdAmount(amountFiat, currency, state.settings);
  const stablecoinAmount = getStablecoinAmount(usdAmount, token, state.settings);

  const networkFeeUsd = Math.max(
    state.settings.feeModel.minimumNetworkFeeUsd,
    usdAmount * (state.settings.feeModel.networkBps / 10000),
  );
  const platformFeeUsd = usdAmount * (state.settings.feeModel.platformBps / 10000);

  return {
    quoteId: `qte_${randomUUID()}`,
    brandName: state.settings.brandName,
    amountFiat: round(amountFiat, 2),
    currency,
    token,
    exchangeRate: round(state.settings.fiatRates[currency], 6),
    stablecoinAmount: round(stablecoinAmount, 6),
    networkFeeUsd: round(networkFeeUsd, 6),
    platformFeeUsd: round(platformFeeUsd, 6),
    estimatedSettlementSeconds: state.settings.settlementTargetSeconds,
    displayAmount: `${round(stablecoinAmount, 6)} ${token}`,
  };
}

export async function createCheckout(input) {
  const quote = await createQuote(input);
  return updateStore(async (state) => {
    const merchant = state.merchants.find((entry) => entry.id === input.merchantId);
    if (!merchant) {
      throw new HttpError(404, 'Merchant not found');
    }

    const checkoutId = `chk_${randomUUID()}`;
    const createdAt = new Date().toISOString();

    const checkout = {
      id: checkoutId,
      merchantId: merchant.id,
      merchantEmail: merchant.email,
      merchantName: merchant.displayName,
      status: 'pending',
      amountFiat: quote.amountFiat,
      currency: quote.currency,
      token: quote.token,
      stablecoinAmount: quote.stablecoinAmount,
      exchangeRate: quote.exchangeRate,
      networkFeeUsd: quote.networkFeeUsd,
      platformFeeUsd: quote.platformFeeUsd,
      displayAmount: quote.displayAmount,
      qrPayload: base64UrlEncode({
        protocol: 'morphswift-pos-v1',
        checkoutId,
        merchantId: merchant.id,
        amountFiat: quote.amountFiat,
        currency: quote.currency,
        token: quote.token,
        recipient: merchant.id,
        createdAt,
      }),
      createdAt,
      confirmedAt: null,
      reference: input.reference ?? null,
    };

    state.checkouts.push(checkout);

    return checkout;
  });
}

export async function getCheckout(checkoutId) {
  const state = await readStore();
  const checkout = state.checkouts.find((entry) => entry.id === checkoutId);
  if (!checkout) {
    throw new HttpError(404, 'Checkout not found');
  }

  return checkout;
}

export async function confirmCheckout(input) {
  return updateStore(async (state) => {
    const checkout = state.checkouts.find((entry) => entry.id === input.checkoutId);
    if (!checkout) {
      throw new HttpError(404, 'Checkout not found');
    }

    if (checkout.status === 'confirmed') {
      return checkout;
    }

    const merchant = state.merchants.find((entry) => entry.id === checkout.merchantId);
    if (!merchant) {
      throw new HttpError(404, 'Merchant not found');
    }

    const confirmedAt = new Date().toISOString();
    checkout.status = 'confirmed';
    checkout.confirmedAt = confirmedAt;
    checkout.txHash = input.txHash ?? `0x${randomUUID().replaceAll('-', '')}`;
    checkout.network = 'Morph';
    checkout.confirmationState = 'finalized';

    const transaction = {
      id: `txn_${randomUUID()}`,
      merchantId: merchant.id,
      checkoutId: checkout.id,
      amountFiat: checkout.amountFiat,
      currency: checkout.currency,
      token: checkout.token,
      stablecoinAmount: checkout.stablecoinAmount,
      feeUsd: round(checkout.networkFeeUsd + checkout.platformFeeUsd, 6),
      txHash: checkout.txHash,
      status: 'settled',
      confirmedAt,
      displayAmount: checkout.displayAmount,
    };

    state.transactions.push(transaction);
    merchant.balance = round(merchant.balance + checkout.stablecoinAmount, 6);

    return {
      checkout,
      transaction,
      merchant: serializeMerchant(merchant, state),
      settlementSeconds: state.settings.settlementTargetSeconds,
    };
  });
}

export async function confirmCheckoutByReference(input) {
  const state = await readStore();
  const checkout = state.checkouts.find((entry) => entry.id === input.checkoutId);
  if (!checkout) {
    throw new HttpError(404, 'Checkout not found');
  }

  return confirmCheckout({
    checkoutId: checkout.id,
    txHash: input.txHash,
  });
}

export async function createWithdrawal(input) {
  return updateStore(async (state) => {
    const merchant = state.merchants.find((entry) => entry.id === input.merchantId);
    if (!merchant) {
      throw new HttpError(404, 'Merchant not found');
    }

    const amount = toNumber(input.amount, 'amount');
    if (amount > merchant.balance) {
      throw new HttpError(400, 'Insufficient merchant balance');
    }

    merchant.balance = round(merchant.balance - amount, 6);

    const withdrawal = {
      id: `wd_${randomUUID()}`,
      merchantId: merchant.id,
      amount,
      token: normalizeToken(input.token ?? merchant.currency ?? 'USDC'),
      destination: String(input.destination ?? '').trim() || 'external-wallet',
      status: 'completed',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    state.withdrawals.push(withdrawal);

    return {
      withdrawal,
      merchant: serializeMerchant(merchant, state),
    };
  });
}

export async function listMerchants() {
  const state = await readStore();
  return state.merchants.map((merchant) => serializeMerchant(merchant, state));
}

export async function resetStoreForTests() {
  const state = getDefaultState();
  await updateStore(async (currentState) => {
    Object.assign(currentState, state);
    return currentState;
  });
}