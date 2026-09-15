import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FaPlus, FaTimes, FaHandHoldingUsd, FaChartLine, FaUserTie, FaUndo } from 'react-icons/fa';
import TableToolbar, { useTableFilters } from '../components/TableToolbar';
import './LoansAndInvestments.css';

const LOAN_RECEIVABLE_COLUMNS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'balance', label: 'Outstanding', type: 'currency' },
];

const LOAN_PAYABLE_COLUMNS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'balance', label: 'Outstanding', type: 'currency' },
];

const INVESTMENT_COLUMNS = [
  { key: 'name', label: 'Venture', type: 'text' },
  { key: 'balance', label: 'Outstanding', type: 'currency' },
];

const CATEGORY_OPTIONS = [
  { value: 'loan_given', label: 'Loan Given (to someone)' },
  { value: 'loan_taken', label: 'Loan Taken (by the company)' },
  { value: 'investment_made', label: 'Investment Made' },
  { value: 'investment_return', label: 'Investment Returned' },
  { value: 'owner_drawing', label: 'Owner Drawing' },
  { value: 'owner_contribution', label: 'Owner Contribution' }
];

const today = () => new Date().toISOString().split('T')[0];

const emptyForm = {
  category: 'loan_given',
  counterparty_name: '',
  venture_name: '',
  amount: '',
  date: today(),
  description: '',
  voucher_no: '',
  instrument: 'Cash',
  instrument_number: '',
  proof_file: null
};

const emptyRepayForm = {
  amount: '',
  date: today(),
  description: '',
  voucher_no: '',
  instrument: 'Cash',
  instrument_number: '',
  proof_file: null
};

