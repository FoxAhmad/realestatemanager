import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import ProfilePanel from './Profile';
import { notify, confirmDialog } from '../utils/notify';
import Pagination from '../components/Pagination';
import './ProfileSettings.css';

const TABS = [
  { id: 'profile', label: 'My profile', everyone: true },
  { id: 'company', label: 'Company' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'agencies', label: 'Agencies' },
  { id: 'team', label: 'Team emails' },
  { id: 'health', label: 'Data checks' },
];

const COMPANY_FIELDS = [
  { key: 'COMPANY_NAME', label: 'Company name' },
  { key: 'COMPANY_PHONE', label: 'Phone' },
  { key: 'COMPANY_EMAIL', label: 'Email' },
  { key: 'COMPANY_ADDRESS', label: 'Address', textarea: true },
];

const DEFAULT_FIELDS = [
  { key: 'ADJUSTMENT_FORM_DEFAULT_COST', label: 'Base price per form (Rs.)', hint: 'What a form costs us.' },
  { key: 'ADJUSTMENT_FORM_CUSTOMER_VALUE', label: 'Default current value per form (Rs.)', hint: 'Value credited toward a deal each time a form is applied.' },
];

const isPlaceholderEmail = (email) => /@placeholder\.local$/i.test(email || '');

const Settings = () => {
  const { user } = useAuth();
  const isMgmt = user?.role === 'admin' || user?.role === 'accountant';
  const visibleTabs = TABS.filter((t) => t.everyone || isMgmt);
  const [tab, setTab] = useState('profile');
  const [settings, setSettings] = useState({});
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [agencies, setAgencies] = useState([]);
  const [agencyModal, setAgencyModal] = useState(null);

  const [users, setUsers] = useState([]);
  const [userModal, setUserModal] = useState(null);

  // Local pagination for the two plain (non-useTableFilters) tables
  const [agencyPage, setAgencyPage] = useState(1);
  const [agencyPageSize, setAgencyPageSize] = useState(10);
  const [teamPage, setTeamPage] = useState(1);
  const [teamPageSize, setTeamPageSize] = useState(10);
  const agencyTotalPages = Math.max(1, Math.ceil(agencies.length / agencyPageSize));
  const agencyCurrentPage = Math.min(agencyPage, agencyTotalPages);
  const pagedAgencies = agencies.slice((agencyCurrentPage - 1) * agencyPageSize, agencyCurrentPage * agencyPageSize);
  const agencyPagination = {
    page: agencyCurrentPage,
    pageSize: agencyPageSize,
    total: agencies.length,
    totalPages: agencyTotalPages,
    setPage: (p) => setAgencyPage(Math.min(Math.max(1, p), agencyTotalPages)),
    setPageSize: (n) => { setAgencyPageSize(n); setAgencyPage(1); },
  };
  const teamTotalPages = Math.max(1, Math.ceil(users.length / teamPageSize));
  const teamCurrentPage = Math.min(teamPage, teamTotalPages);
  const pagedUsers = users.slice((teamCurrentPage - 1) * teamPageSize, teamCurrentPage * teamPageSize);
  const teamPagination = {
    page: teamCurrentPage,
    pageSize: teamPageSize,
    total: users.length,
    totalPages: teamTotalPages,
    setPage: (p) => setTeamPage(Math.min(Math.max(1, p), teamTotalPages)),
    setPageSize: (n) => { setTeamPageSize(n); setTeamPage(1); },
  };

  const [formsSummary, setFormsSummary] = useState([]);

  const loadSettings = useCallback(async () => {
    const res = await api.get('/settings');
    const map = {};
    (res.data || []).forEach((row) => {
      map[row.setting_key] = row.setting_value;
    });
    setSettings(map);
    setForm(map);
  }, []);

  const loadAgencies = useCallback(async () => {
    const res = await api.get('/agencies');
    setAgencies(res.data || []);
  }, []);

  const loadUsers = useCallback(async () => {
    const res = await api.get('/employees');
    setUsers(res.data || []);
  }, []);

  const loadFormsSummary = useCallback(async () => {
    try {
      const res = await api.get('/balance-transactions/forms/summary');
      setFormsSummary(res.data || []);
    } catch (e) {
      setFormsSummary([]);
    }
  }, []);

  useEffect(() => {
    if (!isMgmt) {
      setLoading(false);
      return;
    }
    Promise.all([loadSettings(), loadAgencies(), loadUsers(), loadFormsSummary()])
      .catch(() => notify.error('Could not load some settings'))
      .finally(() => setLoading(false));
  }, [isMgmt, loadSettings, loadAgencies, loadUsers, loadFormsSummary]);

  const saveFields = async (fields) => {
    setSaving(true);
    try {
      const changed = fields.filter((f) => (form[f.key] ?? '') !== (settings[f.key] ?? ''));
      for (const f of changed) {
        // eslint-disable-next-line no-await-in-loop
        await api.put(`/settings/${f.key}`, { value: form[f.key] ?? '', description: f.label });
      }
      await loadSettings();
      notify.success(changed.length ? 'Settings saved' : 'Nothing to save');
    } catch (error) {
      notify.error(error.response?.data?.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  /* ---- agencies ---- */
  const saveAgency = async (e) => {
    e.preventDefault();
    const { id, name, phone, address } = agencyModal;
    try {
      if (id) await api.put(`/agencies/${id}`, { name, phone, address });
      else await api.post('/agencies', { name, phone, address });
      setAgencyModal(null);
      await loadAgencies();
      notify.success(id ? 'Agency updated' : 'Agency added');
    } catch (error) {
      notify.error(error.response?.data?.message || 'Could not save agency');
    }
  };

  const deleteAgency = async (agency) => {
    if (!(await confirmDialog(`Delete the agency "${agency.name}"? Deals that use it keep their record.`, { title: 'Delete agency', confirmLabel: 'Delete' }))) return;
    try {
      await api.delete(`/agencies/${agency.id}`);
      await loadAgencies();
      notify.success('Agency deleted');
    } catch (error) {
      notify.error(error.response?.data?.message || 'Could not delete agency');
    }
  };

  /* ---- team emails ---- */
  const saveUser = async (e) => {
    e.preventDefault();
    const { id, name, email, role } = userModal;
    try {
      await api.put(`/dealers/${id}`, { name, email, role });
      setUserModal(null);
      await loadUsers();
      notify.success('Account updated');
    } catch (error) {
      notify.error(error.response?.data?.message || 'Could not update account');
    }
  };

  const placeholderUsers = useMemo(() => users.filter((u) => isPlaceholderEmail(u.email)), [users]);
  const overdrawn = useMemo(() => formsSummary.filter((d) => Number(d.forms_held) < 0), [formsSummary]);

  if (loading) return <div className="premium-loading">Loading settings…</div>;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Settings</h1>
          <p>{isMgmt ? 'Your profile, company details, defaults, agencies and account clean-up.' : 'Your profile and account security.'}</p>
        </div>
      </div>

      <div className="ps-tabs" role="tablist">
        {visibleTabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`ps-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'team' && placeholderUsers.length > 0 && <span className="ps-count">{placeholderUsers.length}</span>}
            {t.id === 'health' && overdrawn.length + placeholderUsers.length > 0 && <span className="ps-count warn">{overdrawn.length + placeholderUsers.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfilePanel />}

      {tab === 'company' && (
        <form className="ps-card" onSubmit={(e) => { e.preventDefault(); saveFields(COMPANY_FIELDS); }}>
          <h3>Company details</h3>
          <p className="ps-muted">Shown on printed reports and slips.</p>
          <div className="ps-fields">
            {COMPANY_FIELDS.map((f) => (
              <div className="form-group" key={f.key}>
                <label htmlFor={f.key}>{f.label}</label>
                {f.textarea ? (
                  <textarea id={f.key} rows="3" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                ) : (
                  <input id={f.key} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          <div className="ps-actions">
            <button type="submit" className="premium-btn premium-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save company details'}</button>
          </div>
        </form>
      )}

      {tab === 'defaults' && (
        <form className="ps-card" onSubmit={(e) => { e.preventDefault(); saveFields(DEFAULT_FIELDS); }}>
          <h3>Default values</h3>
          <p className="ps-muted">These drive the Forms Ledger and adjustment forms on deals.</p>
          <div className="ps-fields">
            {DEFAULT_FIELDS.map((f) => (
              <div className="form-group" key={f.key}>
                <label htmlFor={f.key}>{f.label}</label>
                <input id={f.key} type="number" min="0" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                <small className="ps-hint">{f.hint}</small>
              </div>
            ))}
          </div>
          <div className="ps-actions">
            <button type="submit" className="premium-btn premium-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save defaults'}</button>
          </div>
        </form>
      )}

      {tab === 'agencies' && (
        <div className="ps-card">
          <div className="ps-card-head">
            <div>
              <h3>Agencies</h3>
              <p className="ps-muted">Agencies you can attach to a deal.</p>
            </div>
            <button type="button" className="premium-btn premium-btn-primary" onClick={() => setAgencyModal({ name: '', phone: '', address: '' })}>+ Add agency</button>
          </div>
          {agencies.length === 0 ? (
            <p className="ps-empty">No agencies yet. Add the first one to use it on deals.</p>
          ) : (
            <div className="premium-table-container">
              <table className="premium-table">
                <thead><tr><th>Name</th><th>Phone</th><th>Address</th><th>Actions</th></tr></thead>
                <tbody>
                  {pagedAgencies.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Name"><strong>{a.name}</strong></td>
                      <td data-label="Phone">{a.phone || '—'}</td>
                      <td data-label="Address">{a.address || '—'}</td>
                      <td data-label="Actions">
                        <div className="ps-row-actions">
                          <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setAgencyModal({ ...a, phone: a.phone || '', address: a.address || '' })}>Edit</button>
                          <button type="button" className="premium-btn premium-btn-danger" onClick={() => deleteAgency(a)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {agencies.length > 0 && <Pagination {...agencyPagination} />}
        </div>
      )}

      {tab === 'team' && (
        <div className="ps-card">
          <h3>Team emails</h3>
          <p className="ps-muted">Everyone with a login. Accounts with a made-up <code>@placeholder.local</code> address are flagged so you can give them a real one.</p>
          <div className="premium-table-container">
            <table className="premium-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
              <tbody>
                {pagedUsers.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Name"><strong>{u.name}</strong></td>
                    <td data-label="Email">
                      {u.email}
                      {isPlaceholderEmail(u.email) && <span className="premium-badge premium-badge-warning ps-flag">Needs a real email</span>}
                    </td>
                    <td data-label="Role" style={{ textTransform: 'capitalize' }}>{u.role}</td>
                    <td data-label="Actions">
                      <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setUserModal({ id: u.id, name: u.name, email: u.email, role: u.role })}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...teamPagination} />
        </div>
      )}

      {tab === 'health' && (
        <div className="ps-stack">
          <div className="ps-card">
            <h3>Placeholder emails</h3>
            {placeholderUsers.length === 0 ? (
              <p className="ps-ok">All accounts have a real email address.</p>
            ) : (
              <>
                <p className="ps-muted">These accounts cannot receive email. Give each a real address.</p>
                <ul className="ps-list">
                  {placeholderUsers.map((u) => (
                    <li key={u.id}>
                      <span><strong>{u.name}</strong><small>{u.email}</small></span>
                      <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setUserModal({ id: u.id, name: u.name, email: '', role: u.role })}>Set email</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="ps-card">
            <h3>Over-used forms</h3>
            {overdrawn.length === 0 ? (
              <p className="ps-ok">No dealer has used more forms than they were issued.</p>
            ) : (
              <>
                <p className="ps-muted">These dealers have applied more forms than were issued to them. The usual cause is forms used on deals before the matching "Issue forms" entry was recorded. Add the missing issue entries in the Forms Ledger to bring them back to zero.</p>
                <ul className="ps-list">
                  {overdrawn.map((d) => (
                    <li key={d.dealer_id}>
                      <span><strong>{d.dealer_name}</strong><small>{d.forms_held} forms held</small></span>
                      <Link className="premium-btn premium-btn-secondary" to="/forms-ledger">Open Forms Ledger</Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {agencyModal && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setAgencyModal(null)}>
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <h2>{agencyModal.id ? 'Edit agency' : 'Add agency'}</h2>
            <form onSubmit={saveAgency}>
              <div className="form-group"><label>Name</label><input value={agencyModal.name} onChange={(e) => setAgencyModal({ ...agencyModal, name: e.target.value })} required /></div>
              <div className="form-group"><label>Phone</label><input value={agencyModal.phone} onChange={(e) => setAgencyModal({ ...agencyModal, phone: e.target.value })} /></div>
              <div className="form-group"><label>Address</label><textarea rows="3" value={agencyModal.address} onChange={(e) => setAgencyModal({ ...agencyModal, address: e.target.value })} /></div>
              <div className="modal-actions">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setAgencyModal(null)}>Cancel</button>
                <button type="submit" className="premium-btn premium-btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {userModal && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setUserModal(null)}>
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <h2>Edit account</h2>
            <form onSubmit={saveUser}>
              <div className="form-group"><label>Name</label><input value={userModal.name} onChange={(e) => setUserModal({ ...userModal, name: e.target.value })} required /></div>
              <div className="form-group"><label>Email</label><input type="email" value={userModal.email} onChange={(e) => setUserModal({ ...userModal, email: e.target.value })} required /></div>
              <div className="modal-actions">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setUserModal(null)}>Cancel</button>
                <button type="submit" className="premium-btn premium-btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
