"use client";

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CONFIG } from '../../config.js';
import { getSession } from '../../assets/js/magic.js';
import { convertFiatToStablecoins, formatFiatSymbol, quoteStablecoin, loadPriceSettings } from '../../assets/js/priceFeeds.js';
import WalletConnect from '../components/WalletConnect';

const CURRENCIES = ['PHP', 'USD', 'NGN', 'SGD'];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

function merchantInitials(merchant) {
  const name = merchant?.displayName || merchant?.email || 'Merchant';
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function TerminalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currency, setCurrency] = useState('PHP');
  const [raw, setRaw] = useState('');
  const [rates, setRates] = useState(null);
  const [merchant, setMerchant] = useState(null);
  const [conversion, setConversion] = useState({ USDC: 0, USDT: 0, USDT_TRON: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session.merchant) {
      router.replace('/onboarding');
      return;
    }
    setMerchant(session.merchant);
    loadPriceSettings().then(setRates).catch(() => setRates(null));
  }, [router]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const amount = Number.parseFloat(raw) || 0;
      const data = rates ? await convertFiatToStablecoins(amount, currency) : { USDC: 0, USDT: 0, USDT_TRON: 0 };
      if (alive) setConversion(data);
    })();
    return () => {
      alive = false;
    };
  }, [raw, currency, rates]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key >= '0' && event.key <= '9') {
        setRaw((value) => (value === '0' ? event.key : `${value}${event.key}`));
      } else if (event.key === 'Backspace') {
        setRaw((value) => value.slice(0, -1));
      } else if (event.key === '.') {
        setRaw((value) => (value.includes('.') ? value : `${value || '0'}.`));
      } else if (event.key === 'Enter') {
        chargeNow();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const displayValue = raw === '' ? '0' : raw;
  const currencyLabel = useMemo(() => formatFiatSymbol(currency), [currency]);
  const rateLabel = rates?.fiatRates?.[currency]
    ? `1 USDC = ${currencyLabel}${Number(rates.fiatRates[currency]).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : 'Loading live rates…';

  function pressKey(key) {
    setError('');
    if (key === 'del') {
      setRaw((value) => value.slice(0, -1));
      return;
    }
    if (key === '.') {
      setRaw((value) => (value.includes('.') ? value : `${value || '0'}.`));
      return;
    }
    setRaw((value) => {
      if (value.length >= 10) return value;
      if (value === '0') return key;
      return `${value}${key}`;
    });
  }

  function storeChargeContext(quote, amountFiat) {
    sessionStorage.setItem(CONFIG.storage.chargeAmount, String(amountFiat));
    sessionStorage.setItem(CONFIG.storage.chargeUsd, String(quote.stablecoinAmount));
    sessionStorage.setItem(CONFIG.storage.chargeCurrency, currency);
    sessionStorage.setItem('morphswift-checkout', JSON.stringify(quote));
    sessionStorage.setItem('morphswift-active-merchant', JSON.stringify(merchant));
  }

  async function chargeNow() {
    const amountFiat = Number.parseFloat(raw);
    if (!Number.isFinite(amountFiat) || amountFiat <= 0) {
      setError('Enter a valid amount to continue.');
      return;
    }
    if (!merchant) {
      router.replace('/onboarding');
      return;
    }

    try {
      const quote = await quoteStablecoin({ amountFiat, currency, token: 'USDC' });
      storeChargeContext(quote, amountFiat);
      router.push('/checkout');
    } catch (err) {
      setError(err.message || 'Unable to create checkout quote');
    }
  }

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>MorphSwift</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="merchant-pill">
            <span className="merchant-avatar">{merchantInitials(merchant)}</span>
            <span>{merchant?.displayName || merchant?.email || 'Guest merchant'}</span>
          </div>
          <WalletConnect />
        </div>
      </header>

      <section className="page stack">
        <article className="card">
          <div className="currency-row">
            {CURRENCIES.map((item) => (
              <button
                key={item}
                className={`currency-tab ${currency === item ? 'active' : ''}`}
                onClick={() => setCurrency(item)}
              >
                {item}
              </button>
            ))}
            <span className="badge" style={{ marginLeft: 'auto' }}>
              <span className="badge-icon" />
              Live pricing
            </span>
          </div>

          <p className="section-label">Charge amount</p>
          <div className="display">
            <span style={{ marginRight: 6, opacity: 0.7 }}>{currencyLabel}</span>
            <span className={raw ? 'display has-value' : 'display'}>{displayValue}</span>
          </div>
          <p className="hero-subtitle">{rateLabel}</p>

          <div className="conversion-card" style={{ marginTop: 16 }}>
            <div className="conversion-grid">
              <div className="metric">
                <div>
                  <div className="metric-label">USDC</div>
                  <div className="metric-value">{Number(conversion.USDC || 0).toFixed(2)}</div>
                </div>
                <div className="metric-sub">Quoted checkout token</div>
              </div>
              <div className="metric">
                <div>
                  <div className="metric-label">USDT</div>
                  <div className="metric-value">{Number(conversion.USDT || 0).toFixed(2)}</div>
                </div>
                <div className="metric-sub">Alternative stablecoin</div>
              </div>
              <div className="metric">
                <div>
                  <div className="metric-label">Estimate</div>
                  <div className="metric-value">{Number(conversion.USDT_TRON || 0).toFixed(2)}</div>
                </div>
                <div className="metric-sub">Cross-network reference</div>
              </div>
            </div>
          </div>

          {error ? <p className="footer-note" style={{ color: '#ffb1b1' }}>{error}</p> : null}

          <div className="keypad" style={{ marginTop: 18 }}>
            {KEYS.map((key) => (
              <button
                key={key}
                className={`key ${key === 'del' ? 'secondary' : ''} ${key === '0' ? 'primary' : ''} ${key === 'del' ? 'secondary' : ''} ${key === '0' ? 'primary' : ''} ${key === '0' ? '' : ''}`}
                onClick={() => pressKey(key)}
              >
                {key === 'del' ? '⌫' : key}
              </button>
            ))}
            <button className="key key-charge primary" onClick={chargeNow}>
              Charge now
            </button>
          </div>
        </article>
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
