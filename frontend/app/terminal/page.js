"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CONFIG } from '../../config.js';
import { getSession } from '../../assets/js/magic.js';
import {
  convertFiatToStablecoins,
  formatFiatSymbol,
  quoteStablecoin,
  loadPriceSettings,
} from '../../assets/js/priceFeeds.js';
import { fetchOnChainBalances, updateMerchantPayoutWallet, deriveMerchantId } from '../../assets/js/gatewayContract.js';
import { getSigner } from '../../assets/js/wallet.js';
import WalletConnect from '../components/WalletConnect';
import TokenLogo from '../components/TokenLogo';

const CURRENCIES = ['PHP', 'USD', 'NGN', 'SGD'];

const PRESETS = {
  PHP: [50, 100, 200, 500, 1000],
  USD: [1, 5, 10, 20, 50],
  NGN: [500, 1000, 2000, 5000, 10000],
  SGD: [2, 5, 10, 20, 50],
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

function merchantInitials(merchant) {
  const name = merchant?.displayName || merchant?.email || 'Merchant';
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
}

function TerminalContent() {
  const router = useRouter();
  const [currency, setCurrency] = useState('PHP');
  const [raw, setRaw] = useState('');
  const [rates, setRates] = useState(null);
  const [merchant, setMerchant] = useState(null);
  const [conversion, setConversion] = useState({ USDC: 0, USDT: 0, usd: 0 });
  const [onChainBalance, setOnChainBalance] = useState({ usdc: null, usdt: null });
  const [error, setError] = useState('');
  const [charging, setCharging] = useState(false);
  const [fixingPayoutWallet, setFixingPayoutWallet] = useState(false);
  const rawRef = useRef(raw);
  rawRef.current = raw;

  useEffect(() => {
    const session = getSession();
    if (!session.merchant) { router.replace('/onboarding'); return; }
    setMerchant(session.merchant);
    loadPriceSettings().then(setRates).catch(() => setRates(null));

    const walletAddress = session.merchant.walletAddress || session.merchant.payoutWallet;
    if (walletAddress?.startsWith('0x')) {
      fetchOnChainBalances(walletAddress)
        .then(setOnChainBalance)
        .catch(() => {});
    }
  }, [router]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const amount = Number.parseFloat(raw) || 0;
      const data = rates
        ? await convertFiatToStablecoins(amount, currency)
        : { USDC: 0, USDT: 0, usd: 0 };
      if (alive) setConversion(data);
    })();
    return () => { alive = false; };
  }, [raw, currency, rates]);

  const chargeNow = useCallback(async () => {
    const amountFiat = Number.parseFloat(rawRef.current);
    if (!Number.isFinite(amountFiat) || amountFiat <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    const session = getSession();
    if (!session.merchant) { router.replace('/onboarding'); return; }
    setError('');
    setCharging(true);
    try {
      const quote = await quoteStablecoin({ amountFiat, currency, token: 'USDC' });
      sessionStorage.setItem(CONFIG.storage.chargeAmount, String(amountFiat));
      sessionStorage.setItem(CONFIG.storage.chargeUsd, String(quote.stablecoinAmount));
      sessionStorage.setItem(CONFIG.storage.chargeCurrency, currency);
      sessionStorage.setItem(CONFIG.storage.checkoutData, JSON.stringify(quote));
      sessionStorage.setItem(CONFIG.storage.activeMerchant, JSON.stringify(session.merchant));
      router.push('/checkout');
    } catch (err) {
      setError(err.message || 'Unable to create quote');
      setCharging(false);
    }
  }, [currency, router]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        setRaw((v) => v.length >= 10 ? v : v === '0' ? e.key : `${v}${e.key}`);
      } else if (e.key === 'Backspace') {
        setRaw((v) => v.slice(0, -1));
      } else if (e.key === '.') {
        setRaw((v) => v.includes('.') ? v : `${v || '0'}.`);
      } else if (e.key === 'Enter') {
        chargeNow();
      } else if (e.key === 'Escape') {
        setRaw(''); setError('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chargeNow]);

  const displayValue = raw === '' ? '0' : raw;
  const currencyLabel = useMemo(() => formatFiatSymbol(currency), [currency]);
  const rateLabel = rates?.fiatRates?.[currency]
    ? `1 USDC ≈ ${currencyLabel}${Number(rates.fiatRates[currency]).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : 'Connecting to server…';

  function pressKey(key) {
    setError('');
    if (key === 'del') {
      setRaw((v) => v.slice(0, -1));
    } else if (key === '.') {
      setRaw((v) => v.includes('.') ? v : `${v || '0'}.`);
    } else {
      setRaw((v) => {
        if (v.length >= 10) return v;
        return v === '0' ? key : `${v}${key}`;
      });
    }
  }

  const fixPayoutWallet = async () => {
    try {
      setFixingPayoutWallet(true);
      const signer = await getSigner();
      if (!signer) throw new Error('Wallet not connected');
      const address = await signer.getAddress();
      await updateMerchantPayoutWallet(signer, address);
      setFixingPayoutWallet(false);
      alert('✓ Payout wallet updated to your connected address on-chain');
    } catch (err) {
      setFixingPayoutWallet(false);
      alert(`Error fixing payout wallet: ${err.message}`);
    }
  };

  const presets = PRESETS[currency] ?? [];

  // Check if payout wallet mismatch exists
  const payoutMismatch = merchant?.payoutWallet && merchant?.walletAddress &&
                         merchant.payoutWallet !== merchant.walletAddress;

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>MorphSwift</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/ledger" className="ghost-btn" style={{ padding: '6px 10px', fontSize: 11 }}>
            Ledger
          </Link>
          <Link href="/profile" className="ghost-btn" style={{ padding: '6px 10px', fontSize: 11 }}>
            Profile
          </Link>
          <div className="merchant-pill">
            <span className="merchant-avatar">{merchantInitials(merchant)}</span>
            <span className="merchant-name-label">{merchant?.displayName || merchant?.email || 'Guest'}</span>
          </div>
          <WalletConnect />
        </div>
      </header>

      <section className="page terminal-grid">
        {/* Main keypad card */}
        <article className="card">
          {/* Currency tabs */}
          <div className="currency-row">
            {CURRENCIES.map((item) => (
              <button
                key={item}
                className={`currency-tab${currency === item ? ' active' : ''}`}
                onClick={() => { setCurrency(item); setRaw(''); setError(''); }}
              >
                {item}
              </button>
            ))}
            <span className="badge" style={{ marginLeft: 'auto' }}>
              <span className="badge-icon" />
              Live
            </span>
          </div>

          {/* Amount display */}
          <p className="section-label" style={{ marginTop: 12, marginBottom: 0 }}>Charge amount</p>
          <div className="display">
            <span className="display-sym">{currencyLabel}</span>
            <span className={raw ? 'has-value' : ''}>{displayValue}</span>
          </div>
          <p className="hero-subtitle" style={{ fontSize: 11, marginBottom: 10 }}>{rateLabel}</p>

          {/* Presets */}
          {presets.length > 0 && (
            <div className="preset-row">
              {presets.map((amount) => (
                <button key={amount} className="preset-btn"
                  onClick={() => { setError(''); setRaw(String(amount)); }}>
                  {currencyLabel}{amount.toLocaleString()}
                </button>
              ))}
              {raw && (
                <button className="preset-btn preset-clear"
                  onClick={() => { setRaw(''); setError(''); }}>
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Mobile-only conversion strip */}
          <div className="conversion-strip">
            <div className="conv-cell">
              <div className="conv-cell-label">USDC</div>
              <div className="conv-cell-value">{Number(conversion.USDC || 0).toFixed(2)}</div>
            </div>
            <div className="conv-cell">
              <div className="conv-cell-label">USDT</div>
              <div className="conv-cell-value">{Number(conversion.USDT || 0).toFixed(2)}</div>
            </div>
            <div className="conv-cell">
              <div className="conv-cell-label">USD</div>
              <div className="conv-cell-value">${Number(conversion.usd || 0).toFixed(2)}</div>
            </div>
          </div>

          {error && (
            <p style={{ color: 'var(--red)', fontSize: 11, margin: '6px 0 0' }}>{error}</p>
          )}

          {/* Keypad */}
          <div className="keypad" style={{ marginTop: 10 }}>
            {KEYS.map((key) => (
              <button
                key={key}
                className={`key${key === 'del' ? ' secondary' : ''}`}
                onClick={() => pressKey(key)}
              >
                {key === 'del' ? '⌫' : key}
              </button>
            ))}
            <button
              className="key key-charge primary"
              onClick={chargeNow}
              disabled={charging}
              style={{ opacity: charging ? 0.7 : 1, minHeight: 46, fontSize: 14 }}
            >
              {charging ? 'Creating checkout…' : 'Charge now'}
            </button>
          </div>
        </article>

        {/* Desktop sidebar */}
        <aside className="terminal-sidebar">
          {/* Payout wallet mismatch warning */}
          {payoutMismatch && (
            <div style={{ background: 'rgba(226,175,74,0.1)', border: '1px solid rgba(226,175,74,0.3)', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
              <p style={{ fontSize: 11, color: 'var(--amber)', margin: '0 0 8px', fontWeight: 600 }}>
                Payout wallet mismatch detected
              </p>
              <p style={{ fontSize: 10, color: 'var(--muted)', margin: '0 0 10px' }}>
                Funds are being sent to an old address. Click below to fix.
              </p>
              <button
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--amber)', color: '#0b0b0d', border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                onClick={fixPayoutWallet}
                disabled={fixingPayoutWallet}
              >
                {fixingPayoutWallet ? 'Fixing…' : 'Fix payout wallet'}
              </button>
            </div>
          )}

          {/* On-chain wallet balance */}
          <div className="card">
            <p className="section-label">Wallet balance</p>
            {[
              { token: 'USDC', value: onChainBalance.usdc },
              { token: 'USDT', value: onChainBalance.usdt },
            ].map(({ token, value }) => (
              <div key={token} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TokenLogo token={token} size={18} />
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{token}</span>
                </div>
                <span style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 18, fontWeight: 800, letterSpacing: '-0.05em' }}>
                  {value === null ? '—' : Number(value).toFixed(2)}
                </span>
              </div>
            ))}
            <p style={{ fontSize: 10, color: 'var(--muted-2)', margin: '2px 0 8px' }}>
              {merchant?.walletAddress
                ? `${merchant.walletAddress.slice(0, 8)}…${merchant.walletAddress.slice(-6)}`
                : '—'}
            </p>
            <div className="divider" style={{ margin: '6px 0' }} />
            <Link href="/ledger" style={{ fontSize: 11, color: 'var(--amber)' }}>
              View ledger &rarr;
            </Link>
          </div>

          {/* Quote preview */}
          <div className="card">
            <p className="section-label">Quote preview</p>
            <div style={{ display: 'grid', gap: 6 }}>
              {[
                { label: 'USDC', value: Number(conversion.USDC || 0).toFixed(4), sub: 'Checkout token' },
                { label: 'USDT', value: Number(conversion.USDT || 0).toFixed(4), sub: 'Alternative' },
                { label: 'USD est.', value: `$${Number(conversion.usd || 0).toFixed(4)}`, sub: 'Before fees' },
              ].map(({ label, value, sub }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-soft)' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted-2)' }}>{sub}</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 16, fontWeight: 800, letterSpacing: '-0.04em' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default function TerminalPage() {
  return (
    <Suspense fallback={null}>
      <TerminalContent />
    </Suspense>
  );
}
