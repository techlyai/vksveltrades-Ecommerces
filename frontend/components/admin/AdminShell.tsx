'use client';

import type { ReactNode } from 'react';
import type { Shop } from '../../lib/types';
import { shopLogoUrl } from '../../lib/api';
import { AdminNavigation } from '../AdminNavigation';
import { ShopIcon } from '../ShopIcon';
import { ShopWordmark } from '../store/ShopWordmark';
import styles from './AdminShell.module.css';

export const adminNavigation = [
  { id: 'dashboard', label: 'Dashboard', group: 'Overview' },
  { id: 'orders', label: 'Orders', group: 'Overview' },
  { id: 'payments', label: 'Payments', group: 'Overview' },
  { id: 'customers', label: 'Customers', group: 'Overview' },
  { id: 'customer-categories', label: 'Customer Categories & Discounts', group: 'Overview' },
  { id: 'products', label: 'Products', group: 'Catalog' },
  { id: 'categories', label: 'Categories', group: 'Catalog' },
  { id: 'paint-shades', label: 'Paint shades', group: 'Catalog' },
  { id: 'wire-colors', label: 'Wire colors', group: 'Catalog' },
  { id: 'stock', label: 'Stock', group: 'Catalog' },
  { id: 'banners', label: 'Banners', group: 'Shop' },
  { id: 'delivery', label: 'Delivery', group: 'Shop' },
  { id: 'settings', label: 'Settings', group: 'Shop' },
] as const;
export type AdminTab = (typeof adminNavigation)[number]['id'];

export function AdminShell({ shop, tab, subtitle, pendingOrders, onNavigate, onLogout, children }: {
  shop: Shop; tab: AdminTab; subtitle: string; pendingOrders: number;
  onNavigate: (tab: AdminTab) => void; onLogout: () => void; children: ReactNode;
}) {
  return <main className={`admin-v2 admin-classic ${styles.frame}`}>
    <AdminNavigation>
      <a className={`admin-side-brand ${styles.brand}`} href="/" aria-label="View shop"><img src={shopLogoUrl(shop.logoUrl)} alt="" width="48" height="48" /><span><ShopWordmark name={shop.name} /><small>Admin</small></span></a>
      <nav aria-label="Admin sections">{(['Overview', 'Catalog', 'Shop'] as const).map((group) => <div key={group} className={styles.navGroup}><span className="admin-nav-heading">{group}</span>{adminNavigation.filter((item) => item.group === group).map((item) => <button key={item.id} className={`${styles.navItem} ${tab === item.id ? styles.active : ''}`} aria-current={tab === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}><ShopIcon name={item.id} /><span>{item.label}</span>{item.id === 'orders' && pendingOrders > 0 && <em>{pendingOrders}</em>}</button>)}</div>)}</nav>
      <div className={`admin-side-foot ${styles.account}`}>
        <div className="admin-owner"><span>A</span><div><b>ADMIN</b><small>Shop owner</small></div></div>
        <a href="/"><ShopIcon name="shop" /><span>View shop</span></a>
        <button onClick={onLogout}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></svg><span>Logout</span></button>
      </div>
    </AdminNavigation>
    <section className={`admin-workspace ${styles.workspace}`}>
      <header className={`admin-topbar ${styles.header}`}><div><h1>{adminNavigation.find((item) => item.id === tab)?.label}</h1><p>{subtitle}</p></div><div className={`admin-top-actions ${styles.actions}`}><button onClick={() => onNavigate('orders')}><ShopIcon name="bell" />{pendingOrders ? `${pendingOrders} to process` : 'No new orders'}</button><a href="/"><ShopIcon name="shop" />View shop</a></div></header>
      <div className={`admin-content ${styles.content}`} key={tab}>{children}</div>
    </section>
  </main>;
}
