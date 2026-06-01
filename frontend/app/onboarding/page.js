"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONFIG } from '../../config.js';
import { getSession, loginWithWallet, saveSession } from '../../assets/js/magic.js';
import { registerMerchantOnChain } from '../../assets/js/gatewayContract.js';
import WalletConnect from '../components/WalletConnect';

async function addTokenToWallet(symbol, address, decimals, logoPath) {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({
      method: 'wallet_watchAsset',
      params: {
        type: 'ERC20',
        options: {
          address,
          symbol,
          decimals,
          image: typeof window !== 'undefined' ? `${window.location.origin}${logoPath}` : '',
        },
      },
    });
  } catch { /* user dismissed — non-fatal */ }
}

function initialsFor(name = 'MS') {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || 'MS';
}

export default function OnboardingPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [sent, setSent] = useState(false);
  const [signedIn, setSignedIn] = useState(null);
  const [contractStatus, setContractStatus] = useState('');
  const [tokenStep, setTokenStep] = useState(false);
  const [connection, setConnection] = useState(null);

  useEffect(() => {
    setSignedIn(getSession().merchant);
  }, []);

  async function handleConnected(conn) {
    setConnection(conn);
    // Show token/network step before fully signing in
    setTokenStep(true);
  }

  async function finishOnboarding() {
    if (!connection) return;
    try {
      const session = await loginWithWallet(connection.address, displayName.trim());
      saveSession(session);
      setSignedIn(session.merchant);
      setSent(true);

      if (connection.signer) {
        try {
          setContractStatus('Registering on Morph Hoodi…');
          const { alreadyRegistered } = await registerMerchantOnChain(connection.signer);
          setContractStatus(alreadyRegistered ? 'Already registered on-chain.' : 'Registered on Morph Hoodi.');
        } catch (err) {
          setContractStatus(`On-chain: ${err.shortMessage || err.message}`);
        }
      }

      setTimeout(() => router.push('/terminal'), 900);
    } catch (err) {
      setContractStatus(err.message || 'Unable to create session');
    }
  }

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>MorphSwift</span>
        </div>
        {!tokenStep && (
          <WalletConnect mode="auth" onConnected={handleConnected} />
        )}
      </header>

      <section className="page stack">
        <div className="grid-2">
          <article className="card">
            {!tokenStep ? (
              <>
                <p className="section-label">Merchant onboarding</p>
                <h1 className="hero-title">Accept stablecoins with a mobile POS.</h1>
                <p className="hero-subtitle" style={{ marginBottom: 16 }}>
                  Connect your wallet to create quotes, build checkouts, and track payouts on {CONFIG.settlementNetwork}.
                </p>

                <div className="divider" />

                <label className="section-label" htmlFor="display-name" style={{ marginTop: 14, display: 'block' }}>
                  Business / display name
                </label>
                <input
                  id="display-name"
                  className="input"
                  placeholder="e.g. Ade's Store"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={{ marginBottom: 14 }}
                  maxLength={40}
                />

                <p className="help">Then use the wallet button in the top bar to sign in.</p>
              </>
            ) : (
              <>
                <p className="section-label">Almost there</p>
                <h2 style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', margin: '0 0 6px' }}>
                  Set up your wallet
                </h2>
                <p className="hero-subtitle" style={{ marginBottom: 18 }}>
                  Add the Morph Hoodi tokens so your wallet shows your USDC and USDT balance.
                </p>

                {/* Add tokens */}
                <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
                  {[
                    { symbol: 'USDC', address: CONFIG.contract.usdcAddress, decimals: 6, logo: '/assets/tokens/usdc.svg', color: '#2775CA' },
                    { symbol: 'USDT', address: CONFIG.contract.usdtAddress, decimals: 6, logo: '/assets/tokens/usdt.svg', color: '#26A17B' },
                  ].map(({ symbol, address, decimals, logo, color }) => (
                    <div key={symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <img src={logo} alt={symbol} width={24} height={24} style={{ borderRadius: '50%' }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{symbol}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{address.slice(0, 10)}…</div>
                        </div>
                      </div>
                      <button
                        onClick={() => addTokenToWallet(symbol, address, decimals, logo)}
                        style={{ fontSize: 11, padding: '5px 12px', borderRadius: 8, border: `1px solid ${color}40`, background: `${color}18`, color, cursor: 'pointer' }}
                      >
                        Add to wallet
                      </button>
                    </div>
                  ))}
                </div>

                {/* Faucet */}
                <div style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(27,229,0,0.2)', background: 'rgba(27,229,0,0.05)', marginBottom: 18 }}>
                  <p style={{ fontSize: 12, color: 'var(--text)', margin: '0 0 6px', fontWeight: 600 }}>Need test tokens?</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px' }}>
                    Get free ETH on Morph Hoodi to pay gas fees.
                  </p>
                  <a
                    href="https://morph-rails-hoodi.morph.network/faucet?ref=blog.morph.network"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}
                  >
                    Open faucet →
                  </a>
                </div>

                {contractStatus && (
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 12px' }}>{contractStatus}</p>
                )}

                <button
                  className="button primary"
                  style={{ width: '100%', fontSize: 14 }}
                  onClick={finishOnboarding}
                  disabled={sent}
                >
                  {sent ? 'Redirecting…' : 'Continue to terminal'}
                </button>
              </>
            )}

            {sent && <p className="footer-note" style={{ color: '#9fffb5', marginTop: 8 }}>Wallet connected. Routing you to the terminal.</p>}
          </article>

          <aside className="summary-card">
            <p className="section-label">Signed in merchant</p>
            <div className="merchant-pill" style={{ width: 'fit-content' }}>
              <span className="merchant-avatar">{initialsFor(signedIn?.displayName || signedIn?.walletAddress || 'MS')}</span>
              <span>{signedIn?.displayName || signedIn?.walletAddress || 'Guest merchant'}</span>
            </div>

            <div className="checklist">
              <div className="check-item"><span className="check-dot">●</span><span>Live quote API for fiat-to-stablecoin pricing</span></div>
              <div className="check-item"><span className="check-dot">●</span><span>Checkout QR with server confirmation flow</span></div>
              <div className="check-item"><span className="check-dot">●</span><span>Ledger and withdrawals linked to your merchant account</span></div>
            </div>

            {!signedIn && (
              <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
                  New to Morph Hoodi?{' '}
                  <a href="https://morph-rails-hoodi.morph.network/faucet?ref=blog.morph.network" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--amber)' }}>
                    Get test ETH from the faucet →
                  </a>
                </p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
