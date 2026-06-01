"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONFIG } from '../../config.js';
import { createWithdrawal, estimateNet } from '../../assets/js/withdraw.js';
import { computeStats, fetchLedger, loadLocalHistory, mergeTransactions, downloadCsv, mapApiTransaction } from '../../assets/js/ledger.js';
import { getMerchantId, getSession, loginWithWallet, saveSession } from '../../assets/js/magic.js';
import { formatFiatSymbol } from '../../assets/js/priceFeeds.js';
import { fetchOnChainBalances } from '../../assets/js/gatewayContract.js';
import TokenLogo from '../components/TokenLogo';

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
  const [serverOnline, setServerOnline] = useState(true);
  const [onChainBalance, setOnChainBalance] = useState({ usdc: null, usdt: null });
  const [selectedTx, setSelectedTx] = useState(null);
  const [pendingCheckouts, setPendingCheckouts] = useState([]);

  useEffect(() => {
    const session = getSession();
    if (!session.merchant) {
      router.replace('/onboarding');
      return;
    }
    // Re-authenticate to ensure merchant exists in server DB after any restart
    const walletAddress = session.merchant.walletAddress || session.merchant.email;
    if (walletAddress) {
      loginWithWallet(walletAddress)
        .then((freshSession) => {
          saveSession(freshSession);
          setMerchantId(freshSession.merchant.id);
        })
        .catch(() => {
          setMerchantId(session.merchant.id);
        });
    } else {
      setMerchantId(session.merchant.id);
    }

    if (walletAddress?.startsWith('0x')) {
      fetchOnChainBalances(walletAddress)
        .then(setOnChainBalance)
        .catch(() => {});
    }
  }, [router]);

  useEffect(() => {
    if (!merchantId) return;
    let alive = true;

    (async () => {
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

      let apiLedger = null;
      try {
        apiLedger = await fetchLedger(merchantId, 100);
        setServerOnline(true);
        setPendingCheckouts(apiLedger?.pendingCheckouts ?? []);
      } catch {
        setServerOnline(false);
      }

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
    })();

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
        {!serverOnline && (
          <div style={{ background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.25)', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: '#ffb1b1' }}>
            Server unreachable — showing local transaction history only. Balance may be outdated.
          </div>
        )}
        {/* Metrics & wallet */}
        <div className="grid-2">
          <article className="summary-card">
            <p className="section-label">Revenue</p>
            <div className="metrics-grid">
              <div className="metric"><div><div className="metric-label">Today</div><div className="metric-value">{todayRev.toFixed(2)} USDC</div></div><div className="metric-sub">↑ {todayCount} txn{todayCount === 1 ? '' : 's'}</div></div>
              <div className="metric"><div><div className="metric-label">7 day</div><div className="metric-value">{weekRev.toFixed(2)} USDC</div></div><div className="metric-sub">Rolling total</div></div>
              <div className="metric"><div><div className="metric-label">Earned</div><div className="metric-value">{balance.toFixed(2)} USDC</div></div><div className="metric-sub">Platform balance</div></div>
            </div>
            <div className="mini-chart" style={{ marginTop: 12 }}>
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
            <p className="section-label">On-chain wallet</p>
            {[
              { token: 'USDC', value: onChainBalance.usdc },
              { token: 'USDT', value: onChainBalance.usdt },
            ].map(({ token, value }) => (
              <div key={token} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TokenLogo token={token} size={22} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{token}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>Real balance</div>
                  </div>
                </div>
                <span style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 20, fontWeight: 800, letterSpacing: '-0.05em' }}>
                  {value === null ? '—' : Number(value).toFixed(2)}
                </span>
              </div>
            ))}
          </article>
        </div>

        {/* Pending & Expired Checkouts */}
        {pendingCheckouts.length > 0 && (() => {
          const pending = pendingCheckouts.filter((c) => c.status === 'pending');
          const expired = pendingCheckouts.filter((c) => c.status === 'expired');
          return (
            <article className="summary-card">
              <p className="section-label">Pending payments</p>
              {pending.length > 0 && (
                <div className="tx-list" style={{ marginBottom: 14 }}>
                  {pending.map((co) => (
                    <a key={co.id} href={`/checkout?id=${co.id}`} style={{ textDecoration: 'none' }}>
                      <div className="tx-item" style={{ borderColor: 'rgba(242,173,61,0.3)' }}>
                        <div className="tx-icon pending">◷</div>
                        <div className="tx-info">
                          <div className="tx-primary">
                            <span className="tx-amount">{Number(co.stablecoinAmount).toFixed(2)}</span>
                            <span className="tx-token" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <TokenLogo token={co.token} size={14} />{co.token}
                            </span>
                            <span className="tx-fiat">{formatFiatSymbol(co.currency)}{Number(co.amountFiat).toLocaleString()}</span>
                          </div>
                          <div className="tx-secondary">
                            <span>{fmtTime(co.createdAt)}</span>
                            <span style={{ fontSize: 10, color: 'var(--amber)' }}>Open checkout →</span>
                          </div>
                        </div>
                        <span className="status-pill pending">pending</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
              {pending.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 14px' }}>None</p>}

              {expired.length > 0 && (
                <>
                  <p className="section-label" style={{ marginTop: 4 }}>Expired</p>
                  <div className="tx-list" style={{ marginBottom: 14 }}>
                    {expired.map((co) => (
                      <div key={co.id} className="tx-item" style={{ opacity: 0.6 }}>
                        <div className="tx-icon failed">✕</div>
                        <div className="tx-info">
                          <div className="tx-primary">
                            <span className="tx-amount">{Number(co.stablecoinAmount).toFixed(2)}</span>
                            <span className="tx-token" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <TokenLogo token={co.token} size={14} />{co.token}
                            </span>
                            <span className="tx-fiat">{formatFiatSymbol(co.currency)}{Number(co.amountFiat).toLocaleString()}</span>
                          </div>
                          <div className="tx-secondary">
                            <span>{fmtTime(co.createdAt)}</span>
                          </div>
                        </div>
                        <span className="status-pill failed">expired</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </article>
        )})()}

        {/* Transaction history */}
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
                        const fiatSymbol = formatFiatSymbol(transaction.fiatCurrency);
                        return (
                          <div key={transaction.id} className="tx-item" onClick={() => setSelectedTx(transaction)}>
                            <div className={`tx-icon ${transaction.status}`}>{statusIcon(transaction.status)}</div>
                            <div className="tx-info">
                              <div className="tx-primary">
                                <span className="tx-amount">{transaction.usdAmount.toFixed(2)}</span>
                                <span className="tx-token" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <TokenLogo token={transaction.token} size={14} />
                                  {transaction.token}
                                </span>
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
      </section>

      {/* Withdraw modal */}
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
            <span className="tiny">Net estimate: {estimateNet(balance).toFixed(2)} USDC</span>
            <button className="modal-confirm-btn" onClick={confirmWithdraw} disabled={loading}>{loading ? 'Processing…' : 'Confirm Withdrawal'}</button>
          </div>
        </div>
      </div>

      {/* Transaction receipt modal */}
      <div className={`modal-backdrop ${selectedTx ? 'open' : ''}`} onClick={(e) => e.target === e.currentTarget && setSelectedTx(null)}>
        {selectedTx && (
          <div className="modal">
            <div className="modal-head">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className={`tx-icon ${selectedTx.status}`} style={{ width: 28, height: 28, fontSize: 13 }}>
                  {statusIcon(selectedTx.status)}
                </div>
                Receipt
              </h3>
              <button className="button ghost" onClick={() => setSelectedTx(null)}>✕</button>
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <TokenLogo token={selectedTx.token} size={28} />
                    <span style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 36, fontWeight: 800, letterSpacing: '-0.06em' }}>
                      {selectedTx.usdAmount.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{selectedTx.token}</div>
                </div>
              </div>

              {[
                { label: 'Status', value: <span className={`status-pill ${selectedTx.status}`}>{selectedTx.status}</span> },
                { label: 'Fiat amount', value: `${formatFiatSymbol(selectedTx.fiatCurrency)}${Number(selectedTx.fiatAmount).toLocaleString()} ${selectedTx.fiatCurrency}` },
                { label: 'Network', value: selectedTx.network },
                { label: 'Date', value: new Date(selectedTx.timestamp).toLocaleString() },
                { label: 'Tx hash', value: selectedTx.hash || '—', mono: true },
              ].map(({ label, value, mono }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
                  <span style={{ fontSize: mono ? 11 : 13, fontFamily: mono ? 'monospace' : 'inherit', fontWeight: 600, wordBreak: 'break-all', textAlign: 'right', maxWidth: '60%' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <div className="button-row" style={{ marginTop: 16 }}>
              {selectedTx.hash && selectedTx.hash !== '—' && (
                <a
                  className="button primary"
                  href={`${CONFIG.contract.blockExplorerUrls[0]}/tx/${selectedTx.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on explorer
                </a>
              )}
              <button className="button" onClick={() => navigator.clipboard?.writeText(selectedTx.hash || '').catch(() => {})}>
                Copy hash
              </button>
              <button className="button ghost" onClick={() => setSelectedTx(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
