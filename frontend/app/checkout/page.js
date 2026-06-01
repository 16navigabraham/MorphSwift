"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONFIG } from '../../config.js';
import { createCheckout, confirmCheckout } from '../../assets/js/chainListener.js';
import { buildPaymentUri, shortAddress } from '../../assets/js/qrPayload.js';
import { getSession, loginWithWallet, saveSession } from '../../assets/js/magic.js';
import { saveLocalTransaction } from '../../assets/js/ledger.js';
import {
  createCheckoutOnChain,
  pollCheckoutPaid,
  buildPayCheckoutUri,
} from '../../assets/js/gatewayContract.js';
import { getSigner, hasInjectedProvider } from '../../assets/js/wallet.js';
import WalletConnect from '../components/WalletConnect';

function readChargeContext() {
  const amount = sessionStorage.getItem(CONFIG.storage.chargeAmount) || '0';
  const usd = sessionStorage.getItem(CONFIG.storage.chargeUsd) || '0';
  const currency = sessionStorage.getItem(CONFIG.storage.chargeCurrency) || 'PHP';
  const merchant = getSession().merchant || JSON.parse(sessionStorage.getItem(CONFIG.storage.activeMerchant) || 'null');
  return { amount, usd, currency, merchant };
}

function randomHash() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function ensureQrScript() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.QRCode) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector('script[data-qrcode="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.dataset.qrcode = 'true';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export default function CheckoutPage() {
  const router = useRouter();
  const qrRef = useRef(null);
  const stopPollRef = useRef(null);
  const timerRef = useRef(null);
  const [status, setStatus] = useState('Preparing checkout…');
  const [remaining, setRemaining] = useState(CONFIG.checkout.expirySeconds);
  const [merchant, setMerchant] = useState(null);
  const [context, setContext] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [confirmedTx, setConfirmedTx] = useState(null);
  const [onChainId, setOnChainId] = useState(null);
  const [contractPhase, setContractPhase] = useState('');

  const amountLabel = useMemo(() => {
    if (!context) return '0';
    const symbol = CONFIG.currencySymbols[context.currency] ?? `${context.currency} `;
    return `${symbol}${Number(context.amount).toLocaleString()}`;
  }, [context]);

  useEffect(() => {
    const current = readChargeContext();
    if (!current.merchant?.id) { router.replace('/onboarding'); return; }
    setMerchant(current.merchant);
    setContext(current);
  }, [router]);

  // Countdown timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemaining((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Main checkout flow
  useEffect(() => {
    if (!context?.merchant?.id) return;
    let alive = true;

    (async () => {
      // 0. Re-authenticate to ensure merchant exists in server DB.
      //    The server DB may be fresh (restart/ephemeral disk) while the
      //    browser still holds a stale merchantId in localStorage.
      let activeMerchant = context.merchant;
      const walletAddress = activeMerchant.walletAddress || activeMerchant.email;
      if (walletAddress) {
        try {
          const session = await loginWithWallet(walletAddress);
          saveSession(session);
          activeMerchant = session.merchant;
          setMerchant(activeMerchant);
        } catch {
          // non-fatal — proceed with cached merchant, will fail later if truly missing
        }
      }

      // 1. Create checkout on the server
      const created = await createCheckout({
        merchantId: activeMerchant.id,
        amountFiat: Number(context.amount),
        currency: context.currency,
        token: 'USDC',
        reference: sessionStorage.getItem(CONFIG.storage.checkoutReference) || `ORDER-${Date.now()}`,
      });
      if (!alive) return;
      setCheckout(created);
      setRemaining(CONFIG.checkout.expirySeconds);

      // 2. Attempt on-chain checkout creation if wallet is connected
      let resolvedOnChainId = null;
      if (hasInjectedProvider()) {
        try {
          const signer = await getSigner();
          if (signer) {
            setContractPhase('Check MetaMask — approve registration if prompted…');
            const { onChainCheckoutId } = await createCheckoutOnChain(signer, {
              serverCheckoutId: created.id,
              stablecoinAmount: created.stablecoinAmount,
            });
            resolvedOnChainId = onChainCheckoutId;
            setOnChainId(onChainCheckoutId);
            setContractPhase('On-chain checkout active.');
          }
        } catch (err) {
          setContractPhase(`On-chain unavailable: ${err.shortMessage || err.message}`);
        }
      }

      // 3. Render QR — prefer payCheckout URI if on-chain id available
      const qrReady = await ensureQrScript();
      if (alive && qrReady && qrRef.current) {
        qrRef.current.innerHTML = '';
        const qrText = resolvedOnChainId
          ? buildPayCheckoutUri(resolvedOnChainId)
          : buildPaymentUri({
              address: created.payoutWallet || created.merchantId,
              amount: created.stablecoinAmount,
              token: created.token,
              network: created.network || CONFIG.settlementNetwork,
            });
        new window.QRCode(qrRef.current, {
          text: qrText,
          width: 160,
          height: 160,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.H,
        });
      }

      // 4a. If on-chain — poll for real CheckoutPaid event
      if (resolvedOnChainId) {
        setStatus('Waiting for on-chain payment…');
        stopPollRef.current = pollCheckoutPaid(resolvedOnChainId, {
          intervalMs: CONFIG.checkout.pollIntervalMs,
          timeoutMs: CONFIG.checkout.expirySeconds * 1000,
          onPaid: async ({ txHash }) => {
            if (!alive) return;
            await handleConfirmed(created, txHash ?? randomHash());
          },
          onError: (err) => {
            if (alive) setStatus(err.message || 'Payment polling failed');
          },
        });
        return;
      }

      // 4b. Fallback — simulate confirmation after 4 s (no wallet / no contract)
      setStatus('Listening for transaction…');
      setTimeout(async () => {
        if (!alive) return;
        await handleConfirmed(created, randomHash()).catch((err) => {
          setStatus(err.message || 'Payment failed');
        });
      }, 4000);
    })().catch((err) => {
      if (alive) setStatus(err.message || 'Unable to create checkout');
    });

    return () => {
      alive = false;
      stopPollRef.current?.();
    };
  }, [context]);

  async function handleConfirmed(created, txHash) {
    const receipt = await confirmCheckout(created.id, txHash);
    const tx = receipt.transaction;

    saveLocalTransaction({
      id: tx.id,
      timestamp: tx.confirmedAt,
      usdAmount: Number(tx.stablecoinAmount ?? tx.amountFiat ?? 0),
      fiatAmount: Number(tx.amountFiat ?? 0),
      fiatCurrency: tx.currency ?? 'USD',
      token: tx.token ?? 'USDC',
      network: CONFIG.settlementNetwork,
      status: 'confirmed',
      hash: tx.txHash,
    });

    sessionStorage.setItem(CONFIG.storage.payerReceipt, JSON.stringify({
      status: 'sent',
      amount: Number(tx.stablecoinAmount ?? 0).toFixed(2),
      usdAmount: Number(tx.stablecoinAmount ?? 0).toFixed(2),
      token: tx.token ?? 'USDC',
      network: CONFIG.settlementNetwork,
      merchant: receipt.merchant?.displayName ?? created.merchantName ?? 'Merchant',
      merchantName: receipt.merchant?.displayName ?? created.merchantName ?? 'Merchant',
      fiatAmount: Number(tx.amountFiat ?? 0),
      fiatCurrency: tx.currency ?? 'USD',
      txHash: tx.txHash,
      narration: created.reference ?? '',
      timestamp: tx.confirmedAt,
    }));

    setConfirmedTx(tx);
    setOverlayVisible(true);
    setStatus(`Confirmed on ${CONFIG.settlementNetwork}.`);
    clearInterval(timerRef.current);
  }

  const timerText = remaining > 0
    ? `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
    : 'Expired';

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <a className="button ghost" href="/terminal">← Back</a>
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>Checkout</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge">{timerText}</span>
          <WalletConnect />
        </div>
      </header>

      <section className="page stack">
        <div className="grid-2">
          <article className="card">
            <div className="amount-strip" style={{ padding: 0, border: 0, marginBottom: 12 }}>
              <div>
                <div className="section-label">Amount due</div>
                <div className="amount-strip-value" style={{ fontSize: 'clamp(20px, 5vw, 34px)', letterSpacing: '-0.05em', fontFamily: 'var(--font-display), system-ui, sans-serif', fontWeight: 800 }}>
                  {amountLabel}
                </div>
                <div className="help">{Number(context?.usd || 0).toFixed(2)} USDC</div>
              </div>
              <div className="pill" style={{ fontSize: 11 }}>
                <span className="badge-icon">●</span>{CONFIG.settlementNetwork}
              </div>
            </div>

            <div className="qr-shell" style={{ width: 'fit-content', margin: '18px auto 10px' }}>
              <div className="scan-ring" />
              <div className="qr-box" ref={qrRef} />
            </div>

            {onChainId && (
              <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--amber)', marginBottom: 8 }}>
                On-chain checkout active — scan to pay via gateway
              </p>
            )}

            <div className="wallet-row" style={{ marginTop: 12 }}>
              <div>
                <div className="section-label">Recipient</div>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.03em' }}>
                  {shortAddress(context?.merchant?.payoutWallet || checkout?.payoutWallet || merchant?.id || '')}
                </div>
              </div>
              <button className="button" style={{ fontSize: 12 }}
                onClick={() => navigator.clipboard?.writeText(checkout?.qrPayload ?? '').catch(() => {})}>
                Copy QR
              </button>
            </div>

            <div className="divider" />
            <p className="hero-subtitle" style={{ fontSize: 12 }}>{status}</p>
            {contractPhase && (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{contractPhase}</p>
            )}
          </article>

          <aside className="summary-card">
            <p className="section-label">Settlement summary</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                { label: 'Token', value: checkout?.token || 'USDC' },
                { label: 'Network', value: CONFIG.settlementNetwork },
                { label: 'Merchant', value: context?.merchant?.displayName || merchant?.displayName || 'Merchant' },
              ].map(({ label, value }) => (
                <div key={label} className="metric">
                  <div className="metric-label">{label}</div>
                  <div className="metric-value" style={{ fontSize: 16 }}>{value}</div>
                </div>
              ))}
            </div>
            <div className="button-row" style={{ marginTop: 14 }}>
              <button className="button primary" onClick={() => setOverlayVisible(true)} disabled={!confirmedTx}>
                View receipt
              </button>
              <button className="button" onClick={() => router.push('/terminal')}>New payment</button>
            </div>
          </aside>
        </div>
      </section>

      <div className={`overlay ${overlayVisible ? 'visible' : ''}`}>
        <div className="overlay-card">
          <p className="section-label">Payment confirmed</p>
          <h2 className="hero-title" style={{ fontSize: 'clamp(22px, 5vw, 36px)' }}>Settlement complete.</h2>
          <p className="hero-subtitle">
            Confirmed on {CONFIG.settlementNetwork} for {context?.merchant?.displayName || merchant?.displayName || 'the merchant'}.
          </p>
          <div className="summary-card" style={{ marginTop: 12 }}>
            <div className="receipt-row">
              <span className="muted" style={{ fontSize: 12 }}>Amount</span>
              <strong>{Number(confirmedTx?.stablecoinAmount || context?.usd || 0).toFixed(2)} USDC</strong>
            </div>
            <div className="receipt-row" style={{ marginTop: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Tx hash</span>
              <strong style={{ fontSize: 11, wordBreak: 'break-all' }}>{confirmedTx?.txHash || '—'}</strong>
            </div>
          </div>
          <div className="button-row" style={{ marginTop: 14 }}>
            <a className="button primary" href="/sender">View receipt</a>
            <a className="button" href="/ledger">Open ledger</a>
            <button className="button" onClick={() => router.push('/terminal')}>Close</button>
          </div>
        </div>
      </div>
    </main>
  );
}
