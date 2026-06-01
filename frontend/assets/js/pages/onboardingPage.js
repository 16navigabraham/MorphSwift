import { loginWithWallet } from '../magic.js';
import { CONFIG } from '../../config.js';

function setLoading(button, label) {
  if (!button) return;
  button.dataset.originalLabel ??= button.textContent;
  button.disabled = true;
  button.textContent = label;
}

function clearLoading(button) {
  if (!button) return;
  button.disabled = false;
  button.textContent = button.dataset.originalLabel ?? button.textContent;
}

async function goToTerminal(walletAddress) {
  const status = document.getElementById('magic-sent');
  const walletChip = document.getElementById('wallet-address');

  try {
    await loginWithWallet(walletAddress);
    if (status) status.classList.add('visible');
    if (walletChip) walletChip.textContent = walletAddress;
    setTimeout(() => {
      window.location.href = 'terminal.html?source=wallet-connect';
    }, 800);
  } catch (error) {
    console.error(error);
    alert(error.message || 'Unable to create session');
  }
}

async function handleWalletConnect() {
  const button = document.querySelector('.btn');
  setLoading(button, 'Connecting wallet…');
  const walletAddress = window.ethereum ? (await window.ethereum.request({ method: 'eth_requestAccounts' }))?.[0] : '';
  if (!walletAddress) {
    clearLoading(button);
    alert('Connect a wallet first.');
    return;
  }
  await goToTerminal(walletAddress);
}

export function initOnboardingPage() {
  window.handleWalletConnect = handleWalletConnect;

  const statusItems = document.querySelectorAll('.status-item');
  if (statusItems[0]) {
    statusItems[0].lastChild.textContent = ` ${CONFIG.settlementNetwork}`;
  }
}