const LoansAndInvestments = () => {
  const [activeTab, setActiveTab] = useState('loans');
  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState({ receivable: [], payable: [] });
  const [investments, setInvestments] = useState([]);
  const [ownerBalance, setOwnerBalance] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  const [repayTarget, setRepayTarget] = useState(null); // { account_id, name, isReceivable }
  const [repayFormData, setRepayFormData] = useState(emptyRepayForm);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [loansRes, investmentsRes, ownerRes] = await Promise.all([
        api.get('/finance/loans'),
        api.get('/finance/investments'),
        api.get('/finance/owner-balance')
      ]);
      setLoans(loansRes.data);
      setInvestments(investmentsRes.data);
      setOwnerBalance(parseFloat(ownerRes.data.balance) || 0);
    } catch (error) {
      console.error('Error fetching loans/investments data:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalOutstanding = (rows) => rows.reduce((sum, r) => sum + parseFloat(r.balance || 0), 0);

  const {
    search: receivableSearch, setSearch: setReceivableSearch,
    filters: receivableFilters, setFilter: setReceivableFilter, clearFilters: clearReceivableFilters,
    filteredData: filteredLoansReceivable,
    uniqueValues: receivableUniqueValues,
    showFilters: showReceivableFilters, setShowFilters: setShowReceivableFilters,
    activeFilterCount: receivableActiveFilterCount,
  } = useTableFilters(loans.receivable, LOAN_RECEIVABLE_COLUMNS);

  const {
    search: payableSearch, setSearch: setPayableSearch,
    filters: payableFilters, setFilter: setPayableFilter, clearFilters: clearPayableFilters,
    filteredData: filteredLoansPayable,
    uniqueValues: payableUniqueValues,
    showFilters: showPayableFilters, setShowFilters: setShowPayableFilters,
    activeFilterCount: payableActiveFilterCount,
  } = useTableFilters(loans.payable, LOAN_PAYABLE_COLUMNS);

  const {
    search: investmentsSearch, setSearch: setInvestmentsSearch,
    filters: investmentsFilters, setFilter: setInvestmentsFilter, clearFilters: clearInvestmentsFilters,
    filteredData: filteredInvestments,
    uniqueValues: investmentsUniqueValues,
    showFilters: showInvestmentsFilters, setShowFilters: setShowInvestmentsFilters,
    activeFilterCount: investmentsActiveFilterCount,
  } = useTableFilters(investments, INVESTMENT_COLUMNS);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    setFormData(prev => ({ ...prev, proof_file: e.target.files[0] }));
  };

  const isLoanCategory = formData.category === 'loan_given' || formData.category === 'loan_taken';
  const isInvestmentCategory = formData.category === 'investment_made' || formData.category === 'investment_return';
  const isOwnerCategory = formData.category === 'owner_drawing' || formData.category === 'owner_contribution';

  const categoryToRequest = () => {
    const shared = {
      amount: formData.amount,
      date: formData.date,
      description: formData.description,
      voucher_no: formData.voucher_no,
      instrument: formData.instrument,
      instrument_number: formData.instrument_number,
      proof_file: formData.proof_file
    };

    if (formData.category === 'loan_given') {
      return { url: '/finance/loans', body: { ...shared, direction: 'given', counterparty_name: formData.counterparty_name } };
    }
    if (formData.category === 'loan_taken') {
      return { url: '/finance/loans', body: { ...shared, direction: 'taken', counterparty_name: formData.counterparty_name } };
    }
    if (formData.category === 'investment_made') {
      return { url: '/finance/investments', body: { ...shared, direction: 'made', venture_name: formData.venture_name } };
    }
    if (formData.category === 'investment_return') {
      return { url: '/finance/investments', body: { ...shared, direction: 'return', venture_name: formData.venture_name } };
    }
    if (formData.category === 'owner_drawing') {
      return { url: '/finance/owner-transactions', body: { ...shared, direction: 'drawing' } };
    }
    return { url: '/finance/owner-transactions', body: { ...shared, direction: 'contribution' } };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { url, body } = categoryToRequest();
      const data = new FormData();
      Object.keys(body).forEach(key => {
        if (body[key] !== null && body[key] !== '') data.append(key, body[key]);
      });

      await api.post(url, data, { headers: { 'Content-Type': 'multipart/form-data' } });

      setShowModal(false);
      setFormData(emptyForm);
      fetchAll();
    } catch (err) {
      alert('Error saving entry: ' + (err.response?.data?.message || err.message));
    }
  };

  const openRepay = (account_id, name, isReceivable) => {
    setRepayTarget({ account_id, name, isReceivable });
    setRepayFormData(emptyRepayForm);
  };

  const handleRepaySubmit = async (e) => {
    e.preventDefault();
    try {
      const data = new FormData();
      Object.keys(repayFormData).forEach(key => {
        if (repayFormData[key] !== null && repayFormData[key] !== '') data.append(key, repayFormData[key]);
      });

      await api.post(`/finance/loans/${repayTarget.account_id}/repay`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setRepayTarget(null);
      fetchAll();
    } catch (err) {
      alert('Error recording repayment: ' + (err.response?.data?.message || err.message));
    }
  };

  if (loading) return <div className="finance-loading">Loading loans &amp; investments...</div>;

  return (
    <div className="premium-page">
      <div className="premium-page-header">
        <div>
          <h1>Loans &amp; Investments</h1>
          <p>Where surplus cash goes once it lands in Cash/Bank &mdash; lent out, invested, borrowed, or drawn out.</p>
        </div>
        <div className="header-actions">
          <button className="premium-btn premium-btn-primary" onClick={() => setShowModal(true)}>
            <FaPlus /> Add Entry
          </button>
        </div>
      </div>

      <div className="li-summary-grid">
        <div className="li-summary-card">
          <label><FaHandHoldingUsd /> Owed To Us</label>
          <span className="amount">Rs. {totalOutstanding(loans.receivable).toLocaleString()}</span>
        </div>
        <div className="li-summary-card">
          <label><FaUserTie /> We Owe</label>
          <span className="amount">Rs. {totalOutstanding(loans.payable).toLocaleString()}</span>
        </div>
        <div className="li-summary-card">
          <label><FaChartLine /> Invested (Outstanding)</label>
          <span className="amount">Rs. {totalOutstanding(investments).toLocaleString()}</span>
        </div>
        <div className="li-summary-card">
          <label><FaUndo /> Owner Equity</label>
          <span className="amount">Rs. {ownerBalance.toLocaleString()}</span>
        </div>
      </div>

      <div className="li-tabs-nav">
        <button className={`li-tab-item ${activeTab === 'loans' ? 'active' : ''}`} onClick={() => setActiveTab('loans')}>
          Loans
        </button>
        <button className={`li-tab-item ${activeTab === 'investments' ? 'active' : ''}`} onClick={() => setActiveTab('investments')}>
          Investments
        </button>
      </div>

      {activeTab === 'loans' && (
        <>
          <h3 style={{ marginBottom: '0.75rem' }}>Loans Receivable &mdash; owed to us</h3>
          <TableToolbar
            columns={LOAN_RECEIVABLE_COLUMNS}
            search={receivableSearch}
            onSearchChange={setReceivableSearch}
            filters={receivableFilters}
            onFilterChange={setReceivableFilter}
            uniqueValues={receivableUniqueValues}
            showFilters={showReceivableFilters}
            onToggleFilters={() => setShowReceivableFilters(!showReceivableFilters)}
            onClearFilters={clearReceivableFilters}
            activeFilterCount={receivableActiveFilterCount}
            searchPlaceholder="Search by name..."
            resultCount={filteredLoansReceivable.length}
          />
          <div className="premium-table-container">
            <table className="premium-table">
              <thead>
                <tr><th>Name</th><th>Outstanding</th><th></th></tr>
              </thead>
              <tbody>
                {filteredLoansReceivable.length === 0 && (
                  <tr className="li-empty-row"><td colSpan="3">No loans given out yet.</td></tr>
                )}
                {filteredLoansReceivable.map(row => (
                  <tr key={row.account_id}>
                    <td>{row.name}</td>
                    <td>
                      <span className={`li-balance ${parseFloat(row.balance) > 0 ? 'positive' : 'zero'}`}>
                        Rs. {parseFloat(row.balance).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      {parseFloat(row.balance) > 0 && (
                        <button className="premium-btn premium-btn-secondary" onClick={() => openRepay(row.account_id, row.name, true)}>
                          Record Repayment
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ margin: '1.5rem 0 0.75rem' }}>Loans Payable &mdash; we owe</h3>
          <TableToolbar
            columns={LOAN_PAYABLE_COLUMNS}
            search={payableSearch}
            onSearchChange={setPayableSearch}
            filters={payableFilters}
            onFilterChange={setPayableFilter}
            uniqueValues={payableUniqueValues}
            showFilters={showPayableFilters}
            onToggleFilters={() => setShowPayableFilters(!showPayableFilters)}
            onClearFilters={clearPayableFilters}
            activeFilterCount={payableActiveFilterCount}
            searchPlaceholder="Search by name..."
            resultCount={filteredLoansPayable.length}
          />
          <div className="premium-table-container">
            <table className="premium-table">
              <thead>
                <tr><th>Name</th><th>Outstanding</th><th></th></tr>
              </thead>
              <tbody>
                {filteredLoansPayable.length === 0 && (
                  <tr className="li-empty-row"><td colSpan="3">No loans taken yet.</td></tr>
                )}
                {filteredLoansPayable.map(row => (
                  <tr key={row.account_id}>
                    <td>{row.name}</td>
                    <td>
                      <span className={`li-balance ${parseFloat(row.balance) > 0 ? 'positive' : 'zero'}`}>
                        Rs. {parseFloat(row.balance).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      {parseFloat(row.balance) > 0 && (
                        <button className="premium-btn premium-btn-secondary" onClick={() => openRepay(row.account_id, row.name, false)}>
                          Repay
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'investments' && (
        <>
          <TableToolbar
            columns={INVESTMENT_COLUMNS}
            search={investmentsSearch}
            onSearchChange={setInvestmentsSearch}
            filters={investmentsFilters}
            onFilterChange={setInvestmentsFilter}
            uniqueValues={investmentsUniqueValues}
            showFilters={showInvestmentsFilters}
            onToggleFilters={() => setShowInvestmentsFilters(!showInvestmentsFilters)}
            onClearFilters={clearInvestmentsFilters}
            activeFilterCount={investmentsActiveFilterCount}
            searchPlaceholder="Search by venture..."
            resultCount={filteredInvestments.length}
          />
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr><th>Venture</th><th>Outstanding</th></tr>
            </thead>
            <tbody>
              {filteredInvestments.length === 0 && (
                <tr className="li-empty-row"><td colSpan="2">No investments recorded yet.</td></tr>
              )}
              {filteredInvestments.map(row => (
                <tr key={row.account_id}>
                  <td>{row.name}</td>
                  <td>
                    <span className={`li-balance ${parseFloat(row.balance) > 0 ? 'positive' : 'zero'}`}>
                      Rs. {parseFloat(row.balance).toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>New Loan / Investment Entry</h2>
              <button onClick={() => setShowModal(false)} className="close-modal-btn"><FaTimes /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Category</label>
                <select name="category" className="form-control" value={formData.category} onChange={handleInputChange}>
                  {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {isLoanCategory && (
                <div className="form-group">
                  <label>{formData.category === 'loan_given' ? 'Given To' : 'Taken From'}</label>
                  <input
                    type="text" name="counterparty_name" className="form-control" required
                    placeholder="Person or party's name"
                    value={formData.counterparty_name} onChange={handleInputChange}
                  />
                </div>
              )}

              {isInvestmentCategory && (
                <div className="form-group">
                  <label>Venture</label>
                  <input
                    type="text" name="venture_name" className="form-control" required
                    placeholder="Where the investment is/was made"
                    value={formData.venture_name} onChange={handleInputChange}
                  />
                </div>
              )}

              {isOwnerCategory && (
                <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '1rem' }}>
                  Posts directly against the Owner Equity / Drawings account &mdash; no counterparty needed.
                </small>
              )}

              <div className="form-group">
                <label>Amount (Rs.)</label>
                <input type="number" name="amount" className="form-control" required value={formData.amount} onChange={handleInputChange} />
              </div>
              <div className="form-group">
                <label>Voucher Number</label>
                <input type="text" name="voucher_no" className="form-control" value={formData.voucher_no} onChange={handleInputChange} />
              </div>
              <div className="form-group">
                <label>Instrument</label>
                <select name="instrument" className="form-control" value={formData.instrument} onChange={handleInputChange}>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Online">Online Transfer</option>
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" name="date" className="form-control" value={formData.date} onChange={handleInputChange} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea name="description" className="form-control" value={formData.description} onChange={handleInputChange}></textarea>
              </div>
              <div className="form-group">
                <label>Proof Attachment (Slip/Receipt)</label>
                <input type="file" className="form-control" accept="image/*" onChange={handleFileChange} />
              </div>
              <div className="modal-footer">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="premium-btn premium-btn-primary">Save Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {repayTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{repayTarget.isReceivable ? 'Record Repayment' : 'Repay Loan'} &mdash; {repayTarget.name}</h2>
              <button onClick={() => setRepayTarget(null)} className="close-modal-btn"><FaTimes /></button>
            </div>
            <form onSubmit={handleRepaySubmit}>
              <div className="form-group">
                <label>Amount (Rs.)</label>
                <input
                  type="number" name="amount" className="form-control" required
                  value={repayFormData.amount}
                  onChange={(e) => setRepayFormData(prev => ({ ...prev, amount: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Voucher Number</label>
                <input
                  type="text" name="voucher_no" className="form-control"
                  value={repayFormData.voucher_no}
                  onChange={(e) => setRepayFormData(prev => ({ ...prev, voucher_no: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Instrument</label>
                <select
                  name="instrument" className="form-control"
                  value={repayFormData.instrument}
                  onChange={(e) => setRepayFormData(prev => ({ ...prev, instrument: e.target.value }))}
                >
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Online">Online Transfer</option>
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date" name="date" className="form-control"
                  value={repayFormData.date}
                  onChange={(e) => setRepayFormData(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description" className="form-control"
                  value={repayFormData.description}
                  onChange={(e) => setRepayFormData(prev => ({ ...prev, description: e.target.value }))}
                ></textarea>
              </div>
              <div className="form-group">
                <label>Proof Attachment (Slip/Receipt)</label>
                <input
                  type="file" className="form-control" accept="image/*"
                  onChange={(e) => setRepayFormData(prev => ({ ...prev, proof_file: e.target.files[0] }))}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="premium-btn premium-btn-secondary" onClick={() => setRepayTarget(null)}>Cancel</button>
                <button type="submit" className="premium-btn premium-btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoansAndInvestments;
