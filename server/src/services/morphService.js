import { createHash, randomUUID } from 'node:crypto'; // createHash used for email-based pseudo wallets

import { HttpError } from '../lib/httpError.js';
import {
  findMerchantByIdentity,
  getMerchantById,
  insertMerchant,
  updateMerchant,
  insertCheckout,
  getCheckoutById,
  updateCheckout,
  saveCheckoutOnChainId,
  expireCheckout,
  insertTransaction,
  getTransactionsByMerchant,
  getWithdrawalsByMerchant,
  insertWithdrawal,
  getCheckoutsByMerchant,
  listAllMerchants,
  getSettings,
} from '../lib/db.js';

function normalizeCurrency(value) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeToken(value) {
  return String(value ?? '').trim().toUpperCase();
}

function derivePseudoWallet(seed) {
  return `0x${createHash('sha256').update(String(seed)).digest('hex').slice(0, 40)}`;
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
  if (!rate) throw new HttpError(400, `Unsupported currency: ${currency}`);
  return amount / rate;
}

function getStablecoinAmount(usdAmount, token, settings) {
  const rate = settings.tokenRates[token];
  if (!rate) throw new HttpError(400, `Unsupported stablecoin: ${token}`);
  return usdAmount / rate;
}

function serializeMerchant(merchant, openCheckouts = 0, transactionCount = 0) {
  return { ...merchant, openCheckouts, transactionCount };
}

export async function getBrandConfig() {
  const settings = await getSettings();
  return { ...settings, checkoutMode: 'mobile-first-pos', router: 'smart-contract' };
}

