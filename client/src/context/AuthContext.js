import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [branches, setBranches] = useState([]);
  const [multiBranch, setMultiBranch] = useState(false); // plan includes the multi_branch feature (server decides)
  const [subscription, setSubscription] = useState(null);
  const [branchId, setBranchId] = useState(localStorage.getItem('branchId') || '');
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await api.get('/auth/me');
      const { tenant: t, branches: b, multiBranch: mb, subscription: sub, ...u } = response.data;
      setUser(u);
      setTenant(t || null);
      setBranches(b || []);
      setMultiBranch(!!mb);
      setSubscription(sub || null);
    } catch (error) {
      // Only drop the session when the server rejects the token; a network blip or a
      // server restart should not sign the user out.
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        localStorage.removeItem('token');
        setToken(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', {
        email,
        password,
      });
      const { token: newToken, user: userData, tenant: t, branches: b, multiBranch: mb, subscription: sub } = response.data;
      localStorage.setItem('token', newToken);
      localStorage.removeItem('branchId');
      setBranchId('');
      setToken(newToken);
      setUser(userData);
      setTenant(t || null);
      setBranches(b || []);
      setMultiBranch(!!mb);
      setSubscription(sub || null);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('branchId');
    setBranchId('');
    setToken(null);
    setUser(null);
    setTenant(null);
    setBranches([]);
    setMultiBranch(false);
    setSubscription(null);
  };

  // The branch is picked once after login (BranchPicker). api.js sends it as X-Branch-Id on every request.
  const choosable = multiBranch && branches.length > 1;
  const currentBranch = choosable ? branches.find((b) => String(b.id) === String(branchId)) || null : null;
  const needsBranch = !!user && choosable && !currentBranch;

  // Drop a stored branch that no longer applies (plan downgrade, access removed, single branch).
  useEffect(() => {
    if (user && !currentBranch && localStorage.getItem('branchId')) {
      localStorage.removeItem('branchId');
      setBranchId('');
    }
  }, [user, currentBranch]);

  const setBranch = (id) => {
    localStorage.setItem('branchId', String(id));
    setBranchId(String(id));
  };

  const updateUser = (next) => setUser((prev) => ({ ...(prev || {}), ...next }));

  const value = {
    user,
    tenant,
    branches,
    currentBranch,
    needsBranch,
    setBranch,
    multiBranch,
    subscription,
    updateUser,
    loading,
    login,
    logout,
    isAdmin: user?.role === 'admin',
    isDealer: user?.role === 'dealer',
    isAccountant: user?.role === 'accountant',
    isSuperAdmin: user?.role === 'super_admin',
    isEmployee: user?.is_employee === true,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

