import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FaChartBar, FaCalendarAlt, FaUserTie } from 'react-icons/fa';
import './Finance.css';

const Finance = () => {
  const [summary, setSummary] = useState({
    total_revenue: 0,
    total_profit: 0,
    monthly_stats: [],
    dealer_stats: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinanceData();
  }, []);

  const fetchFinanceData = async () => {
    try {
      const response = await api.get('/finance/summary');
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching finance data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="finance-loading">Generating Financial Reports...</div>;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Financial Analytics</h1>
          <p>Real-time performance tracking and revenue distribution across all sectors.</p>
        </div>
      </div>

      <div className="finance-summary-grid">
        <div className="summary-card glass-card">
          <label>Gross Revenue</label>
          <span className="amount revenue">${parseFloat(summary.total_revenue || 0).toLocaleString()}</span>
        </div>
        <div className="summary-card glass-card">
          <label>Company Profit</label>
          <span className="amount profit">${parseFloat(summary.total_profit || 0).toLocaleString()}</span>
        </div>
        <div className="summary-card glass-card">
           <label>Active Accounts</label>
           <span className="amount" style={{ fontSize: '2.25rem' }}>{summary.monthly_stats?.length || 0} Months</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Monthly Performance */}
        <section className="finance-section">
          <h2><FaCalendarAlt style={{ color: 'var(--primary)' }} /> Monthly Breakdown</h2>
          <div className="glass-card" style={{ padding: '0' }}>
            <div className="premium-table-container">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Gross Revenue</th>
                    <th>Net Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(!summary.monthly_stats || summary.monthly_stats.length === 0) ? (
                    <tr><td colSpan="3" className="empty-state">No monthly data available</td></tr>
                  ) : (
                    summary.monthly_stats.map((stat, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: '700' }}>{stat.month}</td>
                        <td>${parseFloat(stat.revenue).toLocaleString()}</td>
                        <td style={{ color: 'var(--success)', fontWeight: '700' }}>${parseFloat(stat.profit).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Salesperson Performance */}
        <section className="finance-section">
          <h2><FaUserTie style={{ color: 'var(--primary)' }} /> Sales Performance</h2>
          <div className="glass-card" style={{ padding: '0' }}>
            <div className="premium-table-container">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Salesperson</th>
                    <th>Volume</th>
                    <th>Commission (40%)</th>
                  </tr>
                </thead>
                <tbody>
                  {(!summary.dealer_stats || summary.dealer_stats.length === 0) ? (
                    <tr><td colSpan="3" className="empty-state">No dealer stats available</td></tr>
                  ) : (
                    summary.dealer_stats.map((stat, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: '700' }}>{stat.dealer_name}</td>
                        <td>${parseFloat(stat.total_volume).toLocaleString()}</td>
                        <td>${parseFloat(stat.total_commission).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Finance;
