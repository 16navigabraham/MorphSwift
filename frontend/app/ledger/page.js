"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONFIG } from '../../config.js';
import { createWithdrawal, estimateNet } from '../../assets/js/withdraw.js';
import { computeStats, fetchLedger, loadLocalHistory, mergeTransactions, downloadCsv, mapApiTransaction } from '../../assets/js/ledger.js';
import { getMerchantId } from '../../assets/js/magic.js';

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

import WalletConnect from '../components/WalletConnect';

export default function LedgerPage() {
  const router = useRouter();
  const [filter, setFilter] = useState('all');
  const [merchantId, setMerchantId] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [chartTotals, setChartTotals] = useState([]);
  const [chartLabels, setChartLabels] = useState([]);
  const [todayRev, setTodayRev] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [weekRev, setWeekRev] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = getMerchantId();
    if (!id) {
      router.replace('/onboarding');
      return;
    }
    setMerchantId(id);
  }, [router]);

  useEffect(() => {
    if (!merchantId) return;
    let alive = true;

    (async () => {
      const apiLedger = await fetchLedger(merchantId, 100);
      const localHistory = loadLocalHistory().map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        usdAmount: Number(entry.usdAmount ?? entry.amount ?? 0),
        fiatAmount: Number(entry.fiatAmount ?? 0),
        fiatCurrency: entry.fiatCurrency ?? 'USD',
        token: entry.token ?? 'USDC',
        network: entry.network ?? CONFIG.settlementNetwork,
        status: entry.status ?? 'confirmed',
        hash: entry.hash ?? entry.txHash ?? '',
      }));

      const apiTransactions = (apiLedger?.transactions ?? []).map(mapApiTransaction);
      const merged = mergeTransactions(apiTransactions, localHistory);
      const stats = computeStats(merged);

      if (!alive) return;
      setTransactions(merged);
      setBalance(Number(apiLedger?.balance ?? stats.balance));
      setChartTotals(stats.chartTotals);
      setChartLabels(stats.chartLabels);
      setTodayRev(stats.todayRev);
      setTodayCount(stats.todayCount);
      setWeekRev(stats.weekRev);
    })().catch((error) => {
      alert(error.message || 'Unable to load ledger');
    });

    return () => {
      alive = false;
    };
  }, [merchantId]);

  const filtered = useMemo(
    () => (filter === 'all' ? transactions : transactions.filter((transaction) => transaction.status === filter)),
    [transactions, filter],
  );

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const transaction of filtered) {
      const key = dateKey(transaction.timestamp);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(transaction);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  async function confirmWithdraw() {
    const amount = Math.max(0, Number.parseFloat(String(balance)) || 0);
    if (!destination.trim()) {
      return;
    }
    setLoading(true);
    try {
      await createWithdrawal({ amount, token: 'USDC', destination });
      setModalOpen(false);
      setDestination('');
    } catch (error) {
      alert(error.message || 'Withdrawal failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <a className="button ghost" href="/terminal">← Terminal</a>
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>Ledger</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="button primary" onClick={() => setModalOpen(true)}>Withdraw</button>
          <WalletConnect />
        </div>
      </header>

      <section className="page stack">
        <div className="grid-2">
          <article className="summary-card">
            <p className="section-label">Revenue</p>
            <div className="metrics-grid">
              <div className="metric"><div><div className="metric-label">Today</div><div className="metric-value">${todayRev.toFixed(2)}</div></div><div className="metric-sub">↑ {todayCount} txn{todayCount === 1 ? '' : 's'}</div></div>
              <div className="metric"><div><div className="metric-label">7 day</div><div className="metric-value">${weekRev.toFixed(2)}</div></div><div className="metric-sub">Rolling total</div></div>
              <div className="metric"><div><div className="metric-label">Balance</div><div className="metric-value">${balance.toFixed(2)} {CONFIG.contract.nativeCurrency}</div></div><div className="metric-sub">Withdrawable</div></div>
            </div>

            <div className="divider" />
            <div className="mini-chart">
              {chartTotals.map((value, index) => {
                const maxVal = Math.max(...chartTotals, 1);
                const height = Math.max(10, Math.round((value / maxVal) * 100));
                return <div key={`${index}-${value}`} className={`mini-bar ${index === chartTotals.length - 1 ? 'today' : ''}`} style={{ height: `${height}%` }} title={`$${value.toFixed(2)}`} />;
              })}
            </div>
            <div className="chart-labels">
              {chartLabels.map((label) => <span key={label}>{label}</span>)}
            </div>
          </article>

          <article className="summary-card">
            <p className="section-label">Transactions</p>
            <div className="filter-row">
              {['all', 'confirmed', 'pending', 'failed'].map((item) => (
                <button key={item} className={`filter-tab ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)}>
                  {item}
                </button>
              ))}
              <button className="button" onClick={() => downloadCsv(transactions)}>Export CSV</button>
            </div>

            <div className="divider" />

            <div className="tx-list">
              {grouped.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">◈</div>
                  <div className="empty-title">No transactions</div>
                  <p className="empty-sub">Your payments will appear here after the first checkout.</p>
                </div>
              ) : grouped.map(([day, items]) => {
                const dayTotal = items.filter((item) => item.status === 'confirmed').reduce((sum, item) => sum + item.usdAmount, 0);
                return (
                  <div key={day}>
                    <div className="day-group-header"><span>{day}</span><span className="day-total">${dayTotal.toFixed(2)}</span></div>
                    <div className="stack" style={{ gap: 10 }}>
                      {items.map((transaction) => {
                        const fiatSymbol = transaction.fiatCurrency === 'PHP' ? '₱' : transaction.fiatCurrency === 'USD' ? '$' : transaction.fiatCurrency;
                        return (
                          <div key={transaction.id} className="tx-item" onClick={() => alert(`Tx: ${transaction.hash || '—'}\nAmount: $${transaction.usdAmount.toFixed(2)} ${transaction.token}\nNetwork: ${transaction.network}\nStatus: ${transaction.status}\nTime: ${new Date(transaction.timestamp).toLocaleString()}`)}>
                            <div className={`tx-icon ${transaction.status}`}>{statusIcon(transaction.status)}</div>
                            <div className="tx-info">
                              <div className="tx-primary">
                                <span className="tx-amount">${transaction.usdAmount.toFixed(2)}</span>
                                <span className="tx-token">{transaction.token}</span>
                                <span className="tx-fiat">{fiatSymbol}{Number(transaction.fiatAmount).toLocaleString()}</span>
                              </div>
                              <div className="tx-secondary">
                                <span className="pill" style={{ padding: '4px 8px' }}>{transaction.network}</span>
                                <span>{transaction.hash || '0x…'}</span>
                                <span>{fmtTime(transaction.timestamp)}</span>
                              </div>
                            </div>
                            <span className={`status-pill ${transaction.status}`}>{transaction.status}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </div>
      </section>

      <div className={`modal-backdrop ${modalOpen ? 'open' : ''}`} onClick={(event) => event.target === event.currentTarget && setModalOpen(false)}>
        <div className="modal">
          <div className="modal-head">
            <h3>Withdraw funds</h3>
            <button className="button ghost" onClick={() => setModalOpen(false)}>✕</button>
          </div>
          <p className="help">Send the withdrawable balance to your payout address.</p>
          <div style={{ marginTop: 14 }}>
            <label className="section-label" htmlFor="destination">Destination wallet</label>
            <input id="destination" className="address-input" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="0x..." />
          </div>
          <div className="modal-foot" style={{ marginTop: 14 }}>
            <span className="tiny">Net estimate: ${estimateNet(balance).toFixed(2)} {CONFIG.contract.nativeCurrency}</span>
            <button className="modal-confirm-btn" onClick={confirmWithdraw} disabled={loading}>{loading ? 'Processing…' : 'Confirm Withdrawal'}</button>
          </div>
        </div>
      </div>
    </main>
  );
}
