import React, { useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { notify } from '../utils/notify';
import './ProfileSettings.css';

const ROLE_LABELS = { admin: 'Administrator', accountant: 'Accountant', dealer: 'Salesperson' };

const ProfilePanel = () => {
  const { user, updateUser, logout } = useAuth();
  const [details, setDetails] = useState({ name: user?.name || '', email: user?.email || '' });
  const [savingDetails, setSavingDetails] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  const detailsChanged = details.name.trim() !== (user?.name || '') || details.email.trim().toLowerCase() !== (user?.email || '').toLowerCase();

  const saveDetails = async (e) => {
    e.preventDefault();
    setSavingDetails(true);
    try {
      const res = await api.put('/auth/profile', { name: details.name, email: details.email });
      updateUser(res.data);
      setDetails({ name: res.data.name, email: res.data.email });
      notify.success('Profile updated');
    } catch (error) {
      notify.error(error.response?.data?.message || 'Could not update profile');
    } finally {
      setSavingDetails(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword.length < 8) {
      notify.error('New password must be at least 8 characters');
      return;
    }
    if (pw.newPassword !== pw.confirm) {
      notify.error('New password and confirmation do not match');
      return;
    }
    setSavingPw(true);
    try {
      await api.put('/auth/password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      notify.success('Password changed');
    } catch (error) {
      notify.error(error.response?.data?.message || 'Could not change password');
    } finally {
      setSavingPw(false);
    }
  };

  const initial = (user?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <>
      <div className="ps-profile-grid">
        <aside className="ps-card ps-identity">
          <span className="ps-avatar" aria-hidden="true">{initial}</span>
          <h2>{user?.name}</h2>
          <p className="ps-muted">{user?.email}</p>
          <span className="ps-role">{ROLE_LABELS[user?.role] || user?.role}</span>
          <button type="button" className="premium-btn premium-btn-secondary ps-signout" onClick={logout}>
            Sign out
          </button>
        </aside>

        <div className="ps-stack">
          <form className="ps-card" onSubmit={saveDetails}>
            <h3>Personal details</h3>
            <p className="ps-muted">This name appears in the header and on records you create.</p>
            <div className="ps-fields">
              <div className="form-group">
                <label htmlFor="pf-name">Full name</label>
                <input id="pf-name" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label htmlFor="pf-email">Email</label>
                <input id="pf-email" type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} required />
              </div>
            </div>
            <div className="ps-actions">
              <button type="submit" className="premium-btn premium-btn-primary" disabled={savingDetails || !detailsChanged}>
                {savingDetails ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>

          <form className="ps-card" onSubmit={savePassword}>
            <h3>Change password</h3>
            <p className="ps-muted">Use at least 8 characters. You will stay signed in on this device.</p>
            <div className="ps-fields">
              <div className="form-group">
                <label htmlFor="pf-current">Current password</label>
                <input id="pf-current" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required />
              </div>
              <div className="form-group">
                <label htmlFor="pf-new">New password</label>
                <input id="pf-new" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required />
              </div>
              <div className="form-group">
                <label htmlFor="pf-confirm">Confirm new password</label>
                <input id="pf-confirm" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
              </div>
            </div>
            <div className="ps-actions">
              <button type="submit" className="premium-btn premium-btn-primary" disabled={savingPw}>
                {savingPw ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default ProfilePanel;
