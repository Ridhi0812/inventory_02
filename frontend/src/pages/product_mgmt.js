import React, { useState, useEffect, useCallback } from 'react';
import './product_mgmt.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const EMPTY_FORM = { name: '', sku: '', price: '', quantity: '' };

// ── Reusable Toast ────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className={`toast${type ? ` ${type}` : ''}`}>{msg}</div>;
}

// ── Helper: call API and parse {success, message, data} ──
// For GET requests that return raw arrays, use fetch directly.
// For POST / PUT / DELETE that return {success, message, data}:
async function mutate(method, url, body) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) options.body = JSON.stringify(body);

  const res = await fetch(url, options);

  // Backend may return 204 No Content on DELETE
  if (res.status === 204) return { success: true, message: 'Done.' };

  const json = await res.json();

  // If backend follows {success, message, data} contract — use it directly.
  // If it returns the object directly (common FastAPI default), wrap it.
  if (typeof json.success === 'boolean') return json;

  // Fallback: treat any 2xx as success, any 4xx/5xx as failure
  if (res.ok) return { success: true,  message: 'Done.',              data: json };
  return       { success: false, message: json.detail || 'Request failed.' };
}

export default function ProductMgmt({ onLowStockChange }) {
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState('all');

  const [showModal,  setShowModal]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);   // null = add, object = edit
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [errors,     setErrors]     = useState({});
  const [saving,     setSaving]     = useState(false);

  const [confirmId, setConfirmId] = useState(null);
  const [toast,     setToast]     = useState(null);

  // ── GET /products  →  raw array ──────────────────────
  const load = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/products`);
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (onLowStockChange) {
      onLowStockChange(products.filter(p => p.quantity <= 10).length);
    }
  }, [products, onLowStockChange]);

  // ── Filter & Search ───────────────────────────────────
  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const match = !q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q);
    if (!match) return false;
    if (filter === 'low') return p.quantity > 0 && p.quantity <= 10;
    if (filter === 'out') return p.quantity === 0;
    if (filter === 'ok')  return p.quantity > 10;
    return true;
  });

  // ── Stock pill ────────────────────────────────────────
  const stockPill = (qty) => {
    if (qty === 0)  return <span className="stock-pill stock-critical">⊘ Out of stock</span>;
    if (qty <= 10)  return <span className="stock-pill stock-low">⚠ {qty} left</span>;
    return               <span className="stock-pill stock-ok">✓ {qty} in stock</span>;
  };

  // ── Open modals ───────────────────────────────────────
  const openAdd = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditTarget(p);
    setForm({ name: p.name, sku: p.sku, price: String(p.price), quantity: String(p.quantity) });
    setErrors({});
    setShowModal(true);
  };

  // ── Client-side validation ────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.name.trim())
      e.name = 'Product name is required.';
    if (!form.sku.trim())
      e.sku = 'SKU is required.';
    if (form.price === '' || isNaN(form.price) || +form.price < 0)
      e.price = 'Enter a valid price (0 or more).';
    if (form.quantity === '' || isNaN(form.quantity) || +form.quantity < 0 || !Number.isInteger(+form.quantity))
      e.quantity = 'Quantity must be a whole number, 0 or more.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── POST /products  or  PUT /products/{id} ────────────
  // Sends: { name, sku, price, quantity }
  // Expects: { success: bool, message: string, data?: Product }
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        name:     form.name.trim(),
        sku:      form.sku.trim().toUpperCase(),
        price:    parseFloat(form.price),
        quantity: parseInt(form.quantity, 10),
      };

      const url    = editTarget ? `${API}/products/${editTarget.id}` : `${API}/products`;
      const method = editTarget ? 'PUT' : 'POST';
      const result = await mutate(method, url, body);

      if (!result.success) {
        // Backend rejected it — show its message (e.g. "SKU already exists")
        setToast({ msg: result.message, type: 'error' });
        return;
      }

      await load();
      setShowModal(false);
      setToast({ msg: result.message || (editTarget ? 'Product updated.' : 'Product added.'), type: '' });
    } catch {
      setToast({ msg: 'Network error. Check your connection.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ── DELETE /products/{id} ─────────────────────────────
  // Expects: { success: bool, message: string }
  const handleDelete = async () => {
    const id = confirmId;
    setConfirmId(null);
    try {
      const result = await mutate('DELETE', `${API}/products/${id}`);
      if (!result.success) {
        setToast({ msg: result.message, type: 'error' });
        return;
      }
      await load();
      setToast({ msg: result.message || 'Product deleted.', type: '' });
    } catch {
      setToast({ msg: 'Network error. Could not delete.', type: 'error' });
    }
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
              placeholder="Search by name or SKU…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="filter-select"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="all">All Stock</option>
            <option value="ok">In Stock</option>
            <option value="low">Low Stock (≤10)</option>
            <option value="out">Out of Stock</option>
          </select>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Product</button>
      </div>

      {/* ── Table ── */}
      <div className="data-card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product Name</th>
                <th>SKU</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="loading-row"><td colSpan={6}>Loading products…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="table-empty">
                      <span className="table-empty-icon">⬡</span>
                      <span className="table-empty-text">
                        {search || filter !== 'all'
                          ? 'No products match your filters.'
                          : 'No products yet — add your first one.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((p, i) => (
                <tr key={p.id}>
                  <td className="cell-mono">{i + 1}</td>
                  <td className="cell-name">{p.name}</td>
                  <td className="cell-mono">{p.sku}</td>
                  <td className="cell-price">
                    ₹{parseFloat(p.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td>{stockPill(p.quantity)}</td>
                  <td>
                    <div className="action-btns">
                      <button className="btn-icon edit"   title="Edit product"   onClick={() => openEdit(p)}>✎</button>
                      <button className="btn-icon delete" title="Delete product" onClick={() => setConfirmId(p.id)}>⊗</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span className="table-count">{filtered.length} of {products.length} products</span>
        </div>
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editTarget ? 'Edit Product' : 'Add New Product'}</span>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Product Name</label>
                <input
                  className={`form-input${errors.name ? ' error' : ''}`}
                  placeholder="e.g. Wireless Keyboard"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
                {errors.name && <span className="form-error">{errors.name}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">SKU / Product Code</label>
                <input
                  className={`form-input${errors.sku ? ' error' : ''}`}
                  placeholder="e.g. KB-001"
                  value={form.sku}
                  onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  disabled={!!editTarget}   // SKU is immutable after creation
                />
                {editTarget && (
                  <span className="form-hint">SKU cannot be changed after creation.</span>
                )}
                {errors.sku && <span className="form-error">{errors.sku}</span>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Price (₹)</label>
                  <input
                    className={`form-input${errors.price ? ' error' : ''}`}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  />
                  {errors.price && <span className="form-error">{errors.price}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Quantity in Stock</label>
                  <input
                    className={`form-input${errors.quantity ? ' error' : ''}`}
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  />
                  {errors.quantity && <span className="form-error">{errors.quantity}</span>}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-ghost"   onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Product'}
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
              <span className="modal-title">Delete Product</span>
              <button className="modal-close" onClick={() => setConfirmId(null)}>×</button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">
                This will permanently remove the product from your catalog. If the backend prevents
                deletion (e.g. active orders reference it), you'll see an error message.
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