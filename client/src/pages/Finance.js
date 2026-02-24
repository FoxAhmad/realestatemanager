import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Finance.css';

const Finance = () => {
  const { isAdmin } = useAuth();
  const [summary, setSummary] = useState({
    total_revenue: 0,
    total_profit: 0,
    monthly_revenue: 0,
    monthly_profit: 0,
    completed_deals: 0,
    active_deals: 0,
  });
  const [monthlyData, setMonthlyData] = useState([]);
  const [dealerData, setDealerData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinanceData();
  }, []);

  const fetchFinanceData = async () => {
    try {
      const [summaryRes, monthlyRes] = await Promise.all([
        api.get('/finance/summary'),
        api.get('/finance/monthly'),
      ]);

      setSummary(summaryRes.data);
      setMonthlyData(monthlyRes.data);

      if (isAdmin) {
        const dealerRes = await api.get('/finance/by-dealer');
        setDealerData(dealerRes.data);
      }
    } catch (error) {
      console.error('Error fetching finance data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="finance-loading">Loading finance data...</div>;
  }

  return (
    <div className="finance">
      <h1 className="finance-title">Finance</h1>

      <div className="finance-summary">
        <div className="summary-card">
          <h3>Total Revenue</h3>
          <p className="amount revenue">${parseFloat(summary.total_revenue || 0).toLocaleString()}</p>
        </div>
        <div className="summary-card">
          <h3>Total Profit</h3>
          <p className="amount profit">${parseFloat(summary.total_profit || 0).toLocaleString()}</p>
        </div>
        <div className="summary-card">
          <h3>Monthly Revenue</h3>
          <p className="amount revenue">${parseFloat(summary.monthly_revenue || 0).toLocaleString()}</p>
        </div>
        <div className="summary-card">
          <h3>Monthly Profit</h3>
          <p className="amount profit">${parseFloat(summary.monthly_profit || 0).toLocaleString()}</p>
        </div>
        <div className="summary-card">
          <h3>Completed Deals</h3>
          <p className="amount">{summary.completed_deals || 0}</p>
        </div>
        <div className="summary-card">
          <h3>Active Deals</h3>
          <p className="amount">{summary.active_deals || 0}</p>
        </div>
      </div>

      <div className="finance-section">
        <h2>Monthly Breakdown</h2>
        <div className="monthly-table-container">
          <table className="monthly-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Revenue</th>
                <th>Profit</th>
                <th>Deals</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty-state">No data available</td>
                </tr>
              ) : (
                monthlyData.map((month, index) => (
                  <tr key={index}>
                    <td>{new Date(month.month).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</td>
                    <td>${parseFloat(month.revenue || 0).toLocaleString()}</td>
                    <td>${parseFloat(month.profit || 0).toLocaleString()}</td>
                    <td>{month.deals_count || 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && dealerData.length > 0 && (
        <div className="finance-section">
          <h2>Salesperson Performance</h2>
          <div className="dealer-table-container">
            <table className="dealer-table">
              <thead>
                <tr>
                  <th>Salesperson Name</th>
                  <th>Email</th>
                  <th>Total Revenue</th>
                  <th>Total Profit</th>
                  <th>Completed Deals</th>
                </tr>
              </thead>
              <tbody>
                {dealerData.map((dealer) => (
                  <tr key={dealer.dealer_id}>
                    <td>{dealer.dealer_name}</td>
                    <td>{dealer.dealer_email}</td>
                    <td>${parseFloat(dealer.total_revenue || 0).toLocaleString()}</td>
                    <td>${parseFloat(dealer.total_profit || 0).toLocaleString()}</td>
                    <td>{dealer.completed_deals || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Finance;

