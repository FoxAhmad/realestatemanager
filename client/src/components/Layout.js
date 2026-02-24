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
  FaClipboardList,
  FaDollarSign,
  FaUserPlus
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
            <img src="/images/logod.png" alt="Universal Holdings" className="navbar-logo" />
          </div>
          {/* <div className="top-nav-links">
            <Link to="/dashboard" className={`top-nav-link ${isActive('/dashboard') ? 'active' : ''}`}>
              Dashboard
            </Link>
            {user?.role === 'admin' && (
              <Link to="/dealers" className={`top-nav-link ${isActive('/dealers') ? 'active' : ''}`}>
                Salespersons
              </Link>
            )}
            <Link to="/customers" className={`top-nav-link ${isActive('/customers') ? 'active' : ''}`}>
              Customers
            </Link>
            <Link to="/deals" className={`top-nav-link ${isActive('/deals') ? 'active' : ''}`}>
              Deals
            </Link>
            <Link to="/finance" className={`top-nav-link ${isActive('/finance') ? 'active' : ''}`}>
              Finance
            </Link>
          </div> */}
          <div className="navbar-user-section">
            <span className="user-name">{user?.name}</span>
            <span className="user-role">{user?.role}</span>
            <button onClick={logout} className="logout-btn">Logout</button>
          </div>
        </div>
      </nav>

      <div className="layout-body">
        {/* Left Sidebar - Dark */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header">
            {sidebarOpen && <span>Real Estate Management System</span>}
            <button 
              className="sidebar-toggle-btn" 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <FaChevronLeft /> : <FaChevronRight />}
            </button>
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
                to="/inventory-requests"
                className={`sidebar-submenu-item ${isActive('/inventory-requests') ? 'active' : ''}`}
                title="Inventory Requests"
              >
                <FaClipboardList className="sidebar-icon" />
                {sidebarOpen && <span>Inventory Requests</span>}
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
        <p>Powered by</p><img src="/images/logo.png" alt="Universal Holdings" className="footer-logo" />
        </div>
      </footer>
    </div>
  );
};

export default Layout;
