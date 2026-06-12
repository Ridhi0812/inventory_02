import React, { useState, useEffect, useCallback } from 'react';
import './order_mgmt.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function Toast({ msg, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className={`toast${type ? ` ${type}` : ''}`}>{msg}</div>;
}

// ── Same mutate helper ────────────────────────────────
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

const EMPTY_LINE = () => ({ product_id: '', quantity: 1 });

const statusBadge = (status) => {
  const s = (status || 'pending').toLowerCase();
  const cls =
    s === 'completed' ? 'badge-success' :
    s === 'pending'   ? 'badge-warning' :
    s === 'cancelled' ? 'badge-danger'  :
    'badge-default';
  return <span className={`badge ${cls}`}>{s}</span>;
};

export default function OrderMgmt() {
  const [orders,    setOrders]    = useState([]);
  const [products,  setProducts]  = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [custId,    setCustId]    = useState('');
  const [lines,     setLines]     = useState([EMPTY_LINE()]);
  const [formErr,   setFormErr]   = useState({});
  const [saving,    setSaving]    = useState(false);

  const [confirmId, setConfirmId] = useState(null);
  const [toast,     setToast]     = useState(null);

  // ── GET all three  →  raw arrays ─────────────────────
  const load = useCallback(async () => {
    try {
      const [oRes, pRes, cRes] = await Promise.all([
        fetch(`${API}/orders`),
        fetch(`${API}/products`),
        fetch(`${API}/customers`),
      ]);
      const [o, p, c] = await Promise.all([oRes.json(), pRes.json(), cRes.json()]);
      setOrders   (Array.isArray(o) ? o : []);
      setProducts (Array.isArray(p) ? p : []);
      setCustomers(Array.isArray(c) ? c : []);
    } catch { /* keep empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Lookup helpers ────────────────────────────────────
  const productById  = id => products .find(p => String(p.id) === String(id));
  const customerById = id => customers.find(c => String(c.id) === String(id));

  // ── Live order total while filling the form ───────────
  const lineTotal = line => {
    const p = productById(line.product_id);
    if (!p || !line.quantity || +line.quantity < 1) return 0;
    return parseFloat(p.price) * parseInt(line.quantity, 10);
  };
  const formOrderTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  // ── Filter orders ─────────────────────────────────────
  const filtered = orders.filter(o => {
    const q    = search.toLowerCase();
    const cust = customerById(o.customer_id);
    return !q
      || String(o.id).includes(q)
      || (cust?.name || '').toLowerCase().includes(q)
      || (o.status   || '').toLowerCase().includes(q);
  });

  // ── Client-side validation ────────────────────────────
  const validate = () => {
    const e = {};
    if (!custId) e.customer = 'Select a customer.';

    // Check for duplicate product lines
    const ids = lines.map(l => l.product_id).filter(Boolean);
    if (new Set(ids).size !== ids.length)
      e.duplicates = 'You have the same product on multiple lines — combine them into one.';

    lines.forEach((l, i) => {
      if (!l.product_id)
        e[`product_${i}`] = 'Select a product.';
      if (!l.quantity || +l.quantity < 1)
        e[`qty_${i}`] = 'Minimum quantity is 1.';
      const p = productById(l.product_id);
      if (p && +l.quantity > p.quantity)
        e[`qty_${i}`] = `Only ${p.quantity} in stock.`;
    });

    setFormErr(e);
    return Object.keys(e).length === 0;
  };

  // ── POST /orders ──────────────────────────────────────
  // Sends:
  // {
  //   "customer_id": 1,
  //   "items": [
  //     { "product_id": 3, "quantity": 2 },
  //     { "product_id": 7, "quantity": 1 }
  //   ]
  // }
  //
  // Expects on success:
  // { "success": true, "message": "Order placed.", "data": { "id": 7, "total_amount": 3897.00, ... } }
  //
  // Expects on failure (e.g. stock ran out between form load and submit):
  // { "success": false, "message": "Insufficient stock for 'Wireless Keyboard' (requested 5, available 2)." }
  //
  // Note: total_amount is NOT sent by the frontend — the backend calculates it
  // from product prices × quantities to prevent client-side price tampering.
  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        customer_id: parseInt(custId, 10),
        items: lines.map(l => ({
          product_id: parseInt(l.product_id, 10),
          quantity:   parseInt(l.quantity, 10),
        })),
      };

      const result = await mutate('POST', `${API}/orders`, body);

      if (!result.success) {
        // Backend says why — stock issue, customer not found, etc.
        setToast({ msg: result.message, type: 'error' });
        return;
      }

      await load();
      setShowModal(false);
      setToast({ msg: result.message || 'Order placed successfully.', type: '' });
    } catch {
      setToast({ msg: 'Network error. Order was not placed.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ── DELETE /orders/{id} ───────────────────────────────
  // Expects: { success: bool, message: string }
  // e.g. { "success": true, "message": "Order cancelled and stock restored." }
  const handleDelete = async () => {
    const id = confirmId;
    setConfirmId(null);
    try {
      const result = await mutate('DELETE', `${API}/orders/${id}`);
      if (!result.success) {
        setToast({ msg: result.message, type: 'error' });
        return;
      }
      await load();
      setToast({ msg: result.message || 'Order cancelled.', type: 'warn' });
    } catch {
      setToast({ msg: 'Network error. Could not cancel.', type: 'error' });
    }
  };

  const openModal = () => {
    setCustId('');
    setLines([EMPTY_LINE()]);
    setFormErr({});
    setShowModal(true);
  };

  const updateLine = (i, field, val) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [field]: val } : l));

  const removeLine = (i) =>
    setLines(ls => ls.filter((_, idx) => idx !== i));

  return (
    <div className="page-section">

      {/* ── Toolbar ── */}
      <div className="page-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <span className="search-icon">⌕</span>
            <input
              className="search-input"
              placeholder="Search by order ID, customer or status…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <button className="btn-primary" onClick={openModal}>+ New Order</button>
      </div>

      {/* ── Table ── */}
      <div className="data-card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="loading-row"><td colSpan={6}>Loading orders…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="table-empty">
                      <span className="table-empty-icon">⊟</span>
                      <span className="table-empty-text">
                        {search ? 'No orders match your search.' : 'No orders yet — create your first one.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(o => {
                const cust   = customerById(o.customer_id);
                const isOpen = expanded === o.id;
                const items  = o.items || [];

                return (
                  <React.Fragment key={o.id}>
                    <tr>
                      <td>
                        {items.length > 0 && (
                          <button
                            className="btn-expand"
                            onClick={() => setExpanded(isOpen ? null : o.id)}
                            title={isOpen ? 'Collapse' : 'View items'}
                          >
                            {isOpen ? '▾' : '▸'}
                          </button>
                        )}
                      </td>
                      <td className="cell-mono">#{o.id}</td>
                      <td className="cell-name">
                        {cust?.name || `Customer #${o.customer_id}`}
                      </td>
                      <td className="cell-price">
                        ₹{parseFloat(o.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td>{statusBadge(o.status)}</td>
                      <td>
                        <div className="action-btns">
                          <button
                            className="btn-icon delete"
                            title="Cancel order"
                            onClick={() => setConfirmId(o.id)}
                          >⊗</button>
                        </div>
                      </td>
                    </tr>

                    {/* ── Expanded items ── */}
                    {isOpen && (
                      <tr className="order-detail-row">
                        <td colSpan={6}>
                          <div className="order-detail-inner">
                            <div className="order-detail-title">Order Items</div>
                            <div className="order-items-list">
                              {items.map((item, idx) => {
                                const prod = productById(item.product_id);
                                const sub  = parseFloat(prod?.price || 0) * item.quantity;
                                return (
                                  <div className="order-item-line" key={idx}>
                                    <span className="oil-name">
                                      {prod?.name || `Product #${item.product_id}`}
                                    </span>
                                    <span className="oil-qty">× {item.quantity}</span>
                                    <span className="oil-price">
                                      ₹{sub.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span className="table-count">{filtered.length} of {orders.length} orders</span>
        </div>
      </div>

      {/* ── Create Order Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <span className="modal-title">New Order</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <div className="modal-body">

              {/* Customer */}
              <div className="form-group">
                <label className="form-label">Customer</label>
                <select
                  className={`form-input${formErr.customer ? ' error' : ''}`}
                  value={custId}
                  onChange={e => setCustId(e.target.value)}
                >
                  <option value="">— Select a customer —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} · {c.email}</option>
                  ))}
                </select>
                {formErr.customer && <span className="form-error">{formErr.customer}</span>}
              </div>

              {/* Duplicate line warning */}
              {formErr.duplicates && (
                <span className="form-error">{formErr.duplicates}</span>
              )}

              {/* Product lines */}
              <div className="form-group">
                <label className="form-label">Products</label>
                <div className="product-selector">
                  <div className="product-selector-header">
                    <span>Product</span>
                    <span>Qty</span>
                    <span>Subtotal</span>
                    <span></span>
                  </div>

                  {lines.map((line, i) => {
                    const prod = productById(line.product_id);
                    return (
                      <div className="order-line-row" key={i}>
                        <div>
                          <select
                            className={`order-line-select${formErr[`product_${i}`] ? ' error' : ''}`}
                            value={line.product_id}
                            onChange={e => updateLine(i, 'product_id', e.target.value)}
                          >
                            <option value="">— Select product —</option>
                            {products
                              .filter(p => p.quantity > 0)
                              .map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.quantity} left)
                                </option>
                              ))}
                          </select>
                          {formErr[`product_${i}`] && (
                            <span className="form-error">{formErr[`product_${i}`]}</span>
                          )}
                        </div>

                        <div>
                          <input
                            className={`order-line-qty${formErr[`qty_${i}`] ? ' error' : ''}`}
                            type="number"
                            min="1"
                            max={prod?.quantity || 999}
                            value={line.quantity}
                            onChange={e => updateLine(i, 'quantity', e.target.value)}
                          />
                          {formErr[`qty_${i}`] && (
                            <span className="form-error" style={{ fontSize: 10 }}>
                              {formErr[`qty_${i}`]}
                            </span>
                          )}
                        </div>

                        <span className="order-line-total">
                          {lineTotal(line) > 0
                            ? `₹${lineTotal(line).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </span>

                        <button
                          className="btn-remove-line"
                          onClick={() => removeLine(i)}
                          disabled={lines.length === 1}
                          title="Remove this line"
                        >×</button>
                      </div>
                    );
                  })}
                </div>

                <button
                  className="btn-add-line"
                  onClick={() => setLines(ls => [...ls, EMPTY_LINE()])}
                >
                  + Add another product
                </button>
              </div>

              {/* Running total (frontend preview only — backend recalculates on submit) */}
              <div className="order-total-summary">
                <span className="ots-label">Estimated Total</span>
                <span className="ots-value">
                  ₹{formOrderTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>
                Final total is calculated by the server.
              </p>

            </div>

            <div className="modal-footer">
              <button className="btn-ghost"   onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Placing order…' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Cancel ── */}
      {confirmId && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmId(null)}>
          <div className="modal confirm-modal">
            <div className="modal-header">
              <span className="modal-title">Cancel Order #{confirmId}</span>
              <button className="modal-close" onClick={() => setConfirmId(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                This will cancel the order and restore stock for all items. If the backend
                blocks cancellation (e.g. already completed), you'll see the exact reason.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost"  onClick={() => setConfirmId(null)}>Keep Order</button>
              <button className="btn-danger" onClick={handleDelete}>Cancel Order</button>
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