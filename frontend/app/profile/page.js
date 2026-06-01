"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONFIG } from '../../config.js';
import { getSession, saveSession } from '../../assets/js/magic.js';
import { updateMerchantPayoutWallet } from '../../assets/js/gatewayContract.js';
import { getSigner } from '../../assets/js/wallet.js';
import WalletConnect from '../components/WalletConnect';

export default function ProfilePage() {
  const router = useRouter();
  const [merchant, setMerchant] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [payoutWallet, setPayoutWallet] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session.merchant) {
      router.replace('/onboarding');
      return;
    }
    setMerchant(session.merchant);
    setDisplayName(session.merchant.displayName || '');
    setPayoutWallet(session.merchant.payoutWallet || '');
  }, [router]);

  async function updateProfile() {
    if (!displayName.trim()) {
      setMessage('Display name is required');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // Update server-side merchant
      const res = await fetch('/api/merchants/' + merchant.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Profile update failed');
      }

      // Update local session
      const updated = { ...merchant, displayName: displayName.trim() };
      saveSession({ ...getSession(), merchant: updated });
      setMerchant(updated);
      setMessage('✓ Profile updated');
    } catch (err) {
      setMessage(err.message || 'Error updating profile');
    } finally {
      setLoading(false);
    }
  }

  async function fixPayoutWalletOnChain() {
    setLoading(true);
    setMessage('');

    try {
      const signer = await getSigner();
      if (!signer) throw new Error('Wallet not connected');
      await updateMerchantPayoutWallet(signer, await signer.getAddress());
      setMessage('✓ On-chain payout wallet updated');
    } catch (err) {
      setMessage(err.message || 'Error updating on-chain');
    } finally {
      setLoading(false);
    }
  }

  if (!merchant) return null;

  const payoutMismatch = merchant.payoutWallet && merchant.walletAddress &&
                         merchant.payoutWallet !== merchant.walletAddress;

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <a className="button ghost" href="/terminal">← Terminal</a>
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>Profile</span>
        </div>
        <WalletConnect />
      </header>

      <section className="page stack">
        <article className="summary-card">
          <p className="section-label">Merchant details</p>

          <div style={{ marginBottom: 16 }}>
            <label className="section-label" htmlFor="displayName" style={{ display: 'block', marginBottom: 6 }}>
              Business name
            </label>
            <input
              id="displayName"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your store name"
            />
            <p style={{ fontSize: 10, color: 'var(--muted)', margin: '4px 0 0' }}>Shown to customers on checkout</p>
          </div>

          <div className="divider" />

          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <p className="section-label">Addresses</p>
            <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
              <div>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Connected wallet</p>
                <p style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {merchant.walletAddress || '—'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payout address</p>
                <p style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {merchant.payoutWallet || '—'}
                </p>
              </div>
            </div>
          </div>

          {payoutMismatch && (
            <div style={{ background: 'rgba(226,175,74,0.1)', border: '1px solid rgba(226,175,74,0.3)', borderRadius: 12, padding: '10px 12px', marginBottom: 16 }}>
              <p style={{ fontSize: 11, color: 'var(--amber)', margin: '0 0 8px', fontWeight: 600 }}>
                Payout address mismatch
              </p>
              <p style={{ fontSize: 10, color: 'var(--muted)', margin: '0 0 10px' }}>
                Funds are being routed to your old address. Click below to update it on-chain.
              </p>
              <button
                className="button primary"
                style={{ width: '100%', fontSize: 12 }}
                onClick={fixPayoutWalletOnChain}
                disabled={loading}
              >
                {loading ? 'Updating…' : 'Fix on-chain'}
              </button>
            </div>
          )}

          <button
            className="button primary"
            style={{ width: '100%' }}
            onClick={updateProfile}
            disabled={loading || !displayName.trim()}
          >
            {loading ? 'Saving…' : 'Save changes'}
          </button>

          {message && (
            <p style={{ fontSize: 12, color: message.includes('✓') ? 'var(--green, #1be500)' : 'var(--red)', margin: '10px 0 0', textAlign: 'center' }}>
              {message}
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
