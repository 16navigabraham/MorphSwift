import { createWithdrawal, estimateNet } from '../withdraw.js';
import { computeStats, fetchLedger, loadLocalHistory, mergeTransactions, downloadCsv, mapApiTransaction } from '../ledger.js';
import { getMerchantId } from '../magic.js';

const state = {
  filter: 'all',
  merchantId: null,
  transactions: [],
  apiWithdrawals: [],
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function dateKey(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function statusIcon(status) {
  if (status === 'confirmed') return '✓';
  if (status === 'pending') return '◷';
  if (status === 'failed') return '✕';
  if (status === 'withdrawn') return '↑';
  return '?';
}

function renderMiniChart(chartTotals, chartLabels) {
  const chartEl = document.getElementById('mini-chart');
  const labelsEl = document.getElementById('chart-labels');
  if (!chartEl || !labelsEl) return;

  const maxVal = Math.max(...chartTotals, 1);
  chartEl.innerHTML = chartTotals
    .map((value, index) => {
      const pct = Math.max(8, Math.round((value / maxVal) * 100));
      const isToday = index === chartTotals.length - 1;
      return `<div class="mini-bar ${isToday ? 'today' : ''}" style="height:${pct}%" title="$${value.toFixed(2)}"></div>`;
    })
    .join('');
  labelsEl.innerHTML = chartLabels.map((label) => `<span>${label}</span>`).join('');
}

function renderList() {
  const container = document.getElementById('tx-list');
  if (!container) return;

  const filtered = state.filter === 'all' ? state.transactions : state.transactions.filter((transaction) => transaction.status === state.filter);
  setText('filter-count', `${filtered.length} txn${filtered.length === 1 ? '' : 's'}`);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">◈</div><div class="empty-title">No transactions</div><p class="empty-sub">Your payments will appear here after the first checkout.</p></div>';
    return;
  }

  const groups = new Map();
  for (const transaction of filtered) {
    const key = dateKey(transaction.timestamp);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(transaction);
  }

  container.innerHTML = Array.from(groups.entries())
    .map(([day, transactions]) => {
      const dayTotal = transactions.filter((transaction) => transaction.status === 'confirmed').reduce((sum, transaction) => sum + transaction.usdAmount, 0);
      const rows = transactions
        .map((transaction) => {
          const fiatSymbol = transaction.fiatCurrency === 'PHP' ? '₱' : transaction.fiatCurrency === 'USD' ? '$' : transaction.fiatCurrency;
          return `
            <div class="tx-item" onclick="showTxDetail('${transaction.id}')">
              <div class="tx-icon ${transaction.status}">${statusIcon(transaction.status)}</div>
              <div class="tx-info">
                <div class="tx-primary">
                  <span class="tx-amount">$${transaction.usdAmount.toFixed(2)}</span>
                  <span class="tx-token">${transaction.token}</span>
                  <span class="tx-fiat">${fiatSymbol}${Number(transaction.fiatAmount).toLocaleString()}</span>
                </div>
                <div class="tx-secondary">
                  <span class="tx-network-pill">${transaction.network}</span>
                  <span class="tx-hash">${transaction.hash || '0x…'}</span>
                  <span class="tx-time">${fmtTime(transaction.timestamp)}</span>
                </div>
              </div>
              <span class="status-pill ${transaction.status}">${transaction.status}</span>
            </div>`;
        })
        .join('');

      return `<div class="day-group-header"><span class="day-label">${day}</span><span class="day-total">$${dayTotal.toFixed(2)}</span></div>${rows}`;
    })
    .join('');
}

function setFilter(filter, button) {
  state.filter = filter;
  document.querySelectorAll('.filter-tab').forEach((tab) => tab.classList.remove('active'));
  button?.classList.add('active');
  renderList();
}

function showTxDetail(id) {
  const tx = state.transactions.find((transaction) => String(transaction.id) === String(id));
  if (!tx) return;
  alert(`Tx: ${tx.hash || '—'}\nAmount: $${tx.usdAmount.toFixed(2)} ${tx.token}\nNetwork: ${tx.network}\nStatus: ${tx.status}\nTime: ${new Date(tx.timestamp).toLocaleString()}`);
}

async function loadLedger() {
  state.merchantId = getMerchantId();
  if (!state.merchantId) {
    window.location.href = 'onboarding.html';
    return;
  }

  const apiLedger = await fetchLedger(state.merchantId, 100);
  const localHistory = loadLocalHistory().map((entry) => ({
    id: entry.id,
    timestamp: entry.timestamp,
    usdAmount: Number(entry.usdAmount ?? entry.amount ?? 0),
    fiatAmount: Number(entry.fiatAmount ?? 0),
    fiatCurrency: entry.fiatCurrency ?? 'USD',
    token: entry.token ?? 'USDC',
    network: entry.network ?? 'Morph',
    status: entry.status ?? 'confirmed',
    hash: entry.hash ?? entry.txHash ?? '',
  }));

  const apiTransactions = (apiLedger?.transactions ?? []).map(mapApiTransaction);
  state.transactions = mergeTransactions(apiTransactions, localHistory);
  state.apiWithdrawals = apiLedger?.withdrawals ?? [];

  const stats = computeStats(state.transactions);
  setText('today-rev', `$${stats.todayRev.toFixed(2)}`);
  setText('today-count', `↑ ${stats.todayCount} txn${stats.todayCount === 1 ? '' : 's'}`);
  setText('week-rev', `$${stats.weekRev.toFixed(2)}`);
  setText('balance', `$${Number(apiLedger?.balance ?? stats.balance).toFixed(2)} USDC`);
  setText('modal-balance', `$${Number(apiLedger?.balance ?? stats.balance).toFixed(2)} USDC`);
  setText('modal-net', `$${estimateNet(apiLedger?.balance ?? stats.balance).toFixed(2)} USDC`);
  renderMiniChart(stats.chartTotals, stats.chartLabels);
  renderList();
}

function openWithdraw() {
  document.getElementById('modal')?.classList.add('open');
}

function closeModal() {
  document.getElementById('modal')?.classList.remove('open');
}

async function confirmWithdraw() {
  const address = document.getElementById('dest-addr')?.value.trim();
  const balanceText = document.getElementById('balance')?.textContent || '$0.00 USDC';
  const amount = Number.parseFloat(balanceText.replace(/[^0-9.]/g, '')) || 0;
  if (!address) {
    const input = document.getElementById('dest-addr');
    if (input) {
      input.style.borderColor = 'rgba(226,75,74,0.5)';
      setTimeout(() => { input.style.borderColor = ''; }, 2000);
    }
    return;
  }

  const button = document.querySelector('.modal-confirm-btn');
  if (button) {
    button.textContent = 'Processing…';
    button.style.opacity = '0.7';
  }

  try {
    await createWithdrawal({ amount, token: 'USDC', destination: address });
    await loadLedger();
    if (button) {
      button.textContent = '✓ Withdrawal Initiated';
      button.style.background = 'var(--green)';
    }
    setTimeout(() => {
      closeModal();
      if (button) {
        button.textContent = 'Confirm Withdrawal';
        button.style.background = '';
        button.style.opacity = '';
      }
    }, 1500);
  } catch (error) {
    console.error(error);
    alert(error.message || 'Withdrawal failed');
    if (button) {
      button.textContent = 'Confirm Withdrawal';
      button.style.background = '';
      button.style.opacity = '';
    }
  }
}

function exportCSV() {
  downloadCsv(state.transactions);
}

export function initLedgerPage() {
  window.setFilter = setFilter;
  window.showTxDetail = showTxDetail;
  window.openWithdraw = openWithdraw;
  window.closeModal = closeModal;
  window.confirmWithdraw = confirmWithdraw;
  window.exportCSV = exportCSV;

  document.getElementById('modal')?.addEventListener('click', (event) => {
    if (event.target === document.getElementById('modal')) closeModal();
  });

  loadLedger().catch((error) => {
    console.error(error);
    alert(error.message || 'Unable to load ledger');
  });
}
