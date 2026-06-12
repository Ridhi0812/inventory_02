import React, { useEffect, useState, useCallback } from 'react';
import './dashboard.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Dashboard({ onNavigate, onLowStockChange }) {
  const [products,  setProducts]  = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [pRes, cRes, oRes] = await Promise.all([
        fetch(`${API}/products`),
        fetch(`${API}/customers`),
        fetch(`${API}/orders`),
      ]);
      const [p, c, o] = await Promise.all([pRes.json(), cRes.json(), oRes.json()]);
      setProducts (Array.isArray(p) ? p : []);
      setCustomers(Array.isArray(c) ? c : []);
      setOrders   (Array.isArray(o) ? o : []);
    } catch { /* keep empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const LOW_THRESHOLD = 10;
  const lowStock = products.filter(p => p.quantity <= LOW_THRESHOLD);

  useEffect(() => {
    if (onLowStockChange) onLowStockChange(lowStock.length);
  }, [lowStock.length, onLowStockChange]);

  const ordersByDay = DAYS.map((_, i) =>
    orders.filter(o => {
      const d = new Date(o.created_at || Date.now());
      return d.getDay() === (i + 1) % 7;
    }).length
  );
  const maxOrders = Math.max(...ordersByDay, 1);

  const totalRevenue = orders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
  const recentOrders = [...orders].reverse().slice(0, 5);

  const statusBadge = (status) => {
    const s = (status || 'pending').toLowerCase();
    const cls = s === 'completed' ? 'badge-success'
               : s === 'pending'  ? 'badge-warning'
               : s === 'cancelled'? 'badge-danger'
               : 'badge-default';
    return <span className={`badge ${cls}`}>{s}</span>;
  };

  if (loading) {
    return (
      <div className="empty-state">
        <span className="empty-icon">⟳</span>
        <span>Loading dashboard…</span>
      </div>
    );
  }

  return (
    <div className="dashboard-grid">

      {/* ── Stat Cards ── */}
      <div className="stat-cards">
        <div
          className="stat-card"
          style={{
            '--card-gradient': 'linear-gradient(90deg,#4f7ef7,#7c6df0)',
            '--icon-bg': 'rgba(79,126,247,0.12)',
          }}
          onClick={() => onNavigate('products')}
        >
          <div className="stat-card-top">
            <span className="stat-label">Total Products</span>
            <div className="stat-icon">⬡</div>
          </div>
          <div className="stat-value">{products.length}</div>
          <div className="stat-sub">
            <span className="warn">⚠ {lowStock.length} low stock</span>
          </div>
        </div>

        <div
          className="stat-card"
          style={{
            '--card-gradient': 'linear-gradient(90deg,#7c6df0,#a855f7)',
            '--icon-bg': 'rgba(124,109,240,0.12)',
          }}
          onClick={() => onNavigate('customers')}
        >
          <div className="stat-card-top">
            <span className="stat-label">Customers</span>
            <div className="stat-icon">◎</div>
          </div>
          <div className="stat-value">{customers.length}</div>
          <div className="stat-sub">
            <span className="up">↑ Active accounts</span>
          </div>
        </div>

        <div
          className="stat-card"
          style={{
            '--card-gradient': 'linear-gradient(90deg,#10b96a,#06b6d4)',
            '--icon-bg': 'rgba(16,185,106,0.12)',
          }}
          onClick={() => onNavigate('orders')}
        >
          <div className="stat-card-top">
            <span className="stat-label">Total Orders</span>
            <div className="stat-icon">⊟</div>
          </div>
          <div className="stat-value">{orders.length}</div>
          <div className="stat-sub">
            <span className="up">
              {orders.filter(o => (o.status||'').toLowerCase() === 'pending').length} pending
            </span>
          </div>
        </div>

        <div
          className="stat-card"
          style={{
            '--card-gradient': 'linear-gradient(90deg,#f59e0b,#ef4444)',
            '--icon-bg': 'rgba(245,158,11,0.12)',
          }}
        >
          <div className="stat-card-top">
            <span className="stat-label">Revenue</span>
            <div className="stat-icon">₹</div>
          </div>
          <div className="stat-value" style={{ fontSize: 24 }}>
            ₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <div className="stat-sub">
            <span className="up">From {orders.length} orders</span>
          </div>
        </div>
      </div>

      {/* ── Row: Weekly Chart + Low Stock ── */}
      <div className="dash-row">
        <div className="dash-panel">
          <div className="panel-header">
            <span className="panel-title">📊 Orders This Week</span>
            <button className="panel-action" onClick={() => onNavigate('orders')}>View all →</button>
          </div>
          {orders.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📊</span>
              <span>No orders yet</span>
            </div>
          ) : (
            <div className="mini-chart">
              {DAYS.map((day, i) => (
                <div className="bar-col" key={day}>
                  <div
                    className="bar-fill"
                    style={{ height: `${(ordersByDay[i] / maxOrders) * 88}px` }}
                    title={`${ordersByDay[i]} orders on ${day}`}
                  />
                  <span className="bar-label">{day}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dash-panel">
          <div className="panel-header">
            <span className="panel-title">⚠️ Low Stock Alert</span>
            <button className="panel-action" onClick={() => onNavigate('products')}>Restock →</button>
          </div>
          {lowStock.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">✅</span>
              <span>All stock levels healthy</span>
            </div>
          ) : (
            <div className="low-stock-list">
              {lowStock.slice(0, 8).map(p => (
                <div className="low-stock-item" key={p.id}>
                  <div>
                    <div className="lsi-name">{p.name}</div>
                    <div className="lsi-sku">{p.sku}</div>
                  </div>
                  <div className={`lsi-qty${p.quantity <= 3 ? ' critical' : ''}`}>
                    {p.quantity} left
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Orders ── */}
      <div className="dash-panel">
        <div className="panel-header">
          <span className="panel-title">🧾 Recent Orders</span>
          <button className="panel-action" onClick={() => onNavigate('orders')}>View all →</button>
        </div>
        {recentOrders.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📋</span>
            <span>No orders placed yet</span>
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(o => (
                  <tr key={o.id}>
                    <td className="order-id-cell">#{o.id}</td>
                    <td>{o.customer_name || o.customer_id || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--success)', fontWeight: 700 }}>
                      ₹{parseFloat(o.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td>{statusBadge(o.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}