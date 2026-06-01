"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { CONFIG } from '../../config.js';
import { fetchCheckout } from '../../assets/js/chainListener.js';
import { buildPaymentUri, shortAddress } from '../../assets/js/qrPayload.js';
import { connectWallet, ensureCorrectNetwork, hasInjectedProvider } from '../../assets/js/wallet.js';
import { buildPayCheckoutUri } from '../../assets/js/gatewayContract.js';
import TokenLogo from '../components/TokenLogo';
import { ethers } from 'ethers';

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

function PayContent() {
  const searchParams = useSearchParams();
  const checkoutId = searchParams.get('id');

  const [checkout, setCheckout] = useState(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState('loading'); // loading | ready | approving | paying | paid | failed
  const [walletAddr, setWalletAddr] = useState(null);
  const [txHash, setTxHash] = useState(null);

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

  async function connectAndPay() {
    try {
      setStep('approving');
      const { provider, signer, address } = await connectWallet();
      setWalletAddr(address);

      const ok = await ensureCorrectNetwork(CONFIG.contract.chainId);
      if (!ok) { setError(`Please switch to ${CONFIG.contract.chainName} in your wallet.`); setStep('ready'); return; }

      // Approve USDC spending on the gateway
      const usdc = new ethers.Contract(CONFIG.contract.usdcAddress, ERC20_ABI, signer);
      const amountUnits = ethers.parseUnits(Number(checkout.stablecoinAmount).toFixed(6), 6);

      const allowance = await usdc.allowance(address, CONFIG.contract.gatewayAddress);
      if (allowance < amountUnits) {
        setStep('approving');
        const approveTx = await usdc.approve(CONFIG.contract.gatewayAddress, amountUnits);
        await approveTx.wait();
      }

      // Call payCheckout on the gateway
      setStep('paying');
      const abi = ['function payCheckout(bytes32 checkoutId) nonpayable'];
      const gateway = new ethers.Contract(CONFIG.contract.gatewayAddress, abi, signer);
      const tx = await gateway.payCheckout(checkout.onChainCheckoutId);
      const receipt = await tx.wait();
      setTxHash(receipt.hash);
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

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--amber)', display: 'grid', placeItems: 'center', color: '#0b0b0d', fontWeight: 800, fontSize: 14 }}>M</span>
          <span style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em' }}>MorphSwift</span>
        </div>

        {step === 'loading' && (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Loading payment…</p>
        )}

        {step === 'failed' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✕</div>
            <p style={{ color: 'var(--red)', fontSize: 14 }}>{error}</p>
          </div>
        )}

        {step === 'paid' && (
          <div style={{ textAlign: 'center', background: 'var(--surface)', border: '1px solid rgba(27,229,0,0.3)', borderRadius: 18, padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
            <h2 style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 24, fontWeight: 800, letterSpacing: '-0.05em', margin: '0 0 6px' }}>Payment sent</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 16px' }}>
              {Number(checkout?.stablecoinAmount ?? 0).toFixed(2)} {checkout?.token ?? 'USDC'} sent to {checkout?.merchantName ?? 'merchant'}
            </p>
            {txHash && (
              <a
                href={`${CONFIG.contract.blockExplorerUrls[0]}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--amber)' }}
              >
                View on explorer →
              </a>
            )}
          </div>
        )}

        {(step === 'ready' || step === 'approving' || step === 'paying') && checkout && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 20 }}>
            {/* Amount */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <p style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Amount due</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <TokenLogo token={checkout.token} size={28} />
                <span style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 36, fontWeight: 800, letterSpacing: '-0.06em' }}>
                  {Number(checkout.stablecoinAmount).toFixed(2)}
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
                {checkout.token} · {fiatSymbol}{Number(checkout.amountFiat).toLocaleString()} {checkout.currency}
              </p>
            </div>

            {/* Merchant */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
              <span>Merchant</span><span style={{ color: 'var(--text)' }}>{checkout.merchantName || shortAddress(checkout.payoutWallet)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              <span>Network</span><span style={{ color: 'var(--text)' }}>{CONFIG.settlementNetwork}</span>
            </div>

            {error && <p style={{ fontSize: 12, color: 'var(--red)', margin: '0 0 12px' }}>{error}</p>}

            {/* Pay via contract if on-chain checkout exists */}
            {checkout.onChainCheckoutId && hasInjectedProvider() && (
              <button
                style={{ width: '100%', padding: '14px', borderRadius: 14, background: 'linear-gradient(180deg,#1be500,#12b600)', color: '#081208', fontWeight: 700, fontSize: 15, border: 'none', cursor: step === 'ready' ? 'pointer' : 'not-allowed', opacity: step === 'ready' ? 1 : 0.7, marginBottom: 12 }}
                onClick={connectAndPay}
                disabled={step !== 'ready'}
              >
                {step === 'approving' ? 'Approving USDC…' : step === 'paying' ? 'Sending payment…' : walletAddr ? 'Pay now' : 'Connect wallet & pay'}
              </button>
            )}

            {/* QR for wallet app scanning */}
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 10px' }}>
                {checkout.onChainCheckoutId ? 'Or scan with your wallet app' : 'Scan with your wallet app to pay'}
              </p>
              <div style={{ display: 'inline-block', background: '#fff', padding: 12, borderRadius: 14 }}>
                <QRCodeSVG value={walletUri} size={160} level="H" />
              </div>
              <p style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 8 }}>
                Send {Number(checkout.stablecoinAmount).toFixed(2)} {checkout.token} to {shortAddress(checkout.payoutWallet)}
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
