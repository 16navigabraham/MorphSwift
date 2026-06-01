"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { CONFIG } from '../../config.js';
import { fetchCheckout, confirmCheckout } from '../../assets/js/chainListener.js';
import { buildPaymentUri, shortAddress } from '../../assets/js/qrPayload.js';
import { connectWallet, ensureCorrectNetwork, hasInjectedProvider } from '../../assets/js/wallet.js';
import TokenLogo from '../components/TokenLogo';
import { ethers } from 'ethers';

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

const GATEWAY_PAY_ABI = ['function payCheckout(bytes32 checkoutId) nonpayable'];

function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function PayContent() {
  const searchParams = useSearchParams();
  const checkoutId = searchParams.get('id');

  const [checkout, setCheckout] = useState(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState('loading');
  const [txHash, setTxHash] = useState(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!checkoutId) { setError('No checkout ID provided.'); setStep('failed'); return; }
    fetchCheckout(checkoutId)
      .then((co) => {
        if (co.status === 'confirmed') { setStep('paid'); setCheckout(co); return; }
        if (co.status === 'expired') { setError('This payment link has expired.'); setStep('failed'); return; }
        setCheckout(co);
        setStep('ready');
      })
      .catch((err) => { setError(err.message || 'Could not load checkout.'); setStep('failed'); });
  }, [checkoutId]);

  function copy(text, key) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  }

  async function connectAndPay() {
    try {
      setError('');
      setStep('approving');

      const { signer, address } = await connectWallet();
      // Triggers MetaMask popup to switch or add Morph Hoodi if needed
      await ensureCorrectNetwork(CONFIG.contract.chainId);

      const amountUnits = ethers.parseUnits(Number(checkout.stablecoinAmount).toFixed(6), 6);

      let finalTxHash = null;

      if (checkout.onChainCheckoutId) {
        // Gateway contract path — payCheckout handles settlement
        const usdc = new ethers.Contract(CONFIG.contract.usdcAddress, ERC20_ABI, signer);
        const allowance = await usdc.allowance(address, CONFIG.contract.gatewayAddress);
        if (allowance < amountUnits) {
          const approveTx = await usdc.approve(CONFIG.contract.gatewayAddress, amountUnits);
          await approveTx.wait();
        }
        setStep('paying');
        const gateway = new ethers.Contract(CONFIG.contract.gatewayAddress, GATEWAY_PAY_ABI, signer);
        const tx = await gateway.payCheckout(checkout.onChainCheckoutId);
        const receipt = await tx.wait();
        finalTxHash = receipt.hash;
      } else {
        // Direct USDC transfer path
        const usdc = new ethers.Contract(CONFIG.contract.usdcAddress, ERC20_ABI, signer);
        setStep('paying');
        const tx = await usdc.transfer(checkout.payoutWallet, amountUnits);
        const receipt = await tx.wait();
        finalTxHash = receipt.hash;
      }

      setTxHash(finalTxHash);

      // Confirm on the server so merchant ledger and balance update
      try {
        await confirmCheckout(checkout.id, finalTxHash);
      } catch {
        // Non-fatal — payment happened on-chain, server update can retry
      }

      setStep('paid');
    } catch (err) {
      setError(err.shortMessage || err.message || 'Payment failed.');
      setStep('ready');
    }
  }

  const fiatSymbol = CONFIG.currencySymbols[checkout?.currency] ?? (checkout?.currency ?? '');
  const walletUri = checkout
    ? buildPaymentUri({
        address: checkout.payoutWallet || checkout.merchantId,
        amount: checkout.stablecoinAmount,
        token: checkout.token,
        network: checkout.network || CONFIG.settlementNetwork,
      })
    : '';

  const hasWallet = hasInjectedProvider();
  const onMobile = isMobile();

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--amber)', display: 'grid', placeItems: 'center', color: '#0b0b0d', fontWeight: 800, fontSize: 14 }}>M</span>
          <span style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em' }}>MorphSwift</span>
        </div>

        {step === 'loading' && (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Loading payment…</p>
        )}

        {step === 'failed' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✕</div>
            <p style={{ color: 'var(--red)', fontSize: 14 }}>{error || 'Payment link not found.'}</p>
          </div>
        )}

        {step === 'paid' && (
          <div style={{ textAlign: 'center', background: 'var(--surface)', border: '1px solid rgba(27,229,0,0.3)', borderRadius: 18, padding: 28 }}>
            <div style={{ fontSize: 44, color: 'var(--amber)', marginBottom: 10 }}>✓</div>
            <h2 style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 26, fontWeight: 800, letterSpacing: '-0.05em', margin: '0 0 8px' }}>Payment sent</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 16px' }}>
              {Number(checkout?.stablecoinAmount ?? 0).toFixed(2)} {checkout?.token ?? 'USDC'} to {checkout?.merchantName || 'merchant'}
            </p>
            {txHash && (
              <a href={`${CONFIG.contract.blockExplorerUrls[0]}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--amber)' }}>
                View on explorer →
              </a>
            )}
          </div>
        )}

        {(step === 'ready' || step === 'approving' || step === 'paying') && checkout && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>

            {/* Amount header */}
            <div style={{ textAlign: 'center', padding: '24px 20px 16px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Amount due</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 4 }}>
                <TokenLogo token={checkout.token} size={30} />
                <span style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 40, fontWeight: 800, letterSpacing: '-0.06em' }}>
                  {Number(checkout.stablecoinAmount).toFixed(2)}
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                {checkout.token} · {fiatSymbol}{Number(checkout.amountFiat).toLocaleString()} {checkout.currency}
              </p>
            </div>

            {/* Details */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              {[
                { label: 'Merchant', value: checkout.merchantName && !checkout.merchantName.startsWith('0x') ? checkout.merchantName : shortAddress(checkout.payoutWallet) },
                { label: 'Network', value: CONFIG.settlementNetwork },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: 'var(--muted)' }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Payment options */}
            <div style={{ padding: '16px 20px' }}>
              {error && <p style={{ fontSize: 12, color: 'var(--red)', margin: '0 0 12px' }}>{error}</p>}

              {hasWallet && (
                <button
                  style={{
                    width: '100%', padding: 14, borderRadius: 14,
                    background: 'linear-gradient(180deg,#1be500,#12b600)',
                    color: '#081208', fontWeight: 700, fontSize: 15,
                    border: 'none', cursor: step === 'ready' ? 'pointer' : 'not-allowed',
                    opacity: step === 'ready' ? 1 : 0.7, marginBottom: 14,
                  }}
                  onClick={connectAndPay}
                  disabled={step !== 'ready'}
                >
                  {step === 'approving' ? 'Check wallet — approving USDC…'
                    : step === 'paying' ? 'Check wallet — sending payment…'
                    : 'Connect wallet & pay'}
                </button>
              )}

              {/* Option B: no wallet on PC — show address to copy */}
              {!hasWallet && !onMobile && (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
                    No wallet detected. Send manually or{' '}
                    <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--amber)' }}>
                      install MetaMask
                    </a>.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Send to address</span>
                    <button onClick={() => copy(checkout.payoutWallet, 'addr')}
                      style={{ fontSize: 11, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--muted)', cursor: 'pointer' }}>
                      {copied === 'addr' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <code style={{ fontSize: 11, color: 'var(--text)', wordBreak: 'break-all', display: 'block', marginBottom: 10 }}>
                    {checkout.payoutWallet}
                  </code>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Amount ({checkout.token})</span>
                    <button onClick={() => copy(String(checkout.stablecoinAmount), 'amount')}
                      style={{ fontSize: 11, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--muted)', cursor: 'pointer' }}>
                      {copied === 'amount' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'block', marginTop: 2 }}>
                    {Number(checkout.stablecoinAmount).toFixed(6)}
                  </code>
                </div>
              )}

              {/* Option C: mobile — QR for wallet app */}
              {onMobile && (
                <div style={{ textAlign: 'center', marginBottom: 14 }}>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Scan with your wallet app</p>
                  <div style={{ display: 'inline-block', background: '#fff', padding: 12, borderRadius: 14 }}>
                    <QRCodeSVG value={walletUri} size={180} level="H" />
                  </div>
                </div>
              )}

              {/* Network note */}
              <p style={{ fontSize: 11, color: 'var(--muted-2)', textAlign: 'center', margin: 0 }}>
                Send {checkout.token} on {CONFIG.settlementNetwork} only
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={null}>
      <PayContent />
    </Suspense>
  );
}
