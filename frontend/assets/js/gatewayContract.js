/**
 * MorphSwiftGateway on-chain interactions (ethers v6).
 *
 * Three entry points used by the app:
 *   registerMerchantOnChain(signer)              — called once at onboarding
 *   createCheckoutOnChain(signer, params)         — called per checkout
 *   pollCheckoutPaid(onChainId, handlers)         — replaces fake 4-second confirm
 */

import { ethers } from 'ethers';
import { CONFIG } from '../../config.js';
import { loadGatewayAbi } from './contract.js';
import { getProvider } from './wallet.js';

// ─── ABIs ───────────────────────────────────────────────────────────────────

export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

let _gatewayAbi = null;

export async function GATEWAY_ABI() {
  if (!_gatewayAbi) {
    _gatewayAbi = await loadGatewayAbi();
  }
  return _gatewayAbi;
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function gatewayContract(signerOrProvider) {
  const abi = await loadGatewayAbi();
  return new ethers.Contract(CONFIG.contract.gatewayAddress, abi, signerOrProvider);
}

/** Replicate the contract's deriveMerchantId via a pure view call (no gas). */
export async function deriveMerchantId(walletAddress) {
  const provider = getProvider();
  if (!provider) throw new Error('No wallet provider connected');
  const contract = await gatewayContract(provider);
  return contract.deriveMerchantId(walletAddress, ethers.ZeroHash);
}

/** Replicate the contract's deriveCheckoutId via a pure view call. */
export async function deriveCheckoutId(merchantId, orderRef) {
  const provider = getProvider();
  if (!provider) throw new Error('No wallet provider connected');
  const contract = await gatewayContract(provider);
  return contract.deriveCheckoutId(merchantId, orderRef);
}

// ─── merchant registration ───────────────────────────────────────────────────

/**
 * Register the connected wallet as a merchant on-chain.
 * Safe to call multiple times — skips if already registered.
 * Returns the on-chain merchantId (bytes32).
 */
export async function registerMerchantOnChain(signer) {
  const address = await signer.getAddress();
  const contract = await gatewayContract(signer);
  const merchantId = await deriveMerchantId(address);

  // Check if already registered — getMerchant reverts if not found
  try {
    await contract.getMerchant(merchantId);
    return { merchantId, alreadyRegistered: true };
  } catch {
    // Not registered yet — proceed
  }

  const tx = await contract.registerMerchant(
    merchantId,
    address,       // payoutWallet must equal msg.sender
    ethers.ZeroHash,
    0,             // feeBps — use contract default
  );
  const receipt = await tx.wait();
  return { merchantId, alreadyRegistered: false, txHash: receipt.hash };
}

/**
 * Update the merchant's on-chain payout wallet.
 * Only the merchant operator can call this.
 * Used to fix registrations with incorrect payout wallet.
 */
export async function updateMerchantPayoutWallet(signer, newPayoutWallet) {
  const address = await signer.getAddress();
  const contract = await gatewayContract(signer);
  const merchantId = await deriveMerchantId(address);

  // Fetch current merchant data to preserve other fields
  const current = await contract.getMerchant(merchantId);

  const tx = await contract.updateMerchant(
    merchantId,
    newPayoutWallet,      // The corrected payout wallet
    current.active,       // Keep current active status
    current.metadataHash, // Keep current metadata
    current.feeBps,       // Keep current fees
  );
  const receipt = await tx.wait();
  return { merchantId, newPayoutWallet, txHash: receipt.hash };
}

// ─── checkout creation ───────────────────────────────────────────────────────

/**
 * Register a checkout on-chain so payCheckout can be called.
 * Returns { onChainCheckoutId, txHash }.
 */
export async function createCheckoutOnChain(signer, {
  serverCheckoutId,
  stablecoinAmount,
  expirySeconds = CONFIG.checkout.expirySeconds ?? 900,
}) {
  const address = await signer.getAddress();
  const contract = await gatewayContract(signer);
  const merchantId = await deriveMerchantId(address);

  // Auto-register if not on-chain yet (covers cases where onboarding tx was missed)
  try {
    await contract.getMerchant(merchantId);
  } catch {
    const tx = await contract.registerMerchant(
      merchantId,
      address,
      ethers.ZeroHash,
      0,
    );
    await tx.wait();
  }

  // Deterministic orderRef from the server checkout ID
  const orderRef = ethers.keccak256(ethers.toUtf8Bytes(`morphswift:${serverCheckoutId}`));
  const onChainCheckoutId = await deriveCheckoutId(merchantId, orderRef);

  // USDC uses 6 decimals
  const amountUnits = ethers.parseUnits(Number(stablecoinAmount).toFixed(6), 6);
  const expiresAt = Math.floor(Date.now() / 1000) + expirySeconds;

  const tx = await contract.createCheckout(
    onChainCheckoutId,
    merchantId,
    CONFIG.contract.usdcAddress,
    amountUnits,
    expiresAt,
    orderRef,
  );
  const receipt = await tx.wait();
  return { onChainCheckoutId, txHash: receipt.hash };
}

// ─── payment polling ─────────────────────────────────────────────────────────

/**
 * Poll the chain until the checkout is paid or the timeout fires.
 * Returns a stop() function to cancel polling.
 *
 * handlers:
 *   onPaid({ txHash, payer })  — checkout confirmed on-chain
 *   onError(err)               — unrecoverable error or timeout
 *   intervalMs                 — poll interval (default 3 s)
 *   timeoutMs                  — give up after this long (default 14 min)
 */
export function pollCheckoutPaid(onChainCheckoutId, handlers = {}) {
  const {
    onPaid,
    onError,
    intervalMs = 3000,
    timeoutMs = 840_000,
  } = handlers;

  let stopped = false;
  const started = Date.now();

  (async () => {
    let contract;
    try {
      const provider = getProvider();
      if (!provider) throw new Error('No wallet provider');
      contract = await gatewayContract(provider);
    } catch (err) {
      onError?.(err);
      return;
    }

    const check = async () => {
      if (stopped) return;

      if (Date.now() - started > timeoutMs) {
        onError?.(new Error('Checkout expired without payment'));
        return;
      }

      try {
        const result = await contract.getCheckout(onChainCheckoutId);
        if (result.paid) {
          // Find the CheckoutPaid event for the real tx hash
          let txHash = null;
          try {
            const filter = contract.filters.CheckoutPaid(onChainCheckoutId);
            const logs = await contract.queryFilter(filter, -500);
            txHash = logs[0]?.transactionHash ?? null;
          } catch {
            // non-fatal — we still have confirmation, just no tx hash
          }
          onPaid?.({ txHash, payer: result.payer });
          return;
        }
      } catch {
        // Checkout may not be on-chain yet — keep polling
      }

      if (!stopped) setTimeout(check, intervalMs);
    };

    check();
  })();

  return () => { stopped = true; };
}

// ─── on-chain token balances ─────────────────────────────────────────────────

let _rpcProvider = null;
function getRpcProvider() {
  if (!_rpcProvider) {
    _rpcProvider = new ethers.JsonRpcProvider(CONFIG.contract.rpcUrls[0]);
  }
  return _rpcProvider;
}

/**
 * Fetch real on-chain USDC and USDT balances for a wallet address.
 * Uses the public Morph Hoodi RPC — no wallet connection required.
 * Returns { usdc, usdt } as human-readable numbers (already divided by decimals).
 */
export async function fetchOnChainBalances(walletAddress) {
  if (!walletAddress) return { usdc: 0, usdt: 0 };
  const provider = getRpcProvider();

  const usdc = new ethers.Contract(CONFIG.contract.usdcAddress, ERC20_ABI, provider);
  const usdt = new ethers.Contract(CONFIG.contract.usdtAddress, ERC20_ABI, provider);

  const [usdcRaw, usdcDec, usdtRaw, usdtDec] = await Promise.all([
    usdc.balanceOf(walletAddress),
    usdc.decimals(),
    usdt.balanceOf(walletAddress),
    usdt.decimals(),
  ]);

  return {
    usdc: Number(ethers.formatUnits(usdcRaw, usdcDec)),
    usdt: Number(ethers.formatUnits(usdtRaw, usdtDec)),
  };
}

// ─── USDC/USDT transfer detection (no-contract path) ─────────────────────────

const ERC20_TRANSFER_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

/**
 * Scan recent blocks for a USDC or USDT transfer to payoutWallet matching amount.
 * Used when the checkout has no onChainCheckoutId (direct transfer path).
 *
 * Checks last 2000 blocks for past transfers first (recovery), then polls.
 * Returns a stop() function to cancel polling.
 *
 * handlers: onReceived({ txHash, token }), onError(err), intervalMs, timeoutMs
 */
export function pollUsdcTransfer(payoutWallet, stablecoinAmount, handlers = {}) {
  const { onReceived, onError, intervalMs = 4000, timeoutMs = 870_000 } = handlers;
  const provider = getRpcProvider();
  let stopped = false;
  const started = Date.now();

  // Allow 2% tolerance to account for fee deductions
  const amountUnits = ethers.parseUnits(Number(stablecoinAmount).toFixed(6), 6);
  const minAmount = (amountUnits * 98n) / 100n;

  async function scanBlocks(fromBlock, toBlock) {
    for (const [tokenAddr, symbol] of [
      [CONFIG.contract.usdcAddress, 'USDC'],
      [CONFIG.contract.usdtAddress, 'USDT'],
    ]) {
      const contract = new ethers.Contract(tokenAddr, ERC20_TRANSFER_ABI, provider);
      try {
        const events = await contract.queryFilter(
          contract.filters.Transfer(null, payoutWallet),
          fromBlock,
          toBlock,
        );
        for (const ev of events) {
          if (ev.args.value >= minAmount) {
            return { txHash: ev.transactionHash, token: symbol };
          }
        }
      } catch { /* RPC may limit block range — non-fatal */ }
    }
    return null;
  }

  (async () => {
    try {
      const currentBlock = await provider.getBlockNumber();

      // Check history first (recovers payments that already happened)
      const historical = await scanBlocks(Math.max(0, currentBlock - 2000), currentBlock);
      if (historical && !stopped) { onReceived?.(historical); return; }

      // Then poll for new incoming transfers
      let lastBlock = currentBlock;
      const check = async () => {
        if (stopped) return;
        if (Date.now() - started > timeoutMs) { onError?.(new Error('Payment timeout')); return; }
        try {
          const tip = await provider.getBlockNumber();
          if (tip > lastBlock) {
            const found = await scanBlocks(lastBlock + 1, tip);
            lastBlock = tip;
            if (found) { onReceived?.(found); return; }
          }
        } catch { /* keep polling */ }
        if (!stopped) setTimeout(check, intervalMs);
      };
      setTimeout(check, intervalMs);
    } catch (err) {
      if (!stopped) onError?.(err);
    }
  })();

  return () => { stopped = true; };
}

// ─── QR payment URI ──────────────────────────────────────────────────────────

/**
 * Build an EIP-681 URI that asks the customer's wallet to call
 * payCheckout(onChainCheckoutId) on the gateway.
 *
 * Compatible wallets will prompt the user to approve the USDC spend
 * and execute the contract call in one step.
 */
export function buildPayCheckoutUri(onChainCheckoutId) {
  const chainId = CONFIG.contract.chainId;
  const gateway = CONFIG.contract.gatewayAddress;
  // EIP-681: ethereum:<address>@<chainId>/<function>?<params>
  return `ethereum:${gateway}@${chainId}/payCheckout?bytes32=${onChainCheckoutId}`;
}
