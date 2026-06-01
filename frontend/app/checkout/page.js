"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CONFIG } from '../../config.js';
import { createCheckout, confirmCheckout, fetchCheckout, patchCheckout } from '../../assets/js/chainListener.js';
import { shortAddress } from '../../assets/js/qrPayload.js';
import { getSession, loginWithWallet, saveSession } from '../../assets/js/magic.js';
import { saveLocalTransaction } from '../../assets/js/ledger.js';
import {
  createCheckoutOnChain,
  pollCheckoutPaid,
  pollUsdcTransfer,
} from '../../assets/js/gatewayContract.js';
import { getSigner, hasInjectedProvider } from '../../assets/js/wallet.js';
import { QRCodeSVG } from 'qrcode.react';
import WalletConnect from '../components/WalletConnect';
import TokenLogo from '../components/TokenLogo';

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

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recoveryId = searchParams.get('id');

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
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmPrompt, setConfirmPrompt] = useState(false);
  const [qrText, setQrText] = useState('');
  const checkoutRef = useRef(null);

  const amountLabel = useMemo(() => {
    if (!context) return '0';
    const symbol = CONFIG.currencySymbols[context.currency] ?? `${context.currency} `;
    return `${symbol}${Number(context.amount).toLocaleString()}`;
  }, [context]);

  const paymentLink = useMemo(() => {
    if (!checkout?.id || typeof window === 'undefined') return null;
    return `${window.location.origin}/pay?id=${checkout.id}`;
  }, [checkout]);

  function copyLink() {
    if (!paymentLink) return;
    navigator.clipboard.writeText(paymentLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Countdown timer — marks checkout expired in DB when it hits 0
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemaining((v) => {
        if (v <= 1) {
          clearInterval(timerRef.current);
          setStatus('Checkout expired.');
          stopPollRef.current?.();
          const id = checkoutRef.current?.id;
          if (id) patchCheckout(id, { status: 'expired' }).catch(() => {});
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  async function handleConfirmed(co, txHash) {
    const receipt = await confirmCheckout(co.id, txHash);
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
      token: tx.token ?? 'USDC',
      network: CONFIG.settlementNetwork,
      merchant: receipt.merchant?.displayName ?? co.merchantName ?? 'Merchant',
      merchantName: receipt.merchant?.displayName ?? co.merchantName ?? 'Merchant',
      fiatAmount: Number(tx.amountFiat ?? 0),
      fiatCurrency: tx.currency ?? 'USD',
      txHash: tx.txHash,
      narration: co.reference ?? '',
      timestamp: tx.confirmedAt,
    }));
    setConfirmedTx(tx);
    setOverlayVisible(true);
    setStatus(`Confirmed on ${CONFIG.settlementNetwork}.`);
    clearInterval(timerRef.current);
  }

  async function startPollingOrFallback(co, resolvedOnChainId) {
    let confirmedFlag = false;

    const onPaid = async (txHash) => {
      if (confirmedFlag) return;
      confirmedFlag = true;
      stopAllPolling();
      await handleConfirmed(co, txHash ?? randomHash());
    };

    const stopAllPolling = () => {
      stopPollRef.current?.();
      stopPollRef.current = null;
    };

    // Path A: on-chain gateway checkout — poll for CheckoutPaid event
    if (resolvedOnChainId) {
      setStatus('Waiting for on-chain payment…');
      const stopGateway = pollCheckoutPaid(resolvedOnChainId, {
        intervalMs: CONFIG.checkout.pollIntervalMs,
        timeoutMs: CONFIG.checkout.expirySeconds * 1000,
        onPaid: async ({ txHash }) => onPaid(txHash),
        onError: (err) => setStatus(err.message || 'Payment polling failed'),
      });
      stopPollRef.current = stopGateway;
    }

    // Path B: no gateway — scan chain for direct USDC/USDT transfers to payoutWallet
    if (!resolvedOnChainId && co.payoutWallet) {
      setStatus('Scanning for payment…');
      const stopTransfer = pollUsdcTransfer(co.payoutWallet, co.stablecoinAmount, {
        intervalMs: CONFIG.checkout.pollIntervalMs,
        timeoutMs: CONFIG.checkout.expirySeconds * 1000,
        onReceived: async ({ txHash }) => onPaid(txHash),
        onError: () => setStatus('Waiting for payment — confirm manually when received.'),
      });
      stopPollRef.current = stopTransfer;
    }

    // Always also poll the server — catches confirmations from the /pay page
    const serverPoll = setInterval(async () => {
      if (confirmedFlag) { clearInterval(serverPoll); return; }
      try {
        const fresh = await fetchCheckout(co.id);
        if (fresh.status === 'confirmed') {
          confirmedFlag = true;
          clearInterval(serverPoll);
          stopPollRef.current?.();
          setConfirmedTx({ txHash: fresh.txHash, stablecoinAmount: fresh.stablecoinAmount, token: fresh.token });
          setOverlayVisible(true);
          setStatus(`Confirmed on ${CONFIG.settlementNetwork}.`);
          clearInterval(timerRef.current);
        }
      } catch { /* non-fatal */ }
    }, CONFIG.checkout.pollIntervalMs);

    const prevStop = stopPollRef.current;
    stopPollRef.current = () => {
      prevStop?.();
      clearInterval(serverPoll);
    };
  }

  function setupQr(co) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setQrText(`${origin}/pay?id=${co.id}`);
  }

  // Recovery path — load existing checkout from URL ?id=
  useEffect(() => {
    if (!recoveryId) return;
    const session = getSession();
    if (session.merchant) setMerchant(session.merchant);
    let alive = true;

    (async () => {
      setStatus('Loading checkout…');
      const co = await fetchCheckout(recoveryId);
      if (!alive) return;

      if (co.status === 'confirmed') {
        setCheckout(co);
        setStatus(`Already confirmed on ${CONFIG.settlementNetwork}.`);
        return;
      }

      setCheckout(co);
      checkoutRef.current = co;
      setContext({
        amount: co.amountFiat,
        usd: co.stablecoinAmount,
        currency: co.currency,
        merchant: session.merchant,
      });

      // Restore remaining time from expiresAt if available
      if (co.expiresAt) {
        const secsLeft = Math.max(0, Math.floor((new Date(co.expiresAt) - Date.now()) / 1000));
        setRemaining(secsLeft);
        if (secsLeft === 0) {
          setStatus('Checkout expired.');
          return;
        }
      } else {
        setRemaining(CONFIG.checkout.expirySeconds);
      }

      const resumeOnChainId = co.onChainCheckoutId ?? null;
      if (resumeOnChainId) setOnChainId(resumeOnChainId);

      setupQr(co);
      await startPollingOrFallback(co, resumeOnChainId);
    })().catch((err) => {
      if (alive) setStatus(err.message || 'Could not load checkout');
    });

    return () => { alive = false; stopPollRef.current?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoveryId]);

  // Normal creation path
  useEffect(() => {
    if (recoveryId) return;
    const current = readChargeContext();
    if (!current.merchant?.id) { router.replace('/onboarding'); return; }
    setMerchant(current.merchant);
    setContext(current);
  }, [router, recoveryId]);

  useEffect(() => {
    if (recoveryId || !context?.merchant?.id) return;
    let alive = true;

    (async () => {
      // Re-auth to ensure merchant exists in server DB
      let activeMerchant = context.merchant;
      const walletAddress = activeMerchant.walletAddress || activeMerchant.email;
      if (walletAddress) {
        try {
          const session = await loginWithWallet(walletAddress);
          saveSession(session);
          activeMerchant = session.merchant;
          setMerchant(activeMerchant);
        } catch { /* use cached */ }
      }

      // Create on server
      const created = await createCheckout({
        merchantId: activeMerchant.id,
        amountFiat: Number(context.amount),
        currency: context.currency,
        token: 'USDC',
        reference: sessionStorage.getItem(CONFIG.storage.checkoutReference) || `ORDER-${Date.now()}`,
      });
      if (!alive) return;
      setCheckout(created);
      checkoutRef.current = created;
      setRemaining(CONFIG.checkout.expirySeconds);

      // Update URL so the link is shareable / recoverable
      window.history.replaceState({}, '', `/checkout?id=${created.id}`);

      // Try on-chain registration
      let resolvedOnChainId = null;
      if (hasInjectedProvider()) {
        try {
          const signer = await getSigner();
          if (signer) {
            setContractPhase('Check MetaMask — approve if prompted…');
            const expiresAt = new Date(Date.now() + CONFIG.checkout.expirySeconds * 1000).toISOString();
            const { onChainCheckoutId } = await createCheckoutOnChain(signer, {
              serverCheckoutId: created.id,
              stablecoinAmount: created.stablecoinAmount,
            });
            resolvedOnChainId = onChainCheckoutId;
            setOnChainId(onChainCheckoutId);
            setContractPhase('On-chain checkout active.');
            // Persist the on-chain ID so recovery can resume polling
            patchCheckout(created.id, { onChainCheckoutId, expiresAt }).catch(() => {});
          }
        } catch (err) {
          setContractPhase(`On-chain unavailable: ${err.shortMessage || err.message}`);
        }
      }

      setupQr(created);
      if (alive) await startPollingOrFallback(created, resolvedOnChainId);
    })().catch((err) => {
      if (alive) setStatus(err.message || 'Unable to create checkout');
    });

    return () => {
      alive = false;
      stopPollRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

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
                <div style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontWeight: 800, fontSize: 'clamp(20px, 5vw, 32px)', letterSpacing: '-0.05em' }}>
                  {amountLabel}
                </div>
                <div className="help" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TokenLogo token={checkout?.token || 'USDC'} size={13} />
                  {Number(context?.usd || 0).toFixed(2)} {checkout?.token || 'USDC'}
                </div>
              </div>
              <div className="pill" style={{ fontSize: 11 }}>
                <span className="badge-icon">●</span>{CONFIG.settlementNetwork}
              </div>
            </div>

            <div className="qr-shell" style={{ width: 'fit-content', margin: '16px auto 10px' }}>
              <div className="scan-ring" />
              <div className="qr-box">
                {qrText ? (
                  <QRCodeSVG
                    value={qrText}
                    size={160}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="H"
                  />
                ) : (
                  <div style={{ width: 160, height: 160, display: 'grid', placeItems: 'center', color: '#aaa', fontSize: 12 }}>
                    Generating…
                  </div>
                )}
              </div>
            </div>

            {onChainId && (
              <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--amber)', marginBottom: 6 }}>
                On-chain checkout active — scan to pay via gateway
              </p>
            )}

            {/* Payment link row */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '7px 10px', fontSize: 11, color: 'var(--muted)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {paymentLink ?? 'Generating link…'}
              </div>
              <button
                className="button"
                style={{ fontSize: 11, padding: '7px 12px', flexShrink: 0 }}
                onClick={copyLink}
                disabled={!paymentLink}
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button
                className="button"
                style={{ fontSize: 11, padding: '7px 12px', flexShrink: 0 }}
                onClick={() => navigator.clipboard?.writeText(checkout?.qrPayload ?? '').catch(() => {})}
                disabled={!checkout}
              >
                Copy QR
              </button>
            </div>

            <div className="divider" style={{ margin: '10px 0' }} />

            <div className="wallet-row">
              <div>
                <div className="section-label">Recipient</div>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.03em' }}>
                  {shortAddress(
                    context?.merchant?.payoutWallet ||
                    checkout?.payoutWallet ||
                    merchant?.payoutWallet || ''
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Checkout ID</div>
                <div style={{ fontSize: 10, color: 'var(--muted-2)', fontFamily: 'monospace' }}>
                  {checkout?.id ?? '—'}
                </div>
              </div>
            </div>

            <div className="divider" style={{ margin: '10px 0' }} />
            <p className="hero-subtitle" style={{ fontSize: 12 }}>{status}</p>
            {contractPhase && (
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{contractPhase}</p>
            )}

            {/* Manual confirm — two-step to prevent accidental taps */}
            {!onChainId && checkout && !confirmedTx && (
              !confirmPrompt ? (
                <button
                  className="button"
                  style={{ width: '100%', marginTop: 10, fontSize: 13 }}
                  onClick={() => setConfirmPrompt(true)}
                >
                  Mark as received
                </button>
              ) : (
                <div style={{ marginTop: 10, background: 'rgba(27,229,0,0.06)', border: '1px solid rgba(27,229,0,0.2)', borderRadius: 12, padding: '12px 14px' }}>
                  <p style={{ fontSize: 12, color: 'var(--text)', margin: '0 0 10px' }}>
                    Confirm you received <strong>{Number(checkout.stablecoinAmount).toFixed(2)} {checkout.token}</strong> from the customer?
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="button primary"
                      style={{ flex: 1, fontSize: 12 }}
                      disabled={confirming}
                      onClick={async () => {
                        setConfirming(true);
                        try {
                          await handleConfirmed(checkoutRef.current ?? checkout, randomHash());
                        } catch (err) {
                          setStatus(err.message || 'Confirmation failed');
                          setConfirmPrompt(false);
                        } finally {
                          setConfirming(false);
                        }
                      }}
                    >
                      {confirming ? 'Confirming…' : 'Yes, confirm'}
                    </button>
                    <button
                      className="button ghost"
                      style={{ flex: 1, fontSize: 12 }}
                      onClick={() => setConfirmPrompt(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            )}
          </article>

          <aside className="summary-card">
            <p className="section-label">Settlement summary</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                { label: 'Token', value: checkout?.token || 'USDC', token: checkout?.token || 'USDC' },
                { label: 'Network', value: CONFIG.settlementNetwork },
                { label: 'Merchant', value: context?.merchant?.displayName || merchant?.displayName || 'Merchant' },
              ].map(({ label, value, token }) => (
                <div key={label} className="metric">
                  <div className="metric-label">{label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 15, fontWeight: 800, letterSpacing: '-0.04em' }}>
                    {token && <TokenLogo token={token} size={16} />}
                    {value}
                  </div>
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
          <h2 className="hero-title" style={{ fontSize: 'clamp(20px, 5vw, 34px)' }}>Settlement complete.</h2>
          <p className="hero-subtitle">
            Confirmed on {CONFIG.settlementNetwork} for {context?.merchant?.displayName || merchant?.displayName || 'the merchant'}.
          </p>
          <div className="summary-card" style={{ marginTop: 12 }}>
            <div className="receipt-row">
              <span className="muted" style={{ fontSize: 12 }}>Amount</span>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TokenLogo token={confirmedTx?.token || 'USDC'} size={14} />
                {Number(confirmedTx?.stablecoinAmount || context?.usd || 0).toFixed(2)} {confirmedTx?.token || 'USDC'}
              </strong>
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

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutContent />
    </Suspense>
  );
}
