import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  FaChevronLeft,
  FaChevronRight,
  FaHome,
  FaUserTie,
  FaUsers,
  FaHandshake,
  FaChartLine,
  FaWarehouse,
  FaMoneyBillWave,
  FaDollarSign,
  FaUserPlus,
  FaUserShield,
  FaBook,
  FaExchangeAlt
} from 'react-icons/fa';
import './Layout.css';

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isActive = (path) => location.pathname === path;

  return (
    <div className="layout">
      {/* Top Navigation Bar */}
      <nav className="top-navbar">
        <div className="top-navbar-content">
          <div className="navbar-brand">
            <img src="./images/logoUm.png" alt="logo" style={{ width: '50px', height: '50px', objectFit: 'cover' }} />
            <h1 className='text-white'>Universal Manager</h1>
          </div>
          <div className="navbar-user-section">
            <div className="user-info">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">{user?.role}</span>
            </div>
            <button onClick={logout} className="logout-btn">Logout</button>
          </div>
        </div>
      </nav>

      <div className="layout-body">
        {/* Left Sidebar - Premium Dark */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <FaChevronLeft /> : <FaChevronRight />}
          </button>

          <div className="sidebar-header">
            {sidebarOpen && <span>Command Center</span>}
          </div>

          <nav className="sidebar-nav">
            <div className="sidebar-section">
              <Link
                to="/dashboard"
                className={`sidebar-submenu-item ${isActive('/dashboard') ? 'active' : ''}`}
                title="Dashboard"
              >
                <FaHome className="sidebar-icon" />
                {sidebarOpen && <span>Dashboard</span>}
              </Link>
            </div>

            {user?.role === 'admin' && (
              <>
                <div className="sidebar-section">
                  <Link
                    to="/dealers"
                    className={`sidebar-submenu-item ${isActive('/dealers') ? 'active' : ''}`}
                    title="Salespersons"
                  >
                    <FaUserTie className="sidebar-icon" />
                    {sidebarOpen && <span>Salespersons</span>}
                  </Link>
                </div>
                <div className="sidebar-section">
                  <Link
                    to="/employees"
                    className={`sidebar-submenu-item ${isActive('/employees') ? 'active' : ''}`}
                    title="Employees"
                  >
                    <FaUserShield className="sidebar-icon" />
                    {sidebarOpen && <span>User Roles</span>}
                  </Link>
                </div>
              </>
            )}

            <div className="sidebar-section">
              <Link
                to="/leads"
                className={`sidebar-submenu-item ${isActive('/leads') ? 'active' : ''}`}
                title="Leads"
              >
                <FaUserPlus className="sidebar-icon" />
                {sidebarOpen && <span>Leads</span>}
              </Link>
            </div>

            <div className="sidebar-section">
              <Link
                to="/customers"
                className={`sidebar-submenu-item ${isActive('/customers') ? 'active' : ''}`}
                title="Customers"
              >
                <FaUsers className="sidebar-icon" />
                {sidebarOpen && <span>Customers</span>}
              </Link>
            </div>

            <div className="sidebar-section">
              <Link
                to="/deals"
                className={`sidebar-submenu-item ${isActive('/deals') ? 'active' : ''}`}
                title="Deals"
              >
                <FaHandshake className="sidebar-icon" />
                {sidebarOpen && <span>Deals</span>}
              </Link>
            </div>

            {user?.role !== 'customer' && (
              <div className="sidebar-section">
                <Link
                  to="/dealer-exchanges"
                  className={`sidebar-submenu-item ${isActive('/dealer-exchanges') ? 'active' : ''}`}
                  title="Dealer Mutuals"
                >
                  <FaExchangeAlt className="sidebar-icon" />
                  {sidebarOpen && <span>Dealer Mutuals</span>}
                </Link>
              </div>
            )}

            <div className="sidebar-section">
              <Link
                to="/finance"
                className={`sidebar-submenu-item ${isActive('/finance') ? 'active' : ''}`}
                title="Finance"
              >
                <FaChartLine className="sidebar-icon" />
                {sidebarOpen && <span>Finance</span>}
              </Link>
            </div>

            <div className="sidebar-section">
              <Link
                to="/ledger"
                className={`sidebar-submenu-item ${isActive('/ledger') ? 'active' : ''}`}
                title="Slip Record"
              >
                <FaBook className="sidebar-icon" />
                {sidebarOpen && <span>Slip Record</span>}
              </Link>
            </div>

            <div className="sidebar-section">
              <Link
                to="/inventory"
                className={`sidebar-submenu-item ${isActive('/inventory') ? 'active' : ''}`}
                title="Inventory"
              >
                <FaWarehouse className="sidebar-icon" />
                {sidebarOpen && <span>Inventory</span>}
              </Link>
            </div>

            <div className="sidebar-section">
              <Link
                to="/payments"
                className={`sidebar-submenu-item ${isActive('/payments') ? 'active' : ''}`}
                title="Payments"
              >
                <FaDollarSign className="sidebar-icon" />
                {sidebarOpen && <span>Payments</span>}
              </Link>
            </div>

            <div className="sidebar-section">
              <Link
                to="/investors"
                className={`sidebar-submenu-item ${isActive('/investors') ? 'active' : ''}`}
                title="Investors"
              >
                <FaMoneyBillWave className="sidebar-icon" />
                {sidebarOpen && <span>Investors</span>}
              </Link>
            </div>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="main-content">
          <Outlet />
        </main>
      </div>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-logo-container">
          <p>Powered by</p>
          <img src="/images/logo.png" alt="Universal Holdings" className="footer-logo" />
        </div>
      </footer>
    </div>
  );
};

export default Layout;
