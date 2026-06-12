import React, { useState, useEffect, useCallback } from 'react';
import './customer_mgmt.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const EMPTY_FORM = { name: '', email: '', phone: '' };

function Toast({ msg, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className={`toast${type ? ` ${type}` : ''}`}>{msg}</div>;
}

// ── Same mutate helper as ProductMgmt ─────────────────
async function mutate(method, url, body) {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) options.body = JSON.stringify(body);

  const res  = await fetch(url, options);
  if (res.status === 204) return { success: true, message: 'Done.' };

  const json = await res.json();
  if (typeof json.success === 'boolean') return json;
  if (res.ok) return { success: true,  message: 'Done.',              data: json };
  return       { success: false, message: json.detail || 'Request failed.' };
}

function initials(name = '') {
  return name.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
}

export default function CustomerMgmt() {
  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [errors,    setErrors]    = useState({});
  const [saving,    setSaving]    = useState(false);

  const [confirmId, setConfirmId] = useState(null);
  const [toast,     setToast]     = useState(null);

  // ── GET /customers  →  raw array ─────────────────────
  const load = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/customers`);
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Search ────────────────────────────────────────────
  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return !q
      || c.name?.toLowerCase().includes(q)
      || c.email?.toLowerCase().includes(q)
      || c.phone?.includes(q);
  });

  // ── Client-side validation ────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.name.trim())
      e.name = 'Full name is required.';
    if (!form.email.trim())
      e.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Enter a valid email address.';
    if (!form.phone.trim())
      e.phone = 'Phone number is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── POST /customers ───────────────────────────────────
  // Sends:   { name, email, phone }
  // Expects: { success: bool, message: string, data?: Customer }
  //
  // If email already exists, backend returns:
  //   { success: false, message: "Email 'x@y.com' is already registered." }
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        name:  form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
      };

      const result = await mutate('POST', `${API}/customers`, body);

      if (!result.success) {
        // e.g. "Email already registered" — show exactly what the backend says
        setToast({ msg: result.message, type: 'error' });
        return;
      }

      await load();
      setShowModal(false);
      setToast({ msg: result.message || 'Customer added successfully.', type: '' });
    } catch {
      setToast({ msg: 'Network error. Check your connection.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ── DELETE /customers/{id} ────────────────────────────
  // Expects: { success: bool, message: string }
  const handleDelete = async () => {
    const id = confirmId;
    setConfirmId(null);
    try {
      const result = await mutate('DELETE', `${API}/customers/${id}`);
      if (!result.success) {
        setToast({ msg: result.message, type: 'error' });
        return;
      }
      await load();
      setToast({ msg: result.message || 'Customer removed.', type: '' });
    } catch {
      setToast({ msg: 'Network error. Could not delete.', type: 'error' });
    }
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setShowModal(true);
  };

  return (
    <div className="page-section">

      {/* ── Toolbar ── */}
      <div className="page-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <span className="search-icon">⌕</span>
            <input
              className="search-input"
              placeholder="Search by name, email or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Customer</button>
      </div>

      {/* ── Table ── */}
      <div className="data-card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Customer</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="loading-row"><td colSpan={5}>Loading customers…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="table-empty">
                      <span className="table-empty-icon">◎</span>
                      <span className="table-empty-text">
                        {search
                          ? 'No customers match your search.'
                          : 'No customers yet — add your first one.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((c, i) => (
                <tr key={c.id}>
                  <td className="cell-mono">{i + 1}</td>
                  <td>
                    <div className="customer-name-cell">
                      <span className="customer-avatar">{initials(c.name)}</span>
                      <span className="cell-name">{c.name}</span>
                    </div>
                  </td>
                  <td className="cell-email">{c.email}</td>
                  <td className="cell-phone">{c.phone}</td>
                  <td>
                    <div className="action-btns">
                      <button
                        className="btn-icon delete"
                        title="Delete customer"
                        onClick={() => setConfirmId(c.id)}
                      >⊗</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span className="table-count">{filtered.length} of {customers.length} customers</span>
        </div>
      </div>

      {/* ── Add Customer Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add New Customer</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  className={`form-input${errors.name ? ' error' : ''}`}
                  placeholder="e.g. Priya Sharma"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
                {errors.name && <span className="form-error">{errors.name}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  className={`form-input${errors.email ? ' error' : ''}`}
                  type="email"
                  placeholder="priya@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
                {errors.email && <span className="form-error">{errors.email}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  className={`form-input${errors.phone ? ' error' : ''}`}
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
                {errors.phone && <span className="form-error">{errors.phone}</span>}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-ghost"   onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete ── */}
      {confirmId && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmId(null)}>
          <div className="modal confirm-modal">
            <div className="modal-header">
              <span className="modal-title">Remove Customer</span>
              <button className="modal-close" onClick={() => setConfirmId(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                This permanently deletes the customer record. Their past orders will remain
                but lose the customer link. If the backend blocks deletion (e.g. pending orders),
                you'll see the exact reason.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost"  onClick={() => setConfirmId(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}
    </div>
  );
}