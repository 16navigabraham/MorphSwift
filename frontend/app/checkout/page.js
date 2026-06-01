"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONFIG } from '../../config.js';
import { createCheckout, confirmCheckout } from '../../assets/js/chainListener.js';
import { buildPaymentUri, shortAddress } from '../../assets/js/qrPayload.js';
import { getSession } from '../../assets/js/magic.js';
import { saveLocalTransaction } from '../../assets/js/ledger.js';

function readChargeContext() {
  const amount = sessionStorage.getItem(CONFIG.storage.chargeAmount) || '0';
  const usd = sessionStorage.getItem(CONFIG.storage.chargeUsd) || '0';
  const currency = sessionStorage.getItem(CONFIG.storage.chargeCurrency) || 'PHP';
  const merchant = getSession().merchant || JSON.parse(sessionStorage.getItem('morphswift-active-merchant') || 'null');
  return { amount, usd, currency, merchant };
}

function randomHash() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `0x${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
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

import WalletConnect from '../components/WalletConnect';

export default function CheckoutPage() {
  const router = useRouter();
  const qrRef = useRef(null);
  const checkoutRef = useRef(null);
  const timerRef = useRef(null);
  const confirmRef = useRef(null);
  const [status, setStatus] = useState('Preparing checkout…');
  const [remaining, setRemaining] = useState(CONFIG.checkout.expirySeconds);
  const [merchant, setMerchant] = useState(null);
  const [context, setContext] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [confirmedTx, setConfirmedTx] = useState(null);

  const amountLabel = useMemo(() => {
    if (!context) return '0';
    const symbol = context.currency === 'PHP' ? '₱' : `${context.currency} `;
    return `${symbol}${Number(context.amount).toLocaleString()}`;
  }, [context]);

  useEffect(() => {
    const current = readChargeContext();
    if (!current.merchant?.id) {
      router.replace('/onboarding');
      return;
    }

    setMerchant(current.merchant);
    setContext(current);
  }, [router]);

  useEffect(() => {
    if (!context?.merchant?.id) return;
    let alive = true;

    (async () => {
      const created = await createCheckout({
        merchantId: context.merchant.id,
        amountFiat: Number(context.amount),
        currency: context.currency,
        token: 'USDC',
        reference: sessionStorage.getItem('morphswift-checkout-reference') || `ORDER-${Date.now()}`,
      });
      if (!alive) return;
      setCheckout(created);
      checkoutRef.current = created;
      setRemaining(CONFIG.checkout.expirySeconds);
      setStatus('Listening for transaction…');

      const qrReady = await ensureQrScript();
      if (alive && qrReady && qrRef.current) {
        qrRef.current.innerHTML = '';
        new window.QRCode(qrRef.current, {
          text: buildPaymentUri({
            address: created.payoutWallet || created.merchantId,
            amount: created.stablecoinAmount,
            token: created.token,
            network: created.network || CONFIG.settlementNetwork,
          }),
          width: 160,
          height: 160,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.H,
        });
      }

      confirmRef.current = setTimeout(async () => {
        try {
          const receipt = await confirmCheckout(created.id, randomHash());
          const tx = receipt.transaction;
          setConfirmedTx(tx);
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
          sessionStorage.setItem('morphswift-payer-receipt', JSON.stringify({
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
          setOverlayVisible(true);
          setStatus(`Confirmed on ${CONFIG.settlementNetwork}.`);
        } catch (error) {
          setStatus(error.message || 'Payment failed');
        }
      }, 4000);
    })();

    return () => {
      alive = false;
      clearInterval(timerRef.current);
      clearTimeout(confirmRef.current);
    };
  }, [context]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    timerRef.current = timer;
    return () => clearInterval(timer);
  }, []);

  function newPayment() {
    router.push('/terminal');
  }

  function copyQr() {
    if (!checkout?.qrPayload) return;
    navigator.clipboard?.writeText(checkout.qrPayload).catch(() => {});
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
          <span>MorphSwift Checkout</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                <div className="amount-strip-value">{amountLabel}</div>
                <div className="help">{Number(context?.usd || 0).toFixed(2)} USDC</div>
              </div>
              <div className="pill"><span className="badge-icon">●</span>{CONFIG.settlementNetwork}</div>
            </div>

            <div className="qr-shell" style={{ width: 'fit-content', margin: '22px auto 12px' }}>
              <div className="scan-ring" />
              <div className="qr-box" ref={qrRef} />
            </div>

            <div className="wallet-row" style={{ marginTop: 14 }}>
              <div>
                <div className="section-label">Recipient</div>
                <div className="receipt-value" style={{ fontSize: 20 }}>{shortAddress(context?.merchant?.payoutWallet || checkout?.payoutWallet || checkout?.merchantId || merchant?.id || '')}</div>
              </div>
              <button className="button" onClick={copyQr}>Copy QR</button>
            </div>

            <div className="divider" />
            <p className="hero-subtitle">{status}</p>
          </article>

          <aside className="summary-card">
            <p className="section-label">Settlement summary</p>
            <div className="metrics-grid">
              <div className="metric">
                <div>
                  <div className="metric-label">Token</div>
                  <div className="metric-value">{checkout?.token || 'USDC'}</div>
                </div>
              </div>
              <div className="metric">
                <div>
                  <div className="metric-label">Network</div>
                  <div className="metric-value">{CONFIG.settlementNetwork}</div>
                </div>
              </div>
              <div className="metric">
                <div>
                  <div className="metric-label">Merchant</div>
                  <div className="metric-value">{context?.merchant?.displayName || merchant?.displayName || 'Merchant'}</div>
                </div>
              </div>
            </div>

            <div className="button-row" style={{ marginTop: 14 }}>
              <button className="button primary" onClick={() => setOverlayVisible(true)} disabled={!confirmedTx}>
                View receipt
              </button>
              <button className="button" onClick={newPayment}>New payment</button>
            </div>
          </aside>
        </div>
      </section>

      <div className={`overlay ${overlayVisible ? 'visible' : ''}`}>
        <div className="overlay-card">
          <p className="section-label">Payment confirmed</p>
          <h2 className="hero-title" style={{ fontSize: 'clamp(26px, 5vw, 40px)' }}>Settlement complete.</h2>
          <p className="hero-subtitle">
            Confirmed on {CONFIG.settlementNetwork} for {context?.merchant?.displayName || merchant?.displayName || 'the merchant'}.
          </p>
          <div className="summary-card" style={{ marginTop: 14 }}>
            <div className="receipt-row">
              <span className="muted">Amount</span>
              <strong>{Number(confirmedTx?.stablecoinAmount || context?.usd || 0).toFixed(2)} USDC</strong>
            </div>
            <div className="receipt-row">
              <span className="muted">Tx hash</span>
              <strong>{confirmedTx?.txHash || '—'}</strong>
            </div>
          </div>
          <div className="button-row" style={{ marginTop: 14 }}>
            <a className="button primary" href="/sender">View customer receipt</a>
            <a className="button" href="/ledger">Open ledger</a>
            <button className="button" onClick={newPayment}>Close</button>
          </div>
        </div>
      </div>
    </main>
  );
}
