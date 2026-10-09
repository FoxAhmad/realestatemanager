import React, { useEffect, useRef, useState } from 'react';
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
  FaFileContract,
  FaReceipt,
  FaSignOutAlt,
  FaChevronDown,
  FaUserFriends,
  FaBullhorn,
  FaBalanceScale,
  FaCog
} from 'react-icons/fa';
import './Layout.css';

const isMobileViewport = () => typeof window !== 'undefined' && window.innerWidth <= 768;

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobileViewport());

  const [menuOpen, setMenuOpen] = useState(false);
  const [navTip, setNavTip] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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
              <img src="/images/logoUm.png" alt="Universal Manager logo" className="navbar-logo-img" />
              <div className="navbar-brand-text">
                <h1 className="navbar-title">Universal Manager</h1>
                <span className="navbar-tagline">Real Estate CRM</span>
              </div>
            </div>
          </div>
          <div className="navbar-user-section" ref={menuRef}>
            <button
              type="button"
              className={`user-chip ${menuOpen ? 'open' : ''}`}
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="user-avatar" aria-hidden="true">
                {(user?.name || '?').trim().charAt(0).toUpperCase()}
              </span>
              <span className="user-info">
                <span className="user-name">{user?.name}</span>
                <span className="user-role">{user?.role}</span>
              </span>
              <FaChevronDown className="user-caret" aria-hidden="true" />
            </button>

            {menuOpen && (
              <div className="user-menu" role="menu">
                <div className="user-menu-head">
                  <span className="user-avatar large" aria-hidden="true">
                    {(user?.name || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="user-menu-id">
                    <strong>{user?.name}</strong>
                    {user?.email && <span className="user-menu-email">{user.email}</span>}
                    <span className="user-role">{user?.role}</span>
                  </div>
                </div>
                <Link to="/settings" role="menuitem" className="user-menu-item">
                  <FaCog /> Settings &amp; profile
                </Link>
                <button type="button" role="menuitem" className="user-menu-logout" onClick={logout}>
                  <FaSignOutAlt /> Log out
                </button>
              </div>
            )}
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

          <nav
            className="sidebar-nav"
            onMouseOver={(e) => {
              if (sidebarOpen) return;
              const link = e.target.closest && e.target.closest('a.sidebar-submenu-item');
              if (!link) return;
              const r = link.getBoundingClientRect();
              setNavTip({ label: link.getAttribute('data-label') || link.title, top: r.top + r.height / 2, left: r.right + 10 });
            }}
            onMouseLeave={() => setNavTip(null)}
            onScroll={() => setNavTip(null)}
            onFocus={(e) => {
              if (sidebarOpen) return;
              const link = e.target.closest && e.target.closest('a.sidebar-submenu-item');
              if (!link) return;
              const r = link.getBoundingClientRect();
              setNavTip({ label: link.getAttribute('data-label') || link.title, top: r.top + r.height / 2, left: r.right + 10 });
            }}
            onBlur={() => setNavTip(null)}
          >
            <div className="sidebar-section">
              <Link
                to="/dashboard"
                className={`sidebar-submenu-item ${isActive('/dashboard') ? 'active' : ''}`}
                aria-label="Dashboard"
                data-label="Dashboard"
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
                  aria-label="Salespersons"
                  data-label="Salespersons"
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
                aria-label="Finance"
                data-label="Finance"
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
                  aria-label="Manage Balances"
                  data-label="Manage Balances"
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
                  aria-label="Forms Ledger"
                  data-label="Forms Ledger"
                  onClick={closeSidebarOnMobile}
                >
                  <FaFileContract className="sidebar-icon" />
                  {sidebarOpen && <span>Forms Ledger</span>}
                </Link>
              </div>
            )}

            {(user?.role === 'admin' || user?.role === 'accountant') && (
              <div className="sidebar-section">
                <Link
                  to="/slip-record"
                  className={`sidebar-submenu-item ${isActive('/slip-record') ? 'active' : ''}`}
                  aria-label="Slip Record"
                  data-label="Slip Record"
                  onClick={closeSidebarOnMobile}
                >
                  <FaReceipt className="sidebar-icon" />
                  {sidebarOpen && <span>Slip Record</span>}
                </Link>
              </div>
            )}

            {user?.role !== 'customer' && (
              <div className="sidebar-section">
                <Link
                  to="/customers"
                  className={`sidebar-submenu-item ${isActive('/customers') ? 'active' : ''}`}
                  aria-label="Customers"
                  data-label="Customers"
                  onClick={closeSidebarOnMobile}
                >
                  <FaUserFriends className="sidebar-icon" />
                  {sidebarOpen && <span>Customers</span>}
                </Link>
              </div>
            )}

            {user?.role !== 'customer' && (
              <div className="sidebar-section">
                <Link
                  to="/leads"
                  className={`sidebar-submenu-item ${isActive('/leads') ? 'active' : ''}`}
                  aria-label="Leads"
                  data-label="Leads"
                  onClick={closeSidebarOnMobile}
                >
                  <FaBullhorn className="sidebar-icon" />
                  {sidebarOpen && <span>Leads</span>}
                </Link>
              </div>
            )}

            <div className="sidebar-section">
              <Link
                to="/inventory"
                className={`sidebar-submenu-item ${isActive('/inventory') ? 'active' : ''}`}
                aria-label="Inventory"
                data-label="Inventory"
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
                aria-label="Deals"
                data-label="Deals"
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
                  aria-label="User Roles"
                  data-label="User Roles"
                  onClick={closeSidebarOnMobile}
                >
                  <FaUserShield className="sidebar-icon" />
                  {sidebarOpen && <span>User Roles</span>}
                </Link>
              </div>
            )}

            {(user?.role === 'admin' || user?.role === 'accountant') && (
              <div className="sidebar-section">
                <Link
                  to="/ledger"
                  className={`sidebar-submenu-item ${isActive('/ledger') ? 'active' : ''}`}
                  aria-label="General Ledger"
                  data-label="General Ledger"
                  onClick={closeSidebarOnMobile}
                >
                  <FaBalanceScale className="sidebar-icon" />
                  {sidebarOpen && <span>General Ledger</span>}
                </Link>
              </div>
            )}

            {user?.role !== 'customer' && (
              <div className="sidebar-section">
                <Link
                  to="/dealer-exchanges"
                  className={`sidebar-submenu-item ${isActive('/dealer-exchanges') ? 'active' : ''}`}
                  aria-label="Dealer Mutuals"
                  data-label="Dealer Mutuals"
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
                  aria-label="Loans & Investments"
                  data-label="Loans & Investments"
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
                aria-label="Payments"
                data-label="Payments"
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
                aria-label="Investors"
                data-label="Investors"
                onClick={closeSidebarOnMobile}
              >
                <FaMoneyBillWave className="sidebar-icon" />
                {sidebarOpen && <span>Investors</span>}
              </Link>
            </div>
            <div className="sidebar-section">
              <Link
                to="/settings"
                className={`sidebar-submenu-item ${isActive('/settings') ? 'active' : ''}`}
                aria-label="Settings"
                data-label="Settings"
                onClick={closeSidebarOnMobile}
              >
                <FaCog className="sidebar-icon" />
                {sidebarOpen && <span>Settings</span>}
              </Link>
            </div>

          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="main-content">
          <Outlet />
        </main>
      </div>

      {navTip && !sidebarOpen && (
        <div className="sidebar-tip" style={{ top: navTip.top, left: navTip.left }} role="tooltip">
          {navTip.label}
        </div>
      )}

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-logo-container">
          <p>Powered by</p>
          <span className="footer-brand">
            <img src="/favicon.svg" alt="" className="footer-brand-mark" />
            Plot Ledge
          </span>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
