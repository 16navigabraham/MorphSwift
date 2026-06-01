"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONFIG } from '../../config.js';
import { getSession, loginWithWallet } from '../../assets/js/magic.js';
import WalletConnect from '../components/WalletConnect';

function initialsFor(name = 'MS') {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'MS';
}

export default function OnboardingPage() {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [signedIn, setSignedIn] = useState(null);

  useEffect(() => {
    setSignedIn(getSession().merchant);
  }, []);

  async function connectWalletSession(connection) {
    try {
      await loginWithWallet(connection.address);
      setSignedIn(getSession().merchant);
      setSent(true);
      setTimeout(() => {
        router.push(`/terminal?source=wallet-connect`);
      }, 700);
    } catch (error) {
      alert(error.message || 'Unable to create session');
    }
  }

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand">
            <span className="brand-mark">M</span>
            <span>MorphSwift</span>
          </div>
        </div>
        <div>
          <WalletConnect mode="auth" onConnected={connectWalletSession} />
        </div>
      </header>

      <section className="page stack">
        <div className="grid-2">
          <article className="card">
            <p className="section-label">Merchant onboarding</p>
            <h1 className="hero-title">Accept stablecoins with a mobile POS.</h1>
            <p className="hero-subtitle">
              Connect your wallet to create quotes, build checkouts, and track payouts on {CONFIG.settlementNetwork}.
            </p>

            <div className="divider" />

            <div className="button-row" style={{ marginTop: 14 }}>
              <p className="help">Use the wallet button in the top bar to sign in.</p>
            </div>

            {sent ? (
              <p className="footer-note" style={{ color: '#9fffb5' }}>
                Wallet connected. Routing you to the terminal.
              </p>
            ) : null}
          </article>

          <aside className="summary-card">
            <p className="section-label">Signed in merchant</p>
            <div className="merchant-pill" style={{ width: 'fit-content' }}>
              <span className="merchant-avatar">{initialsFor(signedIn?.displayName || signedIn?.walletAddress || signedIn?.email)}</span>
              <span>{signedIn?.displayName || signedIn?.walletAddress || signedIn?.email || 'Guest merchant'}</span>
            </div>

            <div className="checklist">
              <div className="check-item"><span className="check-dot">●</span><span>Live quote API for fiat-to-stablecoin pricing</span></div>
              <div className="check-item"><span className="check-dot">●</span><span>Checkout QR with server confirmation flow</span></div>
              <div className="check-item"><span className="check-dot">●</span><span>Ledger and withdrawals linked to your merchant account</span></div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

