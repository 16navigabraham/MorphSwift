"use client";

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CONFIG } from '../../config.js';

import WalletConnect from '../components/WalletConnect';

function SenderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    let data = null;
    try {
      data = JSON.parse(sessionStorage.getItem('morphswift-payer-receipt') || 'null');
    } catch {
      data = null;
    }

    if (!data) {
      data = {
        amount: searchParams.get('amount') || '0.00',
        token: searchParams.get('token') || 'USDC',
        merchantName: searchParams.get('merchant') || 'Merchant',
        fiatAmount: searchParams.get('fiatAmount') || '0',
        fiatCurrency: searchParams.get('fiatCurrency') || 'USD',
        txHash: searchParams.get('tx') || '0x…',
        narration: searchParams.get('narration') || '',
        timestamp: new Date().toISOString(),
        network: CONFIG.settlementNetwork,
      };
    }
    setReceipt(data);
  }, [searchParams]);

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <a className="button ghost" href="/checkout">← Checkout</a>
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>Receipt</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a className="button primary" href="/ledger">Merchant ledger</a>
          <WalletConnect />
        </div>
      </header>

      <section className="page stack">
        <article className="receipt-card">
          <p className="section-label">Customer receipt</p>
          <h2>Payment sent</h2>
          <p className="hero-subtitle">Confirmed on {receipt?.network || CONFIG.settlementNetwork} for {receipt?.merchantName || 'the merchant'}.</p>

          <div className="divider" />

          <div className="receipt-row"><span className="muted">Amount</span><strong>{receipt?.amount || '0.00'} {receipt?.token || 'USDC'}</strong></div>
          <div className="receipt-row"><span className="muted">Fiat</span><strong>{receipt?.fiatAmount || '0'} {receipt?.fiatCurrency || 'USD'}</strong></div>
          <div className="receipt-row"><span className="muted">Transaction</span><strong>{receipt?.txHash || '0x…'}</strong></div>
          <div className="receipt-row"><span className="muted">Narration</span><strong>{receipt?.narration || 'Checkout complete'}</strong></div>

          <div className="button-row" style={{ marginTop: 16 }}>
            <button className="button primary" onClick={() => router.push('/terminal')}>Back to terminal</button>
            <button className="button" onClick={() => router.push('/ledger')}>Open ledger</button>
          </div>
        </article>
      </section>
    </main>
  );
}

export default function SenderPage() {
  return (
    <Suspense fallback={null}>
      <SenderContent />
    </Suspense>
  );
}
