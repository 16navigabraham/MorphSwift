import { CONFIG } from '../../config.js';
import { getSession } from '../magic.js';
import { convertFiatToStablecoins, formatFiatSymbol, quoteStablecoin, loadPriceSettings } from '../priceFeeds.js';

const state = {
  currency: 'PHP',
  raw: '',
  rates: null,
  merchant: null,
};

function getInputValue() {
  return state.raw === '' ? '0' : state.raw;
}

function updateMerchantChip() {
  const merchantPill = document.querySelector('.merchant-pill');
  if (!merchantPill) return;

  const merchant = state.merchant ?? getSession().merchant;
  if (!merchant) {
    merchantPill.innerHTML = '<span class="merchant-avatar">MS</span><span>Guest merchant</span>';
    return;
  }

  const name = merchant.displayName || merchant.walletAddress || merchant.email || 'Merchant';
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  merchantPill.innerHTML = `<span class="merchant-avatar">${initials}</span><span>${name}</span>`;
}

async function updateConversion() {
  const amount = Number.parseFloat(state.raw) || 0;
  const display = document.getElementById('display');
  const sym = document.getElementById('sym');
  const rateLabel = document.getElementById('rate-label');
  const currencyLabel = formatFiatSymbol(state.currency);

  if (display) {
    display.textContent = getInputValue();
    display.classList.toggle('has-value', state.raw !== '');
  }

  if (sym) sym.textContent = currencyLabel;
  if (rateLabel && state.rates) {
    const rate = state.rates.fiatRates?.[state.currency] ?? 1;
    rateLabel.textContent = `1 USDC = ${currencyLabel}${Number(rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }

  const conversion = state.rates
    ? await convertFiatToStablecoins(amount, state.currency)
    : { USDC: 0, USDT: 0, USDT_TRON: 0 };

  const usdc = document.getElementById('usdc-amount');
  const usdt = document.getElementById('usdt-amount');
  const tron = document.getElementById('usdt-tron');
  if (usdc) usdc.textContent = Number(conversion.USDC || 0).toFixed(2);
  if (usdt) usdt.textContent = Number(conversion.USDT || 0).toFixed(2);
  if (tron) tron.textContent = Number(conversion.USDT_TRON || 0).toFixed(2);
}

function pressKey(key) {
  if (key === 'del') {
    state.raw = state.raw.slice(0, -1);
  } else if (key === '.') {
    if (!state.raw.includes('.')) {
      state.raw += state.raw === '' ? '0.' : '.';
    }
  } else {
    if (state.raw.length >= 10) return;
    if (state.raw === '0' && key !== '.') state.raw = key;
    else state.raw += key;
  }

  updateConversion();
}

function setCurrency(currency, button) {
  state.currency = currency;
  document.querySelectorAll('.currency-tab').forEach((tab) => tab.classList.remove('active'));
  button?.classList.add('active');
  updateConversion();
}

function persistChargeContext({ quote, amountFiat, currency }) {
  sessionStorage.setItem(CONFIG.storage.chargeAmount ?? 'chargeAmount', String(amountFiat));
  sessionStorage.setItem(CONFIG.storage.chargeUsd ?? 'chargeUSD', String(quote.stablecoinAmount));
  sessionStorage.setItem(CONFIG.storage.chargeCurrency ?? 'chargeCurrency', currency);
  sessionStorage.setItem('morphswift-checkout', JSON.stringify(quote));
}

async function chargeNow() {
  const amountFiat = Number.parseFloat(state.raw);
  if (!Number.isFinite(amountFiat) || amountFiat <= 0) {
    const display = document.getElementById('display');
    if (display) {
      display.style.color = '#e24b4a';
      setTimeout(() => {
        display.style.color = '';
      }, 600);
    }
    return;
  }

  const merchant = state.merchant ?? getSession().merchant;
  if (!merchant) {
    window.location.href = 'onboarding.html';
    return;
  }

  const button = document.querySelector('.key-charge');
  if (button) button.style.opacity = '0.7';

  try {
    const quote = await quoteStablecoin({ amountFiat, currency: state.currency, token: 'USDC' });
    persistChargeContext({ quote, amountFiat, currency: state.currency });
    sessionStorage.setItem('morphswift-active-merchant', JSON.stringify(merchant));
    window.location.href = 'checkout.html';
  } catch (error) {
    console.error(error);
    alert(error.message || 'Unable to create checkout quote');
  } finally {
    if (button) button.style.opacity = '';
  }
}

function bindButtons() {
  window.chargeNow = chargeNow;
  window.setCurrency = setCurrency;
  window.keyPress = (key) => pressKey(key);

  document.addEventListener('keydown', (event) => {
    if (event.key >= '0' && event.key <= '9') {
      pressKey(event.key);
    } else if (event.key === 'Backspace') {
      state.raw = state.raw.slice(0, -1);
      updateConversion();
    } else if (event.key === '.') {
      pressKey('.');
    } else if (event.key === 'Enter') {
      chargeNow();
    }
  });
}

export async function initTerminalPage() {
  state.merchant = getSession().merchant;
  state.rates = await loadPriceSettings();
  bindButtons();
  updateMerchantChip();
  await updateConversion();
}
