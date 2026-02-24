import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  FaChartLine,
  FaCheckCircle,
  FaDollarSign,
  FaUsers,
  FaHandHoldingUsd,
  FaClock,
  FaChartBar,
  FaUserTie,
  FaPercentage,
  FaMoneyBillWave,
  FaWarehouse,
  FaMoneyBillWave as FaInvestors
} from 'react-icons/fa';
import './Dashboard.css';

const Dashboard = () => {
  const { isAdmin, user } = useAuth();
  const [stats, setStats] = useState({
    totalDeals: 0,
    activeDeals: 0,
    completedDeals: 0,
    totalCustomers: 0,
    pendingDeals: 0,
    totalDealers: 0,
    totalInventory: 0,
    totalInvestors: 0,
  });
  const [finance, setFinance] = useState({
    total_revenue: 0,
    total_profit: 0,
    monthly_revenue: 0,
    monthly_profit: 0,
    completed_deals: 0,
    active_deals: 0,
  });
  const [payments, setPayments] = useState({
    totalReceived: 0,
    totalPending: 0,
    totalPayments: 0,
  });
  const [salespersonBalance, setSalespersonBalance] = useState(null);
  const [leadStats, setLeadStats] = useState({
    total_leads: 0,
    today_leads: 0,
    monthly_leads: 0,
    new_leads: 0,
    contacted_leads: 0,
    on_hold_leads: 0,
    successful_leads: 0,
    unsuccessful_leads: 0,
    unassigned_leads: 0,
    today_new_leads: 0,
    monthly_new_leads: 0,
    today_successful_leads: 0,
    monthly_successful_leads: 0,
    today_status_updates: 0,
    monthly_status_updates: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchFinance();
    fetchPayments();
    fetchLeadStats();
    if (!isAdmin && user) {
      fetchSalespersonBalance();
    }
  }, [user, isAdmin]);

  const fetchStats = async () => {
    try {
      const [dealsRes, customersRes, dealersRes, inventoryRes, investorsRes] = await Promise.all([
        api.get('/deals'),
        api.get('/customers'),
        isAdmin ? api.get('/dealers') : Promise.resolve({ data: [] }),
        api.get('/inventory'),
        api.get('/investors'),
      ]);

      const deals = dealsRes.data;
      const customers = customersRes.data;

      setStats({
        totalDeals: deals.length,
        activeDeals: deals.filter((d) => d.status === 'in_progress').length,
        completedDeals: deals.filter((d) => d.status === 'deal_done').length,
        pendingDeals: deals.filter((d) => d.status === 'not_done').length,
        totalCustomers: customers.length,
        totalDealers: dealersRes.data.length,
        totalInventory: inventoryRes.data.length,
        totalInvestors: investorsRes.data.length,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchFinance = async () => {
    try {
      const response = await api.get('/finance/summary');
      setFinance(response.data);
    } catch (error) {
      console.error('Error fetching finance:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSalespersonBalance = async () => {
    try {
      if (user) {
        const response = await api.get(`/inventory-payments/salesperson/${user.id}/balance`);
        setSalespersonBalance(response.data);
      }
    } catch (error) {
      console.error('Error fetching salesperson balance:', error);
    }
  };

  const fetchPayments = async () => {
    try {
      const [paymentsRes, dealsRes] = await Promise.all([
        api.get('/payments'),
        api.get('/deals'),
      ]);

      const paymentsData = paymentsRes.data;
      const deals = dealsRes.data;

      const totalReceived = paymentsData.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      // Calculate pending amount from deals
      let totalPending = 0;

      for (const deal of deals) {
        if (deal.status === 'in_progress' || deal.status === 'not_done') {
          const dealPayments = paymentsData.filter(p => p.deal_id === deal.id);
          const paidAmount = dealPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
          const remaining = parseFloat(deal.sale_price || 0) - paidAmount;
          if (remaining > 0) {
            totalPending += remaining;
          }
        }
      }

      setPayments({
        totalReceived,
        totalPending,
        totalPayments: paymentsData.length,
      });
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
  };

  const fetchLeadStats = async () => {
    try {
      const response = await api.get('/leads/stats/summary');
      setLeadStats(response.data);
    } catch (error) {
      console.error('Error fetching lead stats:', error);
    }
  };

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  const averageDealValue = stats.totalDeals > 0
    ? (finance.total_revenue / stats.completedDeals) || 0
    : 0;

  const conversionRate = stats.totalDeals > 0
    ? Math.round((stats.completedDeals / stats.totalDeals) * 100)
    : 0;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Dashboard</h1>
      </div>

      {/* Salesperson Balance Card (for salespersons only) */}
      {!isAdmin && salespersonBalance && (
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '1.5rem',
          borderRadius: '12px',
          marginBottom: '2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem' }}>My Balance Summary</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            <div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>Total Invested</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                ${parseFloat(salespersonBalance.total_invested || 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>Total Used</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ffd700' }}>
                ${parseFloat(salespersonBalance.total_used || 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>Remaining Balance</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#90ee90' }}>
                ${parseFloat(salespersonBalance.remaining_balance || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total Deals</div>
          <div className="kpi-value">{stats.totalDeals}</div>
          <div className="kpi-subvalue">
            <strong>{stats.activeDeals}</strong> active deals
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Completed Deals</div>
          <div className="kpi-value">{stats.completedDeals}</div>
          <div className="kpi-subvalue">
            <strong>{conversionRate}%</strong> completion rate
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-value" style={{ color: '#007bff' }}>
            ${parseFloat(finance.total_revenue || 0).toLocaleString()}
          </div>
          <div className="kpi-subvalue">
            <strong>${parseFloat(finance.monthly_revenue || 0).toLocaleString()}</strong> in last 30 days
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Profit</div>
          <div className="kpi-value" style={{ color: '#28a745' }}>
            ${parseFloat(finance.total_profit || 0).toLocaleString()}
          </div>
          <div className="kpi-subvalue">
            <strong>${parseFloat(finance.monthly_profit || 0).toLocaleString()}</strong> in last 30 days
          </div>
        </div>
      </div>

      {/* Leads Statistics Cards */}
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem', color: '#333', fontSize: '1.5rem' }}>Leads Statistics</h2>
        <div className="kpi-grid">
          <div className="kpi-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <div className="kpi-label" style={{ color: 'rgba(255,255,255,0.9)' }}>Total Leads</div>
            <div className="kpi-value" style={{ color: 'white' }}>{leadStats.total_leads || 0}</div>
            <div className="kpi-subvalue" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <strong>{leadStats.new_leads || 0}</strong> new leads
            </div>
          </div>
          <div className="kpi-card" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
            <div className="kpi-label" style={{ color: 'rgba(255,255,255,0.9)' }}>Today's Leads</div>
            <div className="kpi-value" style={{ color: 'white' }}>{leadStats.today_leads || 0}</div>
            <div className="kpi-subvalue" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <strong>{leadStats.today_new_leads || 0}</strong> new today
            </div>
          </div>
          <div className="kpi-card" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
            <div className="kpi-label" style={{ color: 'rgba(255,255,255,0.9)' }}>Monthly Leads</div>
            <div className="kpi-value" style={{ color: 'white' }}>{leadStats.monthly_leads || 0}</div>
            <div className="kpi-subvalue" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <strong>{leadStats.monthly_new_leads || 0}</strong> new this month
            </div>
          </div>
          <div className="kpi-card" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: 'white' }}>
            <div className="kpi-label" style={{ color: 'rgba(255,255,255,0.9)' }}>Today's Activity</div>
            <div className="kpi-value" style={{ color: 'white' }}>{leadStats.today_status_updates || 0}</div>
            <div className="kpi-subvalue" style={{ color: 'rgba(255,255,255,0.8)' }}>
              <strong>{leadStats.monthly_status_updates || 0}</strong> this month
            </div>
          </div>
        </div>
        <div className="kpi-grid" style={{ marginTop: '1rem' }}>
          <div className="kpi-card">
            <div className="kpi-label">Successful Leads</div>
            <div className="kpi-value" style={{ color: '#28a745' }}>{leadStats.successful_leads || 0}</div>
            <div className="kpi-subvalue">
              <strong>{leadStats.today_successful_leads || 0}</strong> today, <strong>{leadStats.monthly_successful_leads || 0}</strong> this month
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Contacted Leads</div>
            <div className="kpi-value" style={{ color: '#17a2b8' }}>{leadStats.contacted_leads || 0}</div>
            <div className="kpi-subvalue">
              <strong>{leadStats.on_hold_leads || 0}</strong> on hold
            </div>
          </div>
          {isAdmin && (
            <div className="kpi-card">
              <div className="kpi-label">Unassigned Leads</div>
              <div className="kpi-value" style={{ color: '#ffc107' }}>{leadStats.unassigned_leads || 0}</div>
              <div className="kpi-subvalue">
                Need assignment
              </div>
            </div>
          )}
          <div className="kpi-card">
            <div className="kpi-label">Unsuccessful Leads</div>
            <div className="kpi-value" style={{ color: '#dc3545' }}>{leadStats.unsuccessful_leads || 0}</div>
            <div className="kpi-subvalue">
              Converted to customers
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        {/* <div className="stat-card">
          <div className="stat-icon">
            <FaChartLine />
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{stats.totalDeals}</h3>
            <p className="stat-label">Total Deals</p>
          </div>
        </div> */}
        <div className="stat-card">
          <div className="stat-icon">
            <FaClock />
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{stats.activeDeals}</h3>
            <p className="stat-label">Active Deals</p>
          </div>
        </div>
        {/* <div className="stat-card">
          <div className="stat-icon">
            <FaCheckCircle />
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{stats.completedDeals}</h3>
            <p className="stat-label">Completed Deals</p>
          </div>
        </div> */}
        <div className="stat-card">
          <div className="stat-icon">
            <FaUsers />
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{stats.totalCustomers}</h3>
            <p className="stat-label">Total Customers</p>
          </div>
        </div>
        {/* <div className="stat-card">
          <div className="stat-icon">
            <FaDollarSign />
          </div>
          <div className="stat-content">
            <h3 className="stat-value">${parseFloat(finance.total_revenue || 0).toLocaleString()}</h3>
            <p className="stat-label">Total Revenue</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <FaHandHoldingUsd />
          </div>
          <div className="stat-content">
            <h3 className="stat-value">${parseFloat(finance.total_profit || 0).toLocaleString()}</h3>
            <p className="stat-label">Total Profit</p>
          </div>
        </div> */}
        <div className="stat-card">
          <div className="stat-icon">
            <FaWarehouse />
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{stats.totalInventory}</h3>
            <p className="stat-label">Total Inventory</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <FaInvestors />
          </div>
          <div className="stat-content">
            <h3 className="stat-value">{stats.totalInvestors}</h3>
            <p className="stat-label">Total Investors</p>
          </div>
        </div>
        {isAdmin && (
          <div className="stat-card">
            <div className="stat-icon">
              <FaUserTie />
            </div>
            <div className="stat-content">
              <h3 className="stat-value">{stats.totalDealers}</h3>
              <p className="stat-label">Total Salespersons</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
