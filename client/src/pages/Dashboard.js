import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  FaDollarSign,
  FaWarehouse,
  FaHandshake,
  FaClipboardList,
  FaHistory,
  FaWallet,
  FaCoins,
  FaCertificate,
  FaFolderOpen
} from 'react-icons/fa';
import MutualNetReport from '../components/MutualNetReport';
import './Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isAccountant = user?.role === 'accountant';
  const isDealer = user?.role === 'dealer';

  const [stats, setStats] = useState({
    totalDeals: 0,
    activeDeals: 0,
    pendingDeals: 0,
    availableInventoryPlots: 0,
    pendingRequests: 0,
  });
  const [finance, setFinance] = useState({
    total_revenue: 0,
    total_profit: 0,
    dealer_finance_balance: 0,
  });
  const [ledgerBalances, setLedgerBalances] = useState({});
  const [mutualSummary, setMutualSummary] = useState({ owe: 0, owed: 0 });
  const [allDealerBalances, setAllDealerBalances] = useState([]);
  const [projectBalances, setProjectBalances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
    // Depend on the user id rather than the user object: AuthContext hands back a
    // freshly-parsed object on every /auth/me response, so keying off the object
    // reference re-triggers this fetch even when the logged-in user hasn't changed.
  }, [user?.id]);

  const fetchDashboardData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const userRole = user.role;
      const isMgmt = userRole === 'admin' || userRole === 'accountant';

      // Fetch each resource independently to prevent one failure from blocking others
      const fetchDeals = api.get('/deals').catch(e => ({ data: [] }));
      const fetchInventory = api.get('/inventory').catch(e => ({ data: [] }));
      const fetchFinance = api.get('/finance/summary').catch(e => ({ data: { total_revenue: 0, total_profit: 0 } }));
      const fetchRequests = isMgmt ? api.get('/inventory-requests').catch(e => ({ data: [] })) : Promise.resolve({ data: [] });
      const fetchBalances = api.get('/dealer-exchanges/balances').catch(e => ({ data: { peerBalances: [], ledgerBalances: {} } }));
      const fetchProjectBalances = isMgmt ? api.get('/balance-projects').catch(e => ({ data: [] })) : Promise.resolve({ data: [] });

      const [dealsRes, inventoryRes, financeRes, reqsRes, mutualsRes, projectBalancesRes] = await Promise.all([
        fetchDeals, fetchInventory, fetchFinance, fetchRequests, fetchBalances, fetchProjectBalances
      ]);

      const deals = dealsRes.data || [];
      const inventory = inventoryRes.data || [];
      const requests = reqsRes.data || [];
      const mutualsData = mutualsRes.data || {};
      
      let availablePlotsCount = 0;
      inventory.forEach(inv => {
        if (inv.available_quantity) availablePlotsCount += parseInt(inv.available_quantity);
        else if (inv.unassigned_plots) availablePlotsCount += inv.unassigned_plots.length;
      });

      setStats({
        totalDeals: deals.length,
        activeDeals: deals.filter(d => d.status === 'in_progress').length,
        pendingDeals: deals.filter(d => d.status === 'not_done').length,
        availableInventoryPlots: availablePlotsCount,
        pendingRequests: requests.filter(r => r.status === 'pending').length,
      });

      setFinance(financeRes.data || { total_revenue: 0, total_profit: 0 });

      // Update Ledger Balances
      setLedgerBalances(mutualsData.ledgerBalances || {});

      // Update Project-wise Balance Breakdown (Dealer Advances + Advance for Certificate)
      setProjectBalances(projectBalancesRes.data || []);
      
      // Update Peer Balances
      const pBalances = mutualsData.peerBalances || [];
      setAllDealerBalances(pBalances);

      // Calculate personal/aggregate mutual summary
      const totalPositive = pBalances.filter(b => parseFloat(b.net_balance) > 0)
        .reduce((sum, b) => sum + parseFloat(b.net_balance), 0);
      const totalNegative = pBalances.filter(b => parseFloat(b.net_balance) < 0)
        .reduce((sum, b) => sum + Math.abs(parseFloat(b.net_balance)), 0);
      
      // Card 1 (owe): Admin Asset OR Dealer Liability
      // Card 2 (owed): Admin Liability OR Dealer Asset
      const owe = isMgmt ? totalPositive : totalNegative;
      const owed = isMgmt ? totalNegative : totalPositive;
      
      setMutualSummary({ owe, owed });

    } catch (error) {
      console.error('Error in dashboard logic:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="dashboard-loading">Loading Command Center...</div>;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div className="welcome-section">
          <h1>Welcome back, {user?.name}</h1>
          <p>Here's what's happening with your operations today.</p>
        </div>
        <div className="header-date">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Admin/Accountant Main Ledger Topline */}
      {(isAdmin || isAccountant) && (
        <div className="topline-ledger-row">
          <div className="ledger-card glass-card gold-border">
            <div className="card-icon"><FaWallet /></div>
            <div className="card-info">
              <span className="label">Dealer Advances</span>
              <span className="value">Rs. {Math.abs(parseFloat(ledgerBalances.dealerAdvances || 0)).toLocaleString()}</span>
            </div>
          </div>
          <div className="ledger-card glass-card blue-border">
            <div className="card-icon"><FaCoins /></div>
            <div className="card-info">
              <span className="label">Savings Deposits</span>
              <span className="value">Rs. {Math.abs(parseFloat(ledgerBalances.savingsDeposits || 0)).toLocaleString()}</span>
            </div>
          </div>
          <div className="ledger-card glass-card green-border">
            <div className="card-icon"><FaCertificate /></div>
            <div className="card-info">
              <span className="label">Advance for Certificate</span>
              <span className="value">Rs. {Math.abs(parseFloat(ledgerBalances.advanceForCertificate || 0)).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Balance by Project */}
      {(isAdmin || isAccountant) && projectBalances.length > 0 && (() => {
        const sortedProjects = [...projectBalances].sort(
          (a, b) => parseFloat(b.total_balance) - parseFloat(a.total_balance)
        );
        const projectAdvancesSum = projectBalances.reduce((s, p) => s + parseFloat(p.advances_balance || 0), 0);
        const projectCertSum = projectBalances.reduce((s, p) => s + parseFloat(p.certificate_balance || 0), 0);
        const unassignedAdvances = parseFloat(ledgerBalances.dealerAdvances || 0) - projectAdvancesSum;
        const unassignedCert = parseFloat(ledgerBalances.advanceForCertificate || 0) - projectCertSum;
        const unassignedTotal = unassignedAdvances + unassignedCert;

        return (
          <div className="stats-section glass-card project-balances-section" style={{ marginBottom: '2rem' }}>
            <div className="section-header">
              <FaFolderOpen className="header-icon inventory" />
              <h2>Balance by Project</h2>
            </div>
            <div className="project-balance-table-wrap">
              <table className="project-balance-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Dealer Advances</th>
                    <th>Advance for Certificate</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProjects.map(p => (
                    <tr key={p.id}>
                      <td className="project-name-cell" data-label="Project">{p.name}</td>
                      <td data-label="Dealer Advances">Rs. {Math.abs(parseFloat(p.advances_balance || 0)).toLocaleString()}</td>
                      <td data-label="Advance for Certificate">Rs. {Math.abs(parseFloat(p.certificate_balance || 0)).toLocaleString()}</td>
                      <td className="project-total-cell" data-label="Total">Rs. {Math.abs(parseFloat(p.total_balance || 0)).toLocaleString()}</td>
                    </tr>
                  ))}
                  {Math.abs(unassignedTotal) > 0.01 && (
                    <tr className="project-unassigned-row">
                      <td className="project-name-cell" data-label="Project">Unassigned</td>
                      <td data-label="Dealer Advances">Rs. {Math.abs(unassignedAdvances).toLocaleString()}</td>
                      <td data-label="Advance for Certificate">Rs. {Math.abs(unassignedCert).toLocaleString()}</td>
                      <td className="project-total-cell" data-label="Total">Rs. {Math.abs(unassignedTotal).toLocaleString()}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="summary-footer">Visit the Manage Balances page for full project detail and history.</p>
          </div>
        );
      })()}

      <div className="main-stats-grid">
        {/* Finance Overview */}
        <div className="stats-section glass-card">
          <div className="section-header">
            <FaDollarSign className="header-icon finance" />
            <h2>Finance Overview</h2>
          </div>
          <div className="finance-grid">
            {isDealer && (
              <div className="stat-item">
                <span className="stat-label">Wallet Balance</span>
                <span className="stat-value profit" style={{ color: 'var(--success)', fontSize: '1.4rem' }}>Rs. {parseFloat(finance.dealer_finance_balance || 0).toLocaleString()}</span>
              </div>
            )}
            <div className="stat-item">
              <span className="stat-label">{isAccountant ? 'Network Revenue' : 'Total Revenue'}</span>
              <span className="stat-value revenue">Rs. {parseFloat(finance.total_revenue || 0).toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">{isAccountant ? 'System Profits' : 'Total Profit'}</span>
              <span className="stat-value profit">Rs. {parseFloat(finance.total_profit || 0).toLocaleString()}</span>
            </div>
          </div>
          {isAccountant && ledgerBalances.dealerFinanceBreakdown?.length > 0 && (
            <div className="dealer-finance-breakdown" style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '1rem' }}>
              <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dealer Wallet Breakdown</h4>
              <div className="mini-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {ledgerBalances.dealerFinanceBreakdown.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 500 }}>{d.name}</span>
                    <span style={{ fontWeight: 700, color: 'var(--success)' }}>Rs. {parseFloat(d.balance).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mutuals Overview & Breakdown */}
        <div className="stats-section glass-card">
          <div className="section-header">
            <FaHistory className="header-icon mutuals" />
            <h2>Mutual Exchanges</h2>
          </div>

          <MutualNetReport
            balances={allDealerBalances}
            isAdmin={isAdmin}
            isAccountant={isAccountant}
            mode="card"
          />

          <p className="summary-footer">Visit the Mutuals page for a detailed breakdown.</p>
        </div>

        {/* Operations Overview */}
        <div className="stats-section glass-card wider">
          <div className="section-header">
            <FaWarehouse className="header-icon inventory" />
            <h2>Operations & Inventory</h2>
          </div>
          <div className="ops-grid">
            <div className="ops-item">
              <FaHandshake className="ops-icon" />
              <div className="ops-content">
                <span className="ops-value">{stats.activeDeals}</span>
                <span className="ops-label">Active Deals</span>
              </div>
            </div>
            <div className="ops-item">
              <FaWarehouse className="ops-icon" />
              <div className="ops-content">
                <span className="ops-value">{stats.availableInventoryPlots}</span>
                <span className="ops-label">Available Plots</span>
              </div>
            </div>
            {(isAdmin || isAccountant) && (
              <div className="ops-item attention">
                <FaClipboardList className="ops-icon" />
                <div className="ops-content">
                  <span className="ops-value">{stats.pendingRequests}</span>
                  <span className="ops-label">Pending Requests</span>
                </div>
              </div>
            )}
            <div className="ops-item">
              <FaHistory className="ops-icon" />
              <div className="ops-content">
                <span className="ops-value">{stats.pendingDeals}</span>
                <span className="ops-label">Pending Deals</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
