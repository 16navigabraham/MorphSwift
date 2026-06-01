"use client";

import { useEffect, useState } from 'react';
import { connectWallet, ensureCorrectNetwork, getAddress, hasInjectedProvider, isCorrectNetwork } from '../../assets/js/wallet.js';
import { CONFIG } from '../../config.js';

export default function WalletConnect({ onConnected, mode = 'display' } = {}) {
  const [pending, setPending] = useState(false);
  const [addr, setAddr] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      if (!hasInjectedProvider()) return;
      try {
        const a = await getAddress();
        setAddr(a);
      } catch {}
    })();
  }, []);

  async function handleConnect() {
    try {
      setPending(true);
      setStatus('Connecting…');
      const res = await connectWallet();
      setAddr(res.address);
      const ok = await ensureCorrectNetwork(CONFIG.contract.chainId);
      setStatus(ok ? 'Connected' : `Switch to chain ${CONFIG.contract.chainId}`);
      if (!ok) {
        return res;
      }
      const stillOk = await isCorrectNetwork(CONFIG.contract.chainId);
      setStatus(stillOk ? 'Connected' : `Wrong network (expect ${CONFIG.contract.chainId})`);
      if (typeof onConnected === 'function') {
        await onConnected(res);
      }
      return res;
    } catch (err) {
      setStatus(err?.message || 'Connection failed');
      throw err;
    } finally {
      setPending(false);
      setTimeout(() => setStatus(''), 2500);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {mode === 'auth' ? (
        <button className="button primary" onClick={handleConnect} disabled={pending}>
          {pending ? 'Connecting…' : addr ? 'Continue with wallet' : 'Connect wallet'}
        </button>
      ) : addr ? (
        <button className="button ghost" onClick={() => navigator.clipboard.writeText(addr)} title="Copy address">
          {addr.slice(0, 6)}…{addr.slice(-4)}
        </button>
      ) : (
        <button className="button" onClick={handleConnect} disabled={pending}>Connect wallet</button>
      )}
      <div style={{ fontSize: 12, color: '#9aa' }}>{status}</div>
    </div>
  );
}
