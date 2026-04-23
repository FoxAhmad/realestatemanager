import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Dealers from './pages/Dealers';
import Employees from './pages/Employees';
import Customers from './pages/Customers';
import Deals from './pages/Deals';
import DealDetail from './pages/DealDetail';
import Finance from './pages/Finance';
import Inventory from './pages/Inventory';
// import InventoryRequests from './pages/InventoryRequests'; // Retired
import Investors from './pages/Investors';
import Ledger from './pages/Ledger';
import Payments from './pages/Payments';
import Leads from './pages/Leads';
import DealerExchanges from './pages/DealerExchanges';
import Layout from './components/Layout';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="dealers" element={<Dealers />} />
            <Route path="employees" element={<Employees />} />
            <Route path="customers" element={<Customers />} />
            <Route path="deals" element={<Deals />} />
            <Route path="deals/:id" element={<DealDetail />} />
            <Route path="finance" element={<Finance />} />
            <Route path="inventory" element={<Inventory />} />
            {/* <Route path="inventory-requests" element={<InventoryRequests />} /> */}
            <Route path="investors" element={<Investors />} />
            <Route path="ledger" element={<Ledger />} />
            <Route path="payments" element={<Payments />} />
            <Route path="leads" element={<Leads />} />
            <Route path="dealer-exchanges" element={<DealerExchanges />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;

