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
