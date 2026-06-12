import React, { useState, useEffect } from 'react';
import './Home.css';
import Dashboard    from './dashboard';
import ProductMgmt  from './product_mgmt';
import CustomerMgmt from './customer_mgmt';
import OrderMgmt    from './order_mgmt';

const TABS = [
  { id: 'dashboard', label: 'Dashboard',        icon: '▦', subtitle: 'System overview & key metrics' },
  { id: 'products',  label: 'Products & Stock', icon: '⬡', subtitle: 'Manage inventory and product catalog' },
  { id: 'customers', label: 'Customers',        icon: '◎', subtitle: 'View and manage customer records' },
  { id: 'orders',    label: 'Orders',           icon: '⊟', subtitle: 'Track and manage order lifecycle' },
];

export default function Home() {
  const [active,        setActive] = useState('dashboard');
  const [lowStockCount, setLow]    = useState(0);
  const [now,           setNow]    = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });

  const currentTab = TABS.find(t => t.id === active);

  return (
    <div className="home-shell">

      {/* ── Top Header ── */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon">📦</div>
          <span className="brand-name">Invent<span>IQ</span></span>
        </div>

        <div className="header-right">
          <span className="status-dot" title="All systems operational" />
          <span className="header-date">{dateStr}</span>
          <div className="header-avatar">A</div>
        </div>
      </header>

      {/* ── Tab Bar ── */}
      <nav className="tab-bar" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            className={`tab-btn${active === tab.id ? ' active' : ''}`}
            onClick={() => setActive(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            {tab.label}
            {tab.id === 'products' && lowStockCount > 0 && (
              <span className="tab-badge">{lowStockCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Page Body ── */}
      <main className="page-body" role="tabpanel">
        <div className="page-heading">
          <div className="page-heading-icon">{currentTab.icon}</div>
          <div>
            <h1>{currentTab.label}</h1>
            <p>{currentTab.subtitle}</p>
          </div>
        </div>

        {active === 'dashboard' && (
          <Dashboard onNavigate={setActive} onLowStockChange={setLow} />
        )}
        {active === 'products'  && <ProductMgmt  onLowStockChange={setLow} />}
        {active === 'customers' && <CustomerMgmt />}
        {active === 'orders'    && <OrderMgmt />}
      </main>

    </div>
  );
}