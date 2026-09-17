import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  FaChevronLeft,
  FaChevronRight,
  FaHome,
  FaUsers,
  FaHandshake,
  FaChartLine,
  FaWarehouse,
  FaMoneyBillWave,
  FaDollarSign,
  FaUserPlus,
  FaBook,
  FaExchangeAlt,
  FaWallet,
  FaUserTie,
  FaUserShield,
  FaBars,
  FaTimes,
  FaPiggyBank,
  FaFileContract
} from 'react-icons/fa';
import './Layout.css';

const isMobileViewport = () => typeof window !== 'undefined' && window.innerWidth <= 768;

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobileViewport());

  const isActive = (path) => location.pathname === path;

  const closeSidebarOnMobile = () => {
    if (isMobileViewport()) setSidebarOpen(false);
  };

  return (
    <div className="layout">
      {/* Top Navigation Bar */}
      <nav className="top-navbar">
        <div className="top-navbar-content">
          <div className="navbar-left">
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle navigation menu"
            >
              {sidebarOpen ? <FaTimes /> : <FaBars />}
            </button>
            <div className="navbar-brand">
              <img src="./images/logoUm.png" alt="logo" style={{ width: '50px', height: '50px', objectFit: 'cover' }} />
              <h1 className='text-white'>Universal Manager</h1>
            </div>
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
        {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
        {/* Left Sidebar - Premium Dark */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <FaChevronLeft /> : <FaChevronRight />}
          </button>

          <nav className="sidebar-nav">
            <div className="sidebar-section">
              <Link
                to="/dashboard"
                className={`sidebar-submenu-item ${isActive('/dashboard') ? 'active' : ''}`}
                title="Dashboard"
                onClick={closeSidebarOnMobile}
              >
                <FaHome className="sidebar-icon" />
                {sidebarOpen && <span>Dashboard</span>}
              </Link>
            </div>

            {(user?.role === 'admin' || user?.role === 'accountant') && (
              <div className="sidebar-section">
                <Link
                  to="/dealers"
                  className={`sidebar-submenu-item ${isActive('/dealers') ? 'active' : ''}`}
                  title="Salespersons"
                  onClick={closeSidebarOnMobile}
                >
                  <FaUserTie className="sidebar-icon" />
                  {sidebarOpen && <span>Salespersons</span>}
                </Link>
              </div>
            )}

            <div className="sidebar-section">
              <Link
                to="/finance"
                className={`sidebar-submenu-item ${isActive('/finance') ? 'active' : ''}`}
                title="Finance"
                onClick={closeSidebarOnMobile}
              >
                <FaChartLine className="sidebar-icon" />
                {sidebarOpen && <span>Finance</span>}
              </Link>
            </div>

            {(user?.role === 'admin' || user?.role === 'accountant') && (
              <div className="sidebar-section">
                <Link
                  to="/manage-balances"
                  className={`sidebar-submenu-item ${isActive('/manage-balances') ? 'active' : ''}`}
                  title="Manage Balances"
                  onClick={closeSidebarOnMobile}
                >
                  <FaWallet className="sidebar-icon" />
                  {sidebarOpen && <span>Manage Balances</span>}
                </Link>
              </div>
            )}

            {(user?.role === 'admin' || user?.role === 'accountant') && (
              <div className="sidebar-section">
                <Link
                  to="/forms-ledger"
                  className={`sidebar-submenu-item ${isActive('/forms-ledger') ? 'active' : ''}`}
                  title="Forms Ledger"
                  onClick={closeSidebarOnMobile}
                >
                  <FaFileContract className="sidebar-icon" />
                  {sidebarOpen && <span>Forms Ledger</span>}
                </Link>
              </div>
            )}

            <div className="sidebar-section">
              <Link
                to="/inventory"
                className={`sidebar-submenu-item ${isActive('/inventory') ? 'active' : ''}`}
                title="Inventory"
                onClick={closeSidebarOnMobile}
              >
                <FaWarehouse className="sidebar-icon" />
                {sidebarOpen && <span>Inventory</span>}
              </Link>
            </div>

            <div className="sidebar-section">
              <Link
                to="/deals"
                className={`sidebar-submenu-item ${isActive('/deals') ? 'active' : ''}`}
                title="Deals"
                onClick={closeSidebarOnMobile}
              >
                <FaHandshake className="sidebar-icon" />
                {sidebarOpen && <span>Deals</span>}
              </Link>
            </div>

            {(user?.role === 'admin' || user?.role === 'accountant') && (
              <div className="sidebar-section">
                <Link
                  to="/employees"
                  className={`sidebar-submenu-item ${isActive('/employees') ? 'active' : ''}`}
                  title="Employees"
                  onClick={closeSidebarOnMobile}
                >
                  <FaUserShield className="sidebar-icon" />
                  {sidebarOpen && <span>User Roles</span>}
                </Link>
              </div>
            )}

            {user?.role !== 'customer' && (
              <div className="sidebar-section">
                <Link
                  to="/dealer-exchanges"
                  className={`sidebar-submenu-item ${isActive('/dealer-exchanges') ? 'active' : ''}`}
                  title="Dealer Mutuals"
                  onClick={closeSidebarOnMobile}
                >
                  <FaExchangeAlt className="sidebar-icon" />
                  {sidebarOpen && <span>Dealer Mutuals</span>}
                </Link>
              </div>
            )}

            {(user?.role === 'admin' || user?.role === 'accountant') && (
              <div className="sidebar-section">
                <Link
                  to="/loans-and-investments"
                  className={`sidebar-submenu-item ${isActive('/loans-and-investments') ? 'active' : ''}`}
                  title="Loans & Investments"
                  onClick={closeSidebarOnMobile}
                >
                  <FaPiggyBank className="sidebar-icon" />
                  {sidebarOpen && <span>Loans & Investments</span>}
                </Link>
              </div>
            )}

            <div className="sidebar-section">
              <Link
                to="/payments"
                className={`sidebar-submenu-item ${isActive('/payments') ? 'active' : ''}`}
                title="Payments"
                onClick={closeSidebarOnMobile}
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
                onClick={closeSidebarOnMobile}
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