export async function createAuthSession({ walletAddress, email, displayName, provider = 'wallet-connect' }) {
  const identity = String(walletAddress ?? email ?? '').trim();
  if (!identity) throw new HttpError(400, 'walletAddress is required');

  // For wallet-connect the identity IS the real wallet address — use it directly.
  // For email-based auth, derive a deterministic placeholder.
  const isWalletAddress = identity.startsWith('0x') && identity.length >= 40;
  const resolvedPayoutWallet = isWalletAddress ? identity : derivePseudoWallet(identity);

  let merchant = await findMerchantByIdentity(identity);

  if (merchant) {
    merchant.lastLoginAt = new Date().toISOString();
    merchant.provider = provider ?? merchant.provider;
    merchant.displayName = displayName?.trim() || merchant.displayName;
    merchant.walletAddress = merchant.walletAddress ?? identity;
    merchant.email = merchant.email ?? identity;
    // Keep pseudo payout wallet — it provides privacy by not exposing the real wallet address
    if (!merchant.payoutWallet) {
      merchant.payoutWallet = resolvedPayoutWallet;
    }
    await updateMerchant(merchant);
  } else {
    merchant = {
      id: `mrc_${randomUUID()}`,
      walletAddress: identity,
      email: identity,
      displayName: displayName?.trim() || identity.slice(0, 10),
      provider: provider ?? 'wallet-connect',
      status: 'active',
      balance: 0,
      currency: 'USDC',
      payoutWallet: resolvedPayoutWallet,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    await insertMerchant(merchant);
  }

  const [pendingCheckouts, transactions] = await Promise.all([
    getCheckoutsByMerchant(merchant.id),
    getTransactionsByMerchant(merchant.id),
  ]);

  return {
    merchant: serializeMerchant(merchant, pendingCheckouts.length, transactions.length),
    sessionToken: `msw_${randomUUID()}`,
    onboardingComplete: true,
  };
}

export async function getMerchant(merchantId) {
  const merchant = await getMerchantById(merchantId);
  if (!merchant) throw new HttpError(404, 'Merchant not found');

  const [pendingCheckouts, transactions] = await Promise.all([
    getCheckoutsByMerchant(merchantId),
    getTransactionsByMerchant(merchantId),
  ]);

  return serializeMerchant(merchant, pendingCheckouts.length, transactions.length);
}

export async function listMerchantLedger(merchantId, limit = 20) {
  const merchant = await getMerchantById(merchantId);
  if (!merchant) throw new HttpError(404, 'Merchant not found');

  const [transactions, withdrawals, pendingCheckouts] = await Promise.all([
    getTransactionsByMerchant(merchantId, limit),
    getWithdrawalsByMerchant(merchantId, limit),
    getCheckoutsByMerchant(merchantId),
  ]);

  return {
    merchant: serializeMerchant(merchant, pendingCheckouts.length, transactions.length),
    balance: round(merchant.balance, 6),
    transactions,
    withdrawals,
    pendingCheckouts,
  };
}

export async function createQuote(input) {
  const settings = await getSettings();
  const amountFiat = toNumber(input.amountFiat, 'amountFiat');
  const currency = normalizeCurrency(input.currency ?? 'USD');
  const token = normalizeToken(input.token ?? 'USDC');

  const usdAmount = getFiatUsdAmount(amountFiat, currency, settings);
  const stablecoinAmount = getStablecoinAmount(usdAmount, token, settings);

  const networkFeeUsd = Math.max(
    settings.feeModel.minimumNetworkFeeUsd,
    usdAmount * (settings.feeModel.networkBps / 10000),
  );
  const platformFeeUsd = usdAmount * (settings.feeModel.platformBps / 10000);

  return {
    quoteId: `qte_${randomUUID()}`,
    brandName: settings.brandName,
    amountFiat: round(amountFiat, 2),
    currency,
    token,
    exchangeRate: round(settings.fiatRates[currency], 6),
    stablecoinAmount: round(stablecoinAmount, 6),
    networkFeeUsd: round(networkFeeUsd, 6),
    platformFeeUsd: round(platformFeeUsd, 6),
    estimatedSettlementSeconds: settings.settlementTargetSeconds,
    displayAmount: `${round(stablecoinAmount, 6)} ${token}`,
  };
}

export async function createCheckout(input) {
  const quote = await createQuote(input);
  const merchant = await getMerchantById(input.merchantId);
  if (!merchant) throw new HttpError(404, 'Merchant not found');

  const checkoutId = `chk_${randomUUID()}`;
  const createdAt = new Date().toISOString();

  const checkout = {
    id: checkoutId,
    merchantId: merchant.id,
    merchantWalletAddress: merchant.walletAddress ?? merchant.email,
    merchantName: merchant.displayName,
    payoutWallet: merchant.payoutWallet,
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
    txHash: null,
    network: null,
    confirmationState: null,
  };

  await insertCheckout(checkout);
  return checkout;
}

export async function getCheckout(checkoutId) {
  const checkout = await getCheckoutById(checkoutId);
  if (!checkout) throw new HttpError(404, 'Checkout not found');
  return checkout;
}

export async function confirmCheckout({ checkoutId, txHash }) {
  const checkout = await getCheckoutById(checkoutId);
  if (!checkout) throw new HttpError(404, 'Checkout not found');
  if (checkout.status === 'confirmed') return checkout;

  const merchant = await getMerchantById(checkout.merchantId);
  if (!merchant) throw new HttpError(404, 'Merchant not found');

  const confirmedAt = new Date().toISOString();
  checkout.status = 'confirmed';
  checkout.confirmedAt = confirmedAt;
  checkout.txHash = txHash ?? `0x${randomUUID().replaceAll('-', '')}`;
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

  merchant.balance = round(merchant.balance + checkout.stablecoinAmount, 6);

  await Promise.all([
    updateCheckout(checkout),
    insertTransaction(transaction),
    updateMerchant(merchant),
  ]);

  const settings = await getSettings();
  const [pendingCheckouts, transactions] = await Promise.all([
    getCheckoutsByMerchant(merchant.id),
    getTransactionsByMerchant(merchant.id),
  ]);

  return {
    checkout,
    transaction,
    merchant: serializeMerchant(merchant, pendingCheckouts.length, transactions.length),
    settlementSeconds: settings.settlementTargetSeconds,
  };
}

export async function confirmCheckoutByReference({ checkoutId, txHash }) {
  const checkout = await getCheckoutById(checkoutId);
  if (!checkout) throw new HttpError(404, 'Checkout not found');
  return confirmCheckout({ checkoutId: checkout.id, txHash });
}

export async function createWithdrawal(input) {
  const merchant = await getMerchantById(input.merchantId);
  if (!merchant) throw new HttpError(404, 'Merchant not found');

  const amount = toNumber(input.amount, 'amount');
  if (amount > merchant.balance) throw new HttpError(400, 'Insufficient merchant balance');

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

  await Promise.all([updateMerchant(merchant), insertWithdrawal(withdrawal)]);

  const [pendingCheckouts, transactions] = await Promise.all([
    getCheckoutsByMerchant(merchant.id),
    getTransactionsByMerchant(merchant.id),
  ]);

  return {
    withdrawal,
    merchant: serializeMerchant(merchant, pendingCheckouts.length, transactions.length),
  };
}

/**
 * PATCH /api/checkouts/:id
 * Accepts: { onChainCheckoutId, expiresAt } — save on-chain ID after contract call
 *          { status: 'expired' }             — mark expired when timer hits 0
 */
export async function patchCheckout(checkoutId, body) {
  const checkout = await getCheckoutById(checkoutId);
  if (!checkout) throw new HttpError(404, 'Checkout not found');

  if (body.status === 'expired') {
    await expireCheckout(checkoutId);
    return { ...checkout, status: 'expired' };
  }

  if (body.onChainCheckoutId) {
    await saveCheckoutOnChainId(checkoutId, body.onChainCheckoutId, body.expiresAt ?? null);
    return { ...checkout, onChainCheckoutId: body.onChainCheckoutId, expiresAt: body.expiresAt };
  }

  throw new HttpError(400, 'Nothing to update');
}

export async function listMerchants() {
  const merchants = await listAllMerchants();
  return Promise.all(
    merchants.map(async (merchant) => {
      const [pendingCheckouts, transactions] = await Promise.all([
        getCheckoutsByMerchant(merchant.id),
        getTransactionsByMerchant(merchant.id),
      ]);
      return serializeMerchant(merchant, pendingCheckouts.length, transactions.length);
    }),
  );
}
