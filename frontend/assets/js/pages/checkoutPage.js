import { CONFIG } from '../../config.js';
import { createCheckout, confirmCheckout } from '../chainListener.js';
import { buildPaymentUri, shortAddress } from '../qrPayload.js';
import { getSession } from '../magic.js';
import { saveLocalTransaction } from '../ledger.js';

const state = {
  checkout: null,
  timerId: null,
  confirmId: null,
};

function readChargeContext() {
  const amount = sessionStorage.getItem('chargeAmount') || '0';
  const usd = sessionStorage.getItem('chargeUSD') || '0';
  const currency = sessionStorage.getItem('chargeCurrency') || 'PHP';
  const merchant = getSession().merchant ?? JSON.parse(sessionStorage.getItem('morphswift-active-merchant') || 'null');

  return { amount, usd, currency, merchant };
}

function qrText(checkout) {
  return buildPaymentUri({
    address: checkout.payoutWallet || checkout.merchantId,
    amount: checkout.stablecoinAmount,
    token: checkout.token,
    network: checkout.network || CONFIG.settlementNetwork,
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function buildQr(checkout) {
  const container = document.getElementById('qr-canvas');
  if (!container || typeof window.QRCode !== 'function') return;
  container.innerHTML = '';
  new window.QRCode(container, {
    text: qrText(checkout),
    width: 160,
    height: 160,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: window.QRCode.CorrectLevel.H,
  });
}

function updateBlocks(status) {
  document.getElementById('b1')?.classList.toggle('filled', status !== 'pending');
  document.getElementById('b2')?.classList.toggle('filled', status === 'confirmed');
  document.getElementById('b3')?.classList.toggle('filled', status === 'confirmed');
  document.getElementById('b1')?.classList.toggle('confirmed', status === 'confirmed');
  document.getElementById('b2')?.classList.toggle('confirmed', status === 'confirmed');
  document.getElementById('b3')?.classList.toggle('confirmed', status === 'confirmed');
}

function setStatus(text) {
  setText('status-text', text);
}

function startTimer(seconds) {
  let remaining = seconds;
  const timer = document.getElementById('timer');
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    remaining -= 1;
    if (!timer) return;
    if (remaining <= 0) {
      timer.textContent = 'Expired';
      clearInterval(state.timerId);
      return;
    }
    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const secondsText = String(remaining % 60).padStart(2, '0');
    timer.textContent = `${minutes}:${secondsText}`;
    if (remaining <= 60) timer.style.color = '#e24b4a';
  }, 1000);
}

async function finalizeCheckout(checkout) {
  const txHash = `0x${crypto.getRandomValues(new Uint32Array(4)).reduce((acc, value) => acc + value.toString(16), '').slice(0, 32)}`;
  const receipt = await confirmCheckout(checkout.id, txHash);
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

  sessionStorage.setItem('morphswift-payer-receipt', JSON.stringify({
    status: 'sent',
    amount: Number(tx.stablecoinAmount ?? 0).toFixed(2),
    usdAmount: Number(tx.stablecoinAmount ?? 0).toFixed(2),
    token: tx.token ?? 'USDC',
    network: 'Morph',
    merchant: receipt.merchant?.displayName ?? checkout.merchantName ?? 'Merchant',
    merchantName: receipt.merchant?.displayName ?? checkout.merchantName ?? 'Merchant',
    fiatAmount: Number(tx.amountFiat ?? 0),
    fiatCurrency: tx.currency ?? 'USD',
    txHash: tx.txHash,
    narration: checkout.reference ?? '',
    timestamp: tx.confirmedAt,
  }));

  document.getElementById('success-overlay')?.classList.add('visible');
  setText('s-amount', `${Number(tx.stablecoinAmount ?? 0).toFixed(2)} ${tx.token ?? 'USDC'}`);
  setText('s-token', tx.token ?? 'USDC');
  setText('s-network', CONFIG.settlementNetwork);
  const successSub = document.querySelector('.success-sub');
  if (successSub) successSub.textContent = `Confirmed on ${CONFIG.settlementNetwork}. Settlement completed for ${receipt.merchant?.displayName ?? checkout.merchantName ?? 'the merchant'}.`;
  clearInterval(state.timerId);
}

async function loadCheckout() {
  const { amount, usd, currency, merchant } = readChargeContext();
  if (!merchant?.id) {
    window.location.href = 'onboarding.html';
    return;
  }

  setText('charge-display', `${currency === 'PHP' ? '₱' : currency + ' '}${Number(amount).toLocaleString()}`);
  setText('usd-equiv', `${Number(usd).toFixed(2)} USDC`);
  setText('s-amount', `${Number(usd).toFixed(2)} USDC`);
  setText('s-token', 'USDC');
  setText('s-network', CONFIG.settlementNetwork);
  setText('wallet-addr', shortAddress(merchant.payoutWallet || merchant.id || 'merchant'));
  document.getElementById('wallet-addr')?.setAttribute('data-full', merchant.payoutWallet || merchant.id || 'merchant');

  state.checkout = await createCheckout({
    merchantId: merchant.id,
    amountFiat: Number(amount),
    currency,
    token: 'USDC',
    reference: sessionStorage.getItem('morphswift-checkout-reference') || `ORDER-${Date.now()}`,
  });

  buildQr(state.checkout);
  setStatus('Listening for transaction…');
  updateBlocks('pending');
  startTimer(CONFIG.checkout.expirySeconds);

  const copyBtn = document.getElementById('copy-btn');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(state.checkout.qrPayload);
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch {
        copyBtn.textContent = 'Copy failed';
      }
    };
  }

  state.confirmId = window.setTimeout(() => {
    finalizeCheckout(state.checkout).catch((error) => {
      console.error(error);
      setStatus(error.message || 'Payment failed');
    });
  }, 4000);
}

function newPayment() {
  clearTimeout(state.confirmId);
  window.location.href = 'terminal.html';
}

function showSuccess() {
  document.getElementById('success-overlay')?.classList.add('visible');
}

export function initCheckoutPage() {
  window.newPayment = newPayment;
  window.showSuccess = showSuccess;
  loadCheckout().catch((error) => {
    console.error(error);
    setStatus(error.message || 'Unable to create checkout');
  });
}
