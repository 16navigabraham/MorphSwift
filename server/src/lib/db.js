import { createClient } from '@libsql/client';

let _client = null;

export function getClient() {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

const DEFAULT_SETTINGS = JSON.stringify({
  brandName: 'MorphSwift',
  networkName: 'Morph',
  settlementTargetSeconds: 3,
  supportedCurrencies: ['USD', 'PHP', 'SGD', 'MYR', 'IDR', 'THB', 'VND'],
  supportedStablecoins: ['USDC', 'USDT'],
  fiatRates: { USD: 1, PHP: 56.2, SGD: 1.35, MYR: 4.7, IDR: 15750, THB: 35.8, VND: 25250 },
  tokenRates: { USDC: 1, USDT: 1 },
  feeModel: { networkBps: 8, platformBps: 12, minimumNetworkFeeUsd: 0.003 },
});

export async function initDb() {
  const db = getClient();

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      wallet_address TEXT,
      email TEXT,
      display_name TEXT,
      provider TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      balance REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USDC',
      payout_wallet TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checkouts (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      merchant_wallet_address TEXT,
      merchant_name TEXT,
      payout_wallet TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      amount_fiat REAL NOT NULL,
      currency TEXT NOT NULL,
      token TEXT NOT NULL,
      stablecoin_amount REAL NOT NULL,
      exchange_rate REAL NOT NULL,
      network_fee_usd REAL NOT NULL,
      platform_fee_usd REAL NOT NULL,
      display_amount TEXT NOT NULL,
      qr_payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      confirmed_at TEXT,
      reference TEXT,
      tx_hash TEXT,
      network TEXT,
      confirmation_state TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      checkout_id TEXT NOT NULL,
      amount_fiat REAL NOT NULL,
      currency TEXT NOT NULL,
      token TEXT NOT NULL,
      stablecoin_amount REAL NOT NULL,
      fee_usd REAL NOT NULL,
      tx_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'settled',
      confirmed_at TEXT NOT NULL,
      display_amount TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      amount REAL NOT NULL,
      token TEXT NOT NULL,
      destination TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );
  `);

  await db.execute({
    sql: `INSERT OR IGNORE INTO settings (id, data) VALUES (1, ?)`,
    args: [DEFAULT_SETTINGS],
  });
}

export async function getSettings() {
  const db = getClient();
  const row = await db.execute(`SELECT data FROM settings WHERE id = 1`);
  return JSON.parse(row.rows[0].data);
}

export async function findMerchantByIdentity(identity) {
  const db = getClient();
  const normalized = identity.toLowerCase();
  const result = await db.execute({
    sql: `SELECT * FROM merchants WHERE lower(wallet_address) = ? OR lower(email) = ? LIMIT 1`,
    args: [normalized, normalized],
  });
  return result.rows[0] ? rowToMerchant(result.rows[0]) : null;
}

export async function getMerchantById(id) {
  const db = getClient();
  const result = await db.execute({
    sql: `SELECT * FROM merchants WHERE id = ?`,
    args: [id],
  });
  return result.rows[0] ? rowToMerchant(result.rows[0]) : null;
}

export async function insertMerchant(merchant) {
  const db = getClient();
  await db.execute({
    sql: `INSERT INTO merchants (id, wallet_address, email, display_name, provider, status, balance, currency, payout_wallet, created_at, last_login_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      merchant.id, merchant.walletAddress, merchant.email, merchant.displayName,
      merchant.provider, merchant.status, merchant.balance, merchant.currency,
      merchant.payoutWallet, merchant.createdAt, merchant.lastLoginAt,
    ],
  });
}

export async function updateMerchant(merchant) {
  const db = getClient();
  await db.execute({
    sql: `UPDATE merchants SET wallet_address=?, email=?, display_name=?, provider=?, status=?, balance=?, currency=?, payout_wallet=?, last_login_at=? WHERE id=?`,
    args: [
      merchant.walletAddress, merchant.email, merchant.displayName, merchant.provider,
      merchant.status, merchant.balance, merchant.currency, merchant.payoutWallet,
      merchant.lastLoginAt, merchant.id,
    ],
  });
}

export async function insertCheckout(checkout) {
  const db = getClient();
  await db.execute({
    sql: `INSERT INTO checkouts (id, merchant_id, merchant_wallet_address, merchant_name, payout_wallet, status, amount_fiat, currency, token, stablecoin_amount, exchange_rate, network_fee_usd, platform_fee_usd, display_amount, qr_payload, created_at, confirmed_at, reference, tx_hash, network, confirmation_state)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      checkout.id, checkout.merchantId, checkout.merchantWalletAddress, checkout.merchantName,
      checkout.payoutWallet, checkout.status, checkout.amountFiat, checkout.currency,
      checkout.token, checkout.stablecoinAmount, checkout.exchangeRate, checkout.networkFeeUsd,
      checkout.platformFeeUsd, checkout.displayAmount, checkout.qrPayload, checkout.createdAt,
      checkout.confirmedAt ?? null, checkout.reference ?? null, checkout.txHash ?? null,
      checkout.network ?? null, checkout.confirmationState ?? null,
    ],
  });
}

export async function getCheckoutById(id) {
  const db = getClient();
  const result = await db.execute({
    sql: `SELECT * FROM checkouts WHERE id = ?`,
    args: [id],
  });
  return result.rows[0] ? rowToCheckout(result.rows[0]) : null;
}

export async function updateCheckout(checkout) {
  const db = getClient();
  await db.execute({
    sql: `UPDATE checkouts SET status=?, confirmed_at=?, tx_hash=?, network=?, confirmation_state=? WHERE id=?`,
    args: [
      checkout.status, checkout.confirmedAt ?? null, checkout.txHash ?? null,
      checkout.network ?? null, checkout.confirmationState ?? null, checkout.id,
    ],
  });
}

export async function insertTransaction(tx) {
  const db = getClient();
  await db.execute({
    sql: `INSERT INTO transactions (id, merchant_id, checkout_id, amount_fiat, currency, token, stablecoin_amount, fee_usd, tx_hash, status, confirmed_at, display_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      tx.id, tx.merchantId, tx.checkoutId, tx.amountFiat, tx.currency, tx.token,
      tx.stablecoinAmount, tx.feeUsd, tx.txHash, tx.status, tx.confirmedAt, tx.displayAmount,
    ],
  });
}

export async function getTransactionsByMerchant(merchantId, limit = 20) {
  const db = getClient();
  const result = await db.execute({
    sql: `SELECT * FROM transactions WHERE merchant_id = ? ORDER BY confirmed_at DESC LIMIT ?`,
    args: [merchantId, limit],
  });
  return result.rows.map(rowToTransaction);
}

export async function insertWithdrawal(withdrawal) {
  const db = getClient();
  await db.execute({
    sql: `INSERT INTO withdrawals (id, merchant_id, amount, token, destination, status, created_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      withdrawal.id, withdrawal.merchantId, withdrawal.amount, withdrawal.token,
      withdrawal.destination, withdrawal.status, withdrawal.createdAt, withdrawal.completedAt,
    ],
  });
}

export async function getWithdrawalsByMerchant(merchantId, limit = 20) {
  const db = getClient();
  const result = await db.execute({
    sql: `SELECT * FROM withdrawals WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ?`,
    args: [merchantId, limit],
  });
  return result.rows.map(rowToWithdrawal);
}

export async function getCheckoutsByMerchant(merchantId) {
  const db = getClient();
  const result = await db.execute({
    sql: `SELECT * FROM checkouts WHERE merchant_id = ? AND status = 'pending'`,
    args: [merchantId],
  });
  return result.rows.map(rowToCheckout);
}

export async function listAllMerchants() {
  const db = getClient();
  const result = await db.execute(`SELECT * FROM merchants`);
  return result.rows.map(rowToMerchant);
}

// Row mappers
function rowToMerchant(row) {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    email: row.email,
    displayName: row.display_name,
    provider: row.provider,
    status: row.status,
    balance: row.balance,
    currency: row.currency,
    payoutWallet: row.payout_wallet,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function rowToCheckout(row) {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantWalletAddress: row.merchant_wallet_address,
    merchantName: row.merchant_name,
    payoutWallet: row.payout_wallet,
    status: row.status,
    amountFiat: row.amount_fiat,
    currency: row.currency,
    token: row.token,
    stablecoinAmount: row.stablecoin_amount,
    exchangeRate: row.exchange_rate,
    networkFeeUsd: row.network_fee_usd,
    platformFeeUsd: row.platform_fee_usd,
    displayAmount: row.display_amount,
    qrPayload: row.qr_payload,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    reference: row.reference,
    txHash: row.tx_hash,
    network: row.network,
    confirmationState: row.confirmation_state,
  };
}

function rowToTransaction(row) {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    checkoutId: row.checkout_id,
    amountFiat: row.amount_fiat,
    currency: row.currency,
    token: row.token,
    stablecoinAmount: row.stablecoin_amount,
    feeUsd: row.fee_usd,
    txHash: row.tx_hash,
    status: row.status,
    confirmedAt: row.confirmed_at,
    displayAmount: row.display_amount,
  };
}

function rowToWithdrawal(row) {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    amount: row.amount,
    token: row.token,
    destination: row.destination,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}
