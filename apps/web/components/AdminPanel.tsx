'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, assetUrl, shopLogoUrl } from '../lib/api';
import { ShopWordmark } from './store/ShopWordmark';
import { AdminModal } from './AdminModal';
import { AdminShell, type AdminTab } from './admin/AdminShell';
import { AdminOrderAlerts, AdminOrderAlertStatus } from './admin/AdminOrderAlerts';
import { OrderSoundSettings } from './admin/OrderSoundSettings';
import { AdminPasswordSettings } from './admin/AdminPasswordSettings';
import { PaintShadeManager } from './admin/PaintShadeManager';
import { WireColorManager } from './admin/WireColorManager';
import { productImageSlots } from '../lib/product-images';
import { CategoryIcon } from './CategoryIcon';
import { ProductEditor, CategoryEditor } from './CatalogEditors';
import { ProductActions } from './ProductActions';
import { ImageUpload, ImageUploadProvider } from './ImageUpload';
import type { Banner, Catalog, Category, Order, Product } from '../lib/types';
import { paymentStatusLabel } from '../lib/payment-status';

type Dashboard = {
  products: number;
  lowStock: number;
  orders: number;
  customers: number;
  revenue: number;
  pendingPayments: number;
};
type CustomerSummary = {
  customer: { name: string; phone: string; city: string };
  orders: number;
  spent: number;
  lastOrderAt: string;
};
type Configuration = {
  shop: Catalog['shop'];
  deliveryRules: Array<{ id: string; match: string; charge: number }>;
  customerCategories: Catalog['customerCategories'];
  banners: Catalog['banners'];
  categories: Catalog['categories'];
};
type OverviewData = {
  dashboard: Dashboard;
  orders: Order[];
  products: Product[];
  categories: Category[];
};

const money = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
export function AdminPanel({
  catalog,
  refresh,
}: {
  catalog: Catalog;
  refresh: () => void;
}) {
  const [token, setToken] = useState('');
  const [credentials, setCredentials] = useState({
    username: 'admin',
    password: '',
  });
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [data, setData] = useState<
    | OverviewData
    | Order[]
    | Product[]
    | Banner[]
    | Category[]
    | CustomerSummary[]
    | Configuration
    | null
  >(null);
  const [query, setQuery] = useState('');
  const [adminCategories, setAdminCategories] = useState<Category[]>(catalog.categories);
  const [error, setError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [liveOrderCount, setLiveOrderCount] = useState<number | null>(null);

  const load = async (accessToken = token, activeTab = tab) => {
    if (activeTab === 'paint-shades' || activeTab === 'wire-colors') return;
    setBusy(true);
    try {
      if (['products', 'stock', 'banners'].includes(activeTab)) {
        setAdminCategories(await api.admin<Category[]>('/categories', accessToken));
      }
      if (activeTab === 'dashboard') {
        const [dashboard, orders, products, categories] = await Promise.all([
          api.admin<Dashboard>('/dashboard', accessToken),
          api.admin<Order[]>('/orders', accessToken),
          api.admin<Product[]>('/products', accessToken),
          api.admin<Category[]>('/categories', accessToken),
        ]);
        setData({ dashboard, orders, products, categories });
      } else {
        const path =
          activeTab === 'settings' || activeTab === 'delivery'
            ? '/configuration'
            : activeTab === 'payments' || activeTab === 'orders'
              ? '/orders?includeArchived=true'
              : activeTab === 'stock'
                ? '/products'
                : `/${activeTab}`;
        setData(await api.admin(path, accessToken));
      }
      setError('');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to load admin data',
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (token) void load(token, tab);
  }, [tab]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.login(
        credentials.username,
        credentials.password,
      );
      setToken(result.accessToken);
      setCredentials((current) => ({ ...current, password: '' }));
      setLoginNotice('');
      setTab('dashboard');
      await load(result.accessToken, 'dashboard');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const products = useMemo(
    () =>
      Array.isArray(data) && tab === 'products'
        ? (data as Product[]).filter((product) =>
            `${product.name} ${product.hsn}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
        : [],
    [data, query, tab],
  );

  const saveStock = async (
    product: Product,
    quantity: number,
    variantId?: string,
  ) => {
    await api.admin(`/products/${product.id}/stock`, token, {
      method: 'PUT',
      body: JSON.stringify({ quantity, variantId }),
    });
    await load();
    refresh();
  };

  const verifyPayment = async (order: Order) => {
    if (!window.confirm(`Confirm that you checked the actual bank/UPI transaction for ${order.id}, matched the reference and received ${money(order.total)}. Approve this payment?`)) return;
    try {
      await api.admin(`/orders/${order.id}/verify-payment`, token, { method: 'POST' });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to verify payment. Please retry.'); }
  };

  const changeStatus = async (order: Order, status: string) => {
    try {
      await api.admin(`/orders/${order.id}/status`, token, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update this order. Please retry.'); }
  };

  const archiveOrders = async (orderIds: string[], archived: boolean) => {
    await api.admin('/orders/archive', token, {
      method: 'PUT', body: JSON.stringify({ orderIds, archived }),
    });
    await load();
    setLiveOrderCount(null);
  };

  const saveBanner = async (banner: Partial<Banner>, isNew: boolean) => {
    setBusy(true);
    try {
      // Drop blank brand/image lines left by the comma- and line-separated inputs.
      const clean = (values?: string[]) => values?.map((value) => value.trim()).filter(Boolean);
      await api.admin(isNew ? '/banners' : `/banners/${banner.id}`, token, {
        method: isNew ? 'POST' : 'PATCH',
        body: JSON.stringify({ ...banner, brands: clean(banner.brands), gallery: clean(banner.gallery) }),
      });
      await load();
      refresh();
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to save banner',
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const deleteBanner = async (banner: Banner) => {
    if (!window.confirm(`Delete banner “${banner.title}”?`)) return;
    setBusy(true);
    try {
      await api.admin(`/banners/${banner.id}`, token, { method: 'DELETE' });
      await load();
      refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Unable to delete banner',
      );
    } finally {
      setBusy(false);
    }
  };

  const saveShop = async (shop: Partial<Catalog['shop']>) => {
    setBusy(true);
    try {
      await api.admin('/configuration/shop', token, {
        method: 'PATCH',
        body: JSON.stringify(shop),
      });
      await load(token, tab);
      refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to save store settings',
      );
    } finally {
      setBusy(false);
    }
  };

  const mutate = async (path: string, init: RequestInit, activeTab = tab) => {
    setBusy(true);
    try {
      await api.admin(path, token, init);
      await load(token, activeTab);
      refresh();
      setError('');
      return { ok: true as const };
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'Unable to save changes';
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setBusy(false);
    }
  };

  if (!token)
    return (
      <main className="admin-auth-v2">
        <section className="admin-auth-card">
          <div className="admin-auth-brand">
            <img src={shopLogoUrl(catalog.shop.logoUrl)} alt="" />
            <div>
              <ShopWordmark name={catalog.shop.name} />
              <small>Management console</small>
            </div>
          </div>
          <div className="admin-auth-copy">
            <span>Secure access</span>
            <h1>Sign in to manage your store</h1>
            <p>Review orders, confirm payments and control live inventory.</p>
          </div>
          {loginNotice && <p role="status">{loginNotice}</p>}
          <form onSubmit={login}>
            <label>
              <span>Username</span>
              <input
                autoComplete="username"
                value={credentials.username}
                onChange={(event) =>
                  setCredentials({
                    ...credentials,
                    username: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>Password</span>
              <input
                autoComplete="current-password"
                type="password"
                value={credentials.password}
                onChange={(event) =>
                  setCredentials({
                    ...credentials,
                    password: event.target.value,
                  })
                }
              />
            </label>
            {error && <p className="admin-error">{error}</p>}
            <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <a href="/">← Return to storefront</a>
        </section>
      </main>
    );

  const loadedOrders =
    Array.isArray(data) && (tab === 'orders' || tab === 'payments')
      ? (data as Order[])
      : data && !Array.isArray(data) && 'orders' in data
        ? data.orders
        : [];
  const pendingOrders = liveOrderCount ?? loadedOrders.filter(
    (order) => !order.adminArchivedAt && !['Delivered', 'Cancelled'].includes(order.status),
  ).length;
  const subtitle =
    tab === 'dashboard'
      ? `${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'} · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`
      : (
          {
            orders: 'Track and update customer orders',
            payments: 'Verified payments, pending UPI checks and refunds',
            products: 'Add, edit and price your products',
            categories: 'Organise how customers browse',
            'paint-shades': 'Shade numbers, colors and images for the customer shade card',
            'wire-colors': 'Available wire colors, prices and stock',
            stock: 'Inventory levels and availability',
            customers: 'Everyone who has ordered from you',
            'customer-categories':
              'Discounts for engineers, electricians and other trade customers',
            banners: 'Home page banner slideshow',
            delivery: 'Delivery charges and location rules',
            settings: 'Shop details, orders and notifications',
          } as Record<string, string>
        )[tab];
  return (
    <ImageUploadProvider token={token}>
    <AdminOrderAlerts token={token} onCount={setLiveOrderCount} onOrders={() => { setTab('orders'); void load(token, 'orders'); }}
      onArrival={() => { if (['dashboard', 'orders', 'payments'].includes(tab)) void load(token, tab); }}>
    <AdminShell
      shop={catalog.shop} tab={tab} subtitle={subtitle} pendingOrders={pendingOrders}
      onNavigate={setTab} onLogout={() => { setToken(''); setData(null); setLiveOrderCount(null); }}
    >
          <AdminOrderAlertStatus />
          {tab === 'paint-shades' && <PaintShadeManager token={token} onChanged={refresh} />}
          {tab === 'wire-colors' && <WireColorManager token={token} gstInclusive={catalog.shop.gstInclusive} onChanged={refresh} />}
          {error && <p className="admin-error">{error}</p>}
          {busy && !data && (
            <div className="admin-loading">Loading store data…</div>
          )}
          {tab === 'dashboard' &&
            data &&
            !Array.isArray(data) &&
            'dashboard' in data && (
              <Overview data={data as OverviewData} onNavigate={setTab} />
            )}
          {tab === 'orders' && Array.isArray(data) && (
            <OrdersTable
              orders={data as Order[]}
              onArchive={archiveOrders}
              onVerify={verifyPayment}
              onStatus={changeStatus}
            />
          )}
          {tab === 'payments' && Array.isArray(data) && (
            <PaymentsPanel orders={data as Order[]} onVerify={verifyPayment} />
          )}
          {tab === 'products' && Array.isArray(data) && (
            <ProductsPanel
              products={products}
              query={query}
              setQuery={setQuery}
              categories={adminCategories}
              gstInclusive={catalog.shop.gstInclusive}
              onMutate={mutate}
            />
          )}
          {tab === 'categories' && Array.isArray(data) && (
            <CategoryManager
              categories={data as Category[]}
              products={catalog.products}
              onMutate={mutate}
            />
          )}
          {tab === 'stock' && Array.isArray(data) && (
            <StockManager
              products={data as Product[]}
              categories={adminCategories}
              onStock={saveStock}
              onMutate={mutate}
            />
          )}
          {tab === 'banners' && Array.isArray(data) && (
            <BannerCms
              banners={data as Banner[]}
              categories={adminCategories}
              shop={catalog.shop}
              busy={busy}
              onSave={saveBanner}
              onDelete={deleteBanner}
              onSaveShop={saveShop}
            />
          )}
          {tab === 'customers' && Array.isArray(data) && (
            <CustomersPanel customers={data as CustomerSummary[]} />
          )}
          {tab === 'customer-categories' && Array.isArray(data) && (
            <DiscountManager
              categories={data as unknown as Catalog['customerCategories']}
              onMutate={mutate}
            />
          )}
          {tab === 'delivery' &&
            data &&
            !Array.isArray(data) &&
            'shop' in data && (
              <DeliveryManager
                config={data as Configuration}
                busy={busy}
                onSaveShop={saveShop}
                onMutate={mutate}
              />
            )}
          {tab === 'settings' &&
            data &&
            !Array.isArray(data) &&
            'shop' in data && (
              <>
              <AdminPasswordSettings token={token} username={credentials.username} onChanged={() => {
                setToken(''); setData(null); setLiveOrderCount(null); setError('');
                setCredentials((current) => ({ ...current, password: '' }));
                setLoginNotice('Password changed successfully. All admin sessions have been signed out. Sign in with your new password.');
              }} />
              <SettingsPanel
                config={data as Configuration}
                busy={busy}
                onSave={saveShop}
              />
              </>
            )}
    </AdminShell>
    </AdminOrderAlerts>
    </ImageUploadProvider>
  );
}

function Overview({
  data,
  onNavigate,
}: {
  data: OverviewData;
  onNavigate: (tab: AdminTab) => void;
}) {
  const { dashboard, orders, products, categories } = data;
  const today = new Date().toDateString();
  const todayOrders = orders.filter(
    (order) => new Date(order.createdAt).toDateString() === today,
  );
  const paid = orders.filter((order) => order.payment.status === 'PAID');
  const todayPaid = paid.filter(
    (order) => new Date(order.createdAt).toDateString() === today,
  );
  const pending = orders.filter(
    (order) =>
      ['UNPAID', 'PENDING_VERIFICATION'].includes(order.payment.status) &&
      order.status !== 'Cancelled',
  );
  const low = products.filter(
    (product) =>
      product.enabled &&
      !product.manualOutOfStock &&
      product.stock > 0 &&
      product.stock <= 5,
  );
  const out = products.filter(
    (product) =>
      product.enabled && (product.manualOutOfStock || product.stock <= 0),
  );
  const cards = [
    [
      'Total Orders',
      String(orders.length),
      `${orders.filter((order) => !['Delivered', 'Cancelled'].includes(order.status)).length} to process`,
      'orders',
    ],
    [
      "Today's Orders",
      String(todayOrders.length),
      `${todayOrders.reduce((total, order) => total + order.items.reduce((count, item) => count + item.quantity, 0), 0)} items ordered`,
      'orders',
    ],
    [
      "Today's Payments",
      money(todayPaid.reduce((total, order) => total + order.total, 0)),
      'Verified only',
      'payments',
    ],
    [
      'Pending Payments',
      money(pending.reduce((total, order) => total + order.total, 0)),
      pending.length ? `${pending.length} to verify` : 'None waiting',
      'payments',
    ],
    ['Low Stock', String(low.length), '5 or fewer left', 'stock'],
    ['Out of Stock', String(out.length), 'Not purchasable', 'stock'],
  ] as const;
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
  const values = days.map((day) =>
    paid
      .filter(
        (order) =>
          new Date(order.createdAt).toDateString() === day.toDateString(),
      )
      .reduce((total, order) => total + order.total, 0),
  );
  const maximum = Math.max(...values, 1);
  const watch = [...out, ...low].slice(0, 5);
  return (
    <>
      <section className="classic-kpis">
        {cards.map(([label, value, note, destination], index) => (
          <button key={label} onClick={() => onNavigate(destination)}>
            <span>
              <b>{label}</b>
              <i>{['▤', '▣', '↗', '▰', '▱', '△'][index]}</i>
            </span>
            <strong>{value}</strong>
            <small className={index > 3 ? 'warn' : index === 2 ? 'good' : ''}>
              {note}
            </small>
          </button>
        ))}
      </section>
      <section className="classic-pills">
        <span>
          ↗ Total revenue <b>{money(dashboard.revenue)}</b>
        </span>
        <span>
          ✓ Paid orders <b>{paid.length}</b>
        </span>
        <span>
          ◇ Products <b>{products.length}</b>
        </span>
        <span>
          ◇ Categories <b>{categories.length}</b>
        </span>
        <span>
          ▰ Delivered{' '}
          <b>{orders.filter((order) => order.status === 'Delivered').length}</b>
        </span>
      </section>
      <section className="classic-dashboard-grid">
        <div className="classic-main-column">
          <article className="admin-panel classic-chart">
            <div className="admin-panel-head">
              <div>
                <h2>Payments · last 7 days</h2>
                <p>Verified payments only</p>
              </div>
              <b>{money(values.reduce((total, value) => total + value, 0))}</b>
            </div>
            <div className="payment-bars">
              {values.map((value, index) => (
                <div key={days[index].toISOString()}>
                  <span>
                    {value
                      ? value >= 1000
                        ? `₹${(value / 1000).toFixed(1)}k`
                        : `₹${value}`
                      : ''}
                  </span>
                  <i
                    style={{
                      height: `${Math.max(3, (value / maximum) * 100)}%`,
                    }}
                  />
                  <small>
                    {index === 6
                      ? 'Today'
                      : days[index].toLocaleDateString('en-IN', {
                          weekday: 'short',
                        })}
                  </small>
                </div>
              ))}
            </div>
          </article>
          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <h2>Latest orders</h2>
                <p>Most recent customer activity</p>
              </div>
              <button onClick={() => onNavigate('orders')}>View all</button>
            </div>
            {orders.length ? (
              <div className="classic-latest">
                {orders.slice(0, 5).map((order) => (
                  <div key={order.id}>
                    <span>
                      <b>{order.id}</b>
                      <small>
                        {order.customer.name} · {order.customer.city}
                      </small>
                    </span>
                    <span>
                      <b>{money(order.total)}</b>
                      <small>{order.status}</small>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="No orders yet"
                text="New orders appear here instantly."
              />
            )}
          </article>
        </div>
        <div className="classic-side-column">
          <article className="admin-panel">
            <div className="admin-panel-head">
              <div>
                <h2>Stock watch</h2>
                <p>Products needing attention</p>
              </div>
              <button onClick={() => onNavigate('stock')}>Open stock</button>
            </div>
            {watch.length ? (
              <div className="stock-watch">
                {watch.map((product) => {
                  const stock = product.manualOutOfStock ? 0 : product.stock;
                  return (
                    <div key={product.id}>
                      <span>
                        <b>{product.name}</b>
                        <em>
                          {product.manualOutOfStock
                            ? 'Manual'
                            : `${stock} left`}
                        </em>
                      </span>
                      <i>
                        <b
                          style={{
                            width: `${Math.min(100, (stock / 40) * 100)}%`,
                          }}
                        />
                      </i>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="classic-healthy">All products are well stocked.</p>
            )}
          </article>
          <article className="classic-tip">
            ⓘ Orders become ready for fulfilment after their payments are
            verified.
          </article>
        </div>
      </section>
    </>
  );
}

export function OrdersTable({
  orders,
  onVerify,
  onStatus,
  onArchive,
}: {
  orders: Order[];
  onVerify: (order: Order) => void;
  onStatus: (order: Order, status: string) => void;
  onArchive?: (orderIds: string[], archived: boolean) => Promise<void>;
}) {
  const statuses = [
    'Pending Payment',
    'Pending Verification',
    'Order Placed',
    'Payment Confirmed',
    'Confirmed',
    'Processing',
    'Packed',
    'Shipped',
    'Out for Delivery',
    'Delivered',
    'Cancelled',
  ];
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [archiveNotice, setArchiveNotice] = useState('');
  const activeOrders = orders.filter((order) => !order.adminArchivedAt);
  const archived = filter === 'Archived';
  useEffect(() => { setSelected([]); }, [filter, query]);
  const today = new Date().toDateString();
  const filters = [
    ['All', activeOrders.length],
    [
      'Today',
      activeOrders.filter(
        (order) => new Date(order.createdAt).toDateString() === today,
      ).length,
    ],
    [
      'Open',
      activeOrders.filter(
        (order) => !['Delivered', 'Cancelled'].includes(order.status),
      ).length,
    ],
    ...statuses
      .slice(0, 7)
      .map((status) => [
        status,
        activeOrders.filter((order) => order.status === status).length,
      ]),
    ['Archived', orders.length - activeOrders.length],
  ] as Array<[string, number]>;
  const visible = orders.filter((order) => {
    if (Boolean(order.adminArchivedAt) !== archived) return false;
    const matchesFilter =
      filter === 'All' || archived ||
      (filter === 'Today' &&
        new Date(order.createdAt).toDateString() === today) ||
      (filter === 'Open' &&
        !['Delivered', 'Cancelled'].includes(order.status)) ||
      order.status === filter;
    return (
      matchesFilter &&
      `${order.id} ${order.customer.name} ${order.customer.phone} ${order.customer.city} ${order.items.map((item) => `${item.name} ${item.shade || ''} ${item.customShadeCode || ''}`).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  const selectedIds = visible.filter((order) => selected.includes(order.id)).map((order) => order.id);
  const confirmArchive = async () => {
    if (!onArchive || !selectedIds.length || saving) return;
    setSaving(true); setArchiveError('');
    try {
      await onArchive(selectedIds, !archived);
      setArchiveNotice(`${selectedIds.length} order${selectedIds.length === 1 ? '' : 's'} ${archived ? 'restored to history' : 'moved to Archived'}.`);
      setSelected([]); setConfirming(false);
    } catch (reason) {
      setArchiveError(reason instanceof Error ? reason.message : 'Unable to update order history. Please try again.');
    } finally { setSaving(false); }
  };
  return (
    <div className="admin-page-stack">
      <label className="admin-page-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search order ID, customer, product or shade code"
        />
      </label>
      <div className="admin-filter-row">
        {filters.map(([label, count]) => (
          <button
            className={filter === label ? 'active' : ''}
            key={label}
            onClick={() => setFilter(label)}
          >
            {label} <small>{count}</small>
          </button>
        ))}
      </div>
      {onArchive && <div className="order-history-actions">
        <p>{archived ? 'Archived orders are kept for reference and can be restored.' : 'Select only the orders you want to remove from history. Pending payments must be resolved first.'}</p>
        <button type="button" disabled={!selectedIds.length || saving} onClick={() => { setArchiveError(''); setConfirming(true); }}>
          {archived ? 'Restore selected' : 'Remove selected from history'} ({selectedIds.length})
        </button>
      </div>}
      {archiveNotice && <p role="status">{archiveNotice}</p>}
      {confirming && <AdminModal labelledBy="order-history-title" busy={saving} onClose={() => setConfirming(false)}>
        <div className="order-history-confirm">
          <h2 id="order-history-title">{archived ? 'Restore selected orders?' : 'Remove selected orders from history?'}</h2>
          <p>Only these {selectedIds.length} orders will be {archived ? 'restored' : 'moved to Archived'}:</p>
          <ul>{selectedIds.map((id) => <li key={id}>{id}</li>)}</ul>
          <p>Stock, payments and customer receipts will stay unchanged. This does not cancel an order. {archived ? '' : 'You can restore these orders from the Archived tab.'}</p>
          {archiveError && <p role="alert">{archiveError}</p>}
          <div className="order-history-buttons">
            <button type="button" disabled={saving} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" disabled={saving || !selectedIds.length} onClick={() => void confirmArchive()}>{saving ? 'Saving…' : archived ? 'Restore orders' : 'Move to Archived'}</button>
          </div>
        </div>
      </AdminModal>}
      <section className="admin-panel target-table">
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Products</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Delivery</th>
                <th>Placed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((order) => (
                <tr key={order.id}>
                  <td>
                    <b className="admin-mono">{order.id}</b>
                    {onArchive && <label className="order-history-select">
                      <input type="checkbox" aria-label={`Select ${order.id}`} checked={selected.includes(order.id)}
                        disabled={saving || (!archived && ['UNPAID', 'PENDING_VERIFICATION'].includes(order.payment.status))}
                        onChange={(event) => setSelected((current) => event.target.checked ? [...current, order.id] : current.filter((id) => id !== order.id))} />
                      Select
                    </label>}
                  </td>
                  <td>
                    <b>{order.customer.name}</b>
                    <small>
                      {order.customer.phone} · {order.customer.city}
                    </small>
                  </td>
                  <td className="order-products">
                    {order.items.map((item, index) => <div key={index}>
                      <b>{item.name} × {item.quantity}</b>
                      {item.shade && <small>Color: {item.shade}</small>}
                      {item.customShadeCode && <small className="custom-shade-code"><strong>Custom shade code: {item.customShadeCode}</strong></small>}
                    </div>)}
                  </td>
                  <td>
                    <strong>{money(order.total)}</strong>
                    <small>
                      {order.delivery
                        ? `${money(order.delivery)} delivery`
                        : 'Free delivery'}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${order.payment.status.toLowerCase()}`}
                    >
                      {paymentStatusLabel(order.payment.status)}
                    </span>
                    {!archived && order.payment.status === 'PENDING_VERIFICATION' && (
                      <button
                        className="mini-verify"
                        onClick={() => void onVerify(order)}
                      >
                        Verify
                      </button>
                    )}
                  </td>
                  <td>{order.shipment?.type || '—'}</td>
                  <td>
                    {new Date(order.createdAt).toLocaleDateString('en-IN')}
                    <small>
                      {new Date(order.createdAt).toLocaleTimeString('en-IN', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </small>
                  </td>
                  <td>
                    <select
                      className="status-select"
                      disabled={archived || saving}
                      value={order.status}
                      onChange={(event) =>
                        void onStatus(order, event.target.value)
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status} disabled={status.startsWith('Pending ') || (order.payment.status !== 'PAID' && status !== 'Cancelled')}>{status}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <Empty
            title="No matching orders"
            text={archived ? 'Orders removed from history will appear here.' : 'New customer orders will appear here automatically.'}
          />
        )}
      </section>
    </div>
  );
}

function PaymentsTable({
  orders,
  onVerify,
}: {
  orders: Order[];
  onVerify: (order: Order) => void;
}) {
  const paid = orders.filter((order) => order.payment.status === 'PAID');
  const pending = orders.filter((order) =>
    ['UNPAID', 'PENDING_VERIFICATION'].includes(order.payment.status),
  );
  const failed = orders.filter((order) =>
    ['FAILED', 'CANCELLED'].includes(order.payment.status),
  );
  return (
    <>
      <section className="classic-payment-kpis">
        <article>
          <span>Today's Payments</span>
          <b>
            {money(
              paid
                .filter(
                  (order) =>
                    new Date(order.createdAt).toDateString() ===
                    new Date().toDateString(),
                )
                .reduce((sum, order) => sum + order.total, 0),
            )}
          </b>
          <small>Verified today</small>
        </article>
        <article>
          <span>Total Paid Orders</span>
          <b>{paid.length}</b>
          <small>Verified payments</small>
        </article>
        <article>
          <span>Pending Payments</span>
          <b>{money(pending.reduce((sum, order) => sum + order.total, 0))}</b>
          <small>{pending.length} to verify</small>
        </article>
        <article>
          <span>Failed Payments</span>
          <b>{failed.length}</b>
          <small>Failed or expired</small>
        </article>
      </section>
      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Payment records</h2>
            <p>UPI references and verification status</p>
          </div>
        </div>
        {orders.length ? (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>UTR / Reference</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <b>{order.id}</b>
                      <small>
                        {new Date(order.createdAt).toLocaleDateString('en-IN')}
                      </small>
                    </td>
                    <td>
                      <b>{order.customer.name}</b>
                      <small>{order.customer.phone}</small>
                    </td>
                    <td>
                      <strong>{money(order.total)}</strong>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${order.payment.status.toLowerCase()}`}
                      >
                        {paymentStatusLabel(order.payment.status)}
                      </span>
                    </td>
                    <td>{order.payment.method}</td>
                    <td>{order.payment.reference || '—'}</td>
                    <td>
                      {order.payment.status === 'PENDING_VERIFICATION' ? (
                        <button
                          className="admin-action"
                          onClick={() => onVerify(order)}
                        >
                          Verify
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No payments yet"
            text="Payment records appear after checkout."
          />
        )}
      </section>
    </>
  );
}

function ProductsTable({
  products,
  query,
  setQuery,
  categories,
  onStock,
}: {
  products: Product[];
  query: string;
  setQuery: (value: string) => void;
  categories: Catalog['categories'];
  onStock: (
    product: Product,
    quantity: number,
    variantId?: string,
  ) => Promise<void>;
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <h2>Product inventory</h2>
          <p>Manage availability and stock levels</p>
        </div>
        <input
          className="admin-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search product or HSN"
        />
      </div>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Availability</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  <b>{product.name}</b>
                  <small>HSN {product.hsn}</small>
                </td>
                <td>
                  {categories.find(
                    (category) => category.id === product.categoryId,
                  )?.name || product.categoryId}
                </td>
                <td>
                  <strong>{money(product.price)}</strong>
                </td>
                <td>
                  <input
                    className="admin-stock"
                    type="number"
                    min="0"
                    defaultValue={product.stock}
                    onBlur={(event) =>
                      Number(event.target.value) !== product.stock &&
                      void onStock(product, Number(event.target.value))
                    }
                  />
                </td>
                <td>
                  <span
                    className={`admin-badge ${product.stock > 5 && !product.manualOutOfStock ? 'paid' : 'pending'}`}
                  >
                    {product.manualOutOfStock
                      ? 'Manual OOS'
                      : product.stock
                        ? 'Active'
                        : 'Out of stock'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CategoriesPanel({
  categories,
  products,
}: {
  categories: Category[];
  products: Product[];
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <h2>Product categories</h2>
          <p>Storefront navigation and product grouping</p>
        </div>
      </div>
      <div className="category-admin-grid">
        {categories.map((category) => (
          <article key={category.id}>
            <span>{category.icon}</span>
            <div>
              <b>{category.name}</b>
              <small>
                {
                  products.filter(
                    (product) => product.categoryId === category.id,
                  ).length
                }{' '}
                products
              </small>
            </div>
            <em>{category.enabled ? 'Active' : 'Disabled'}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function CustomersTable({ customers }: { customers: CustomerSummary[] }) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <h2>Customers</h2>
          <p>{customers.length} unique customer records</p>
        </div>
      </div>
      {customers.length ? (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Location</th>
                <th>Orders</th>
                <th>Paid value</th>
                <th>Last order</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((item) => (
                <tr key={item.customer.phone}>
                  <td>
                    <b>{item.customer.name}</b>
                    <small>{item.customer.phone}</small>
                  </td>
                  <td>{item.customer.city}</td>
                  <td>{item.orders}</td>
                  <td>
                    <strong>{money(item.spent)}</strong>
                  </td>
                  <td>
                    {new Date(item.lastOrderAt).toLocaleDateString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No customers yet"
          text="Customer profiles are created from completed checkouts."
        />
      )}
    </section>
  );
}

function CustomerCategoriesPanel({
  categories,
}: {
  categories: Catalog['customerCategories'];
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <h2>Customer Categories & Discounts</h2>
          <p>Pricing groups returned by the API</p>
        </div>
      </div>
      <div className="admin-tier-grid">
        {categories.map((category) => (
          <article key={category.id}>
            <span>{category.name}</span>
            <b>{category.discountPercent}%</b>
            <small>Minimum order {money(category.minimum)}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

type AdminMutate = (
  path: string,
  init: RequestInit,
  tab?: AdminTab,
) => Promise<{ ok: true } | { ok: false; error: string }>;

function Toggle({
  checked,
  danger = false,
  label,
  onChange,
}: {
  checked: boolean;
  danger?: boolean;
  label?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      className={`admin-toggle ${checked ? 'on' : ''} ${danger ? 'danger' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  );
}

function PaymentsPanel({
  orders,
  onVerify,
}: {
  orders: Order[];
  onVerify: (order: Order) => void;
}) {
  const paid = orders.filter((order) => order.payment.status === 'PAID');
  const pending = orders.filter((order) =>
    ['UNPAID', 'PENDING_VERIFICATION'].includes(order.payment.status),
  );
  const failed = orders.filter((order) =>
    ['FAILED', 'CANCELLED'].includes(order.payment.status),
  );
  const refunded = orders.filter(
    (order) => order.payment.status === 'REFUNDED',
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const visible = orders.filter(
    (order) =>
      (filter === 'All' || (filter === 'Pending' ? ['UNPAID', 'PENDING_VERIFICATION'].includes(order.payment.status) : paymentStatusLabel(order.payment.status) === filter)) &&
      `${order.id} ${order.customer.name} ${order.payment.reference || ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const cards = [
    [
      "Today's Payments",
      money(
        paid
          .filter(
            (order) =>
              new Date(order.createdAt).toDateString() ===
              new Date().toDateString(),
          )
          .reduce((sum, order) => sum + order.total, 0),
      ),
      'Verified today',
    ],
    ['Total Paid Orders', String(paid.length), 'Verified payments'],
    [
      'Pending Payments',
      money(pending.reduce((sum, order) => sum + order.total, 0)),
      `${pending.length} to verify`,
    ],
    [
      'Failed Payments',
      money(failed.reduce((sum, order) => sum + order.total, 0)),
      `${failed.length} failed or expired`,
    ],
    [
      'Total Revenue',
      money(paid.reduce((sum, order) => sum + order.total, 0)),
      'Verified only · excludes refunds',
    ],
    [
      'Refunded',
      money(refunded.reduce((sum, order) => sum + order.total, 0)),
      `${refunded.length} refunds`,
    ],
  ];
  return (
    <div className="admin-page-stack">
      <section className="classic-payment-kpis payment-six">
        {cards.map(([label, value, note]) => (
          <article key={label}>
            <span>{label}</span>
            <b>{value}</b>
            <small>{note}</small>
          </article>
        ))}
      </section>
      <div className="admin-filter-row">
        <button className="active">All time</button>
        <button>Today</button>
        <button>Yesterday</button>
        <button>This Week</button>
        <button>This Month</button>
        <button>Custom</button>
      </div>
      <div className="payment-filter-line">
        <div className="admin-filter-row">
          {['All', 'Paid', 'Pending', 'Failed', 'Refunded'].map((label) => (
            <button
              className={filter === label ? 'active' : ''}
              key={label}
              onClick={() => setFilter(label)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="admin-page-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Order ID, customer, UTR or transaction ID"
          />
        </label>
      </div>
      <section className="admin-panel target-table">
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Order amount</th>
                <th>Payment status</th>
                <th>Method</th>
                <th>Transaction ID</th>
                <th>UTR / Ref</th>
                <th>Payment date</th>
                <th>Time</th>
                <th>Delivery</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((order) => (
                <tr key={order.id}>
                  <td>
                    <b className="admin-mono">{order.id}</b>
                  </td>
                  <td>
                    <b>{order.customer.name}</b>
                    <small>{order.customer.phone}</small>
                  </td>
                  <td>
                    <strong>{money(order.total)}</strong>
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${order.payment.status.toLowerCase()}`}
                    >
                      {paymentStatusLabel(order.payment.status)}
                    </span>
                    {order.payment.status === 'PENDING_VERIFICATION' && (
                      <button
                        className="mini-verify"
                        onClick={() => onVerify(order)}
                      >
                        Verify
                      </button>
                    )}
                  </td>
                  <td>{order.payment.method}</td>
                  <td className="admin-mono">—</td>
                  <td className="admin-mono">
                    {order.payment.reference || '—'}
                  </td>
                  <td>—</td>
                  <td>—</td>
                  <td>
                    <span className="admin-badge confirmed">
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ProductsPanel({
  products,
  query,
  setQuery,
  categories,
  gstInclusive,
  onMutate,
}: {
  products: Product[];
  query: string;
  setQuery: (value: string) => void;
  categories: Catalog['categories'];
  gstInclusive: boolean;
  onMutate: AdminMutate;
}) {
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Product | null>(null);
  const [editDraft, setEditDraft] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const visible = products.filter(
    (product) =>
      (category === 'all' || product.categoryId === category) &&
      (status === 'all' ||
        (status === 'enabled' ? product.enabled : !product.enabled)),
  );
  const addProduct = () => {
    setEditing(null);
    setFormError('');
    setEditDraft({
      id: '',
      name: '',
      categoryId: category !== 'all' ? category : categories[0]?.id || '',
      price: 0,
      stock: 0,
      hsn: '',
      short: '',
      description: '',
      accent: '#315bea',
      enabled: true,
    });
  };
  const openEditor = (product: Product) => {
    setEditing(product);
    setFormError('');
    setEditDraft({ ...product, stock: product.variants?.length ? product.variants.reduce((sum, variant) => sum + variant.stock, 0) : product.stock });
  };
  const editProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (!editDraft || saving) return;
    if (!editDraft.name.trim() || !editDraft.categoryId) {
      setFormError('Enter a product name and choose a category.');
      return;
    }
    const images = productImageSlots(editDraft);
    if (!images[0]) {
      setFormError('Upload the main product image before saving.');
      return;
    }
    setSaving(true);
    setFormError('');
    const result = await onMutate(
      editing ? `/products/${editing.id}` : '/products',
      {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: editDraft.name.trim(),
          categoryId: editDraft.categoryId,
          price: Number(editDraft.price),
          originalPrice: editDraft.originalPrice
            ? Number(editDraft.originalPrice)
            : 0,
          hsn: editDraft.hsn,
          stock: Number(editDraft.stock),
          short: editDraft.short,
          description: editDraft.description,
          colorName: editDraft.colorName?.trim() ?? '',
          specifications: editDraft.specifications ?? [],
          variants: editDraft.variants ?? [],
          customShadeEnabled: editDraft.customShadeEnabled ?? editDraft.categoryId === 'paints',
          imageUrl: images[0],
          imageUrls: images,
          enabled: editDraft.enabled,
          manualOutOfStock: Boolean(editDraft.manualOutOfStock),
        }),
      },
      'products',
    );
    setSaving(false);
    if (result.ok) {
      setEditing(null);
      setEditDraft(null);
      setQuery('');
      setCategory('all');
      setStatus('all');
    } else setFormError(result.error);
  };
  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete ${product.name}?`)) return;
    await onMutate(`/products/${product.id}`, { method: 'DELETE' }, 'products');
  };
  return (
    <div className="admin-page-stack">
      <div className="admin-product-tools">
        <label className="admin-page-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or HSN"
          />
        </label>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">All categories</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">Any status</option>
          <option value="enabled">Visible</option>
          <option value="disabled">Hidden</option>
        </select>
        <button className="admin-primary" onClick={() => void addProduct()}>
          ＋ Add Product
        </button>
      </div>
      <section className="admin-panel target-table product-admin-table">
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>HSN</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Visible</th>
                <th>Out of stock</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => {
                const stock =
                  product.variants?.length ? product.variants.reduce(
                    (total, item) => total + item.stock,
                    0,
                  ) : product.stock;
                return (
                  <tr key={product.id}>
                    <td data-label="Product">
                      <div className="admin-product-cell">
                        <img src={assetUrl(product.imageUrl)} alt="" />
                        <b>{product.name}</b>
                      </div>
                    </td>
                    <td data-label="Category">
                      {categories.find((item) => item.id === product.categoryId)
                        ?.name || product.categoryId}
                    </td>
                    <td data-label="Price">
                      <strong>
                        {product.variants?.length
                          ? `${money(Math.min(...product.variants.map((item) => item.price)))} – ${money(Math.max(...product.variants.map((item) => item.price)))}`
                          : money(product.price)}
                      </strong>
                      {Boolean(product.originalPrice) && (
                        <small>
                          <del>{money(product.originalPrice!)}</del> ·{' '}
                          {Math.round(
                            (1 - product.price / product.originalPrice!) * 100,
                          )}
                          % off
                        </small>
                      )}
                    </td>
                    <td data-label="HSN">{product.hsn || '—'}</td>
                    <td data-label="Stock">
                      <b>
                        {stock} in stock
                        {product.variants?.length
                          ? ` · ${product.variants.length} shades`
                          : ''}
                      </b>
                      <i className="stock-meter">
                        <i
                          style={{
                            width: `${Math.min(100, (stock / 40) * 100)}%`,
                          }}
                        />
                      </i>
                    </td>
                    <td data-label="Status">
                      <span
                        className={`admin-badge ${stock < 1 || product.manualOutOfStock ? 'failed' : stock <= 5 ? 'pending' : 'paid'}`}
                      >
                        {stock < 1 || product.manualOutOfStock
                          ? 'Out of Stock'
                          : stock <= 5
                            ? 'Low Stock'
                            : 'In Stock'}
                      </span>
                    </td>
                    <td data-label="Visible">
                      <Toggle
                        checked={product.enabled}
                        onChange={(checked) =>
                          void onMutate(
                            `/products/${product.id}`,
                            {
                              method: 'PATCH',
                              body: JSON.stringify({ enabled: checked }),
                            },
                            'products',
                          )
                        }
                      />
                    </td>
                    <td data-label="Out of stock">
                      <Toggle
                        danger
                        checked={Boolean(product.manualOutOfStock)}
                        onChange={(checked) =>
                          void onMutate(
                            `/products/${product.id}`,
                            {
                              method: 'PATCH',
                              body: JSON.stringify({
                                manualOutOfStock: checked,
                              }),
                            },
                            'products',
                          )
                        }
                      />
                    </td>
                    <td className="row-actions" data-label="Actions">
                      <ProductActions name={product.name} onEdit={() => openEditor(product)} onDelete={() => void deleteProduct(product)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {editDraft && <ProductEditor draft={editDraft} setDraft={setEditDraft} busy={saving} error={formError} onClose={() => setEditDraft(null)} onSave={editProduct} categories={categories} gstInclusive={gstInclusive} />}
    </div>
  );
}

function CategoryManager({
  categories,
  products,
  onMutate,
}: {
  categories: Category[];
  products: Product[];
  onMutate: AdminMutate;
}) {
  const [draft, setDraft] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const add = () => {
    setFormError('');
    setDraft({ id: '', name: '', icon: 'box', enabled: true, imageUrl: '' });
  };
  const edit = (category: Category) => {
    setFormError('');
    setDraft({ ...category });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || saving) return;
    if (!draft.name.trim()) {
      setFormError('Enter a category name.');
      return;
    }
    setSaving(true);
    const result = await onMutate(
      draft.id ? `/categories/${draft.id}` : '/categories',
      {
        method: draft.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: draft.name.trim(),
          icon: draft.icon.trim() || '◇',
          imageUrl: draft.imageUrl?.trim() || '',
          enabled: draft.enabled,
        }),
      },
      'categories',
    );
    setSaving(false);
    if (result.ok) setDraft(null);
    else setFormError(result.error);
  };
  return (
    <div className="admin-page-stack">
      <div className="admin-page-intro">
        <p>
          Disabled categories, and their products, are hidden from the shop.
        </p>
        <div className="category-toolbar-actions">
        <button className="admin-primary" onClick={() => void add()}>
          ＋ Add Category
        </button>
        </div>
      </div>
      <section className="admin-panel category-list">
        {categories.map((category) => {
          const productCount = products.filter((product) => product.categoryId === category.id).length;
          return (
          <article key={category.id}>
            <span className="category-icon">{category.imageUrl ? <img src={assetUrl(category.imageUrl)} alt="" /> : <CategoryIcon name={category.icon} />}</span>
            <div>
              <b>{category.name}</b>
              {productCount > 0 && <small>{productCount} {productCount === 1 ? 'product' : 'products'}</small>}
            </div>
            <Toggle
              checked={category.enabled}
              label={`${category.enabled ? 'Disable' : 'Enable'} ${category.name}`}
              onChange={(checked) =>
                void onMutate(
                  `/categories/${category.id}`,
                  {
                    method: 'PATCH',
                    body: JSON.stringify({ enabled: checked }),
                  },
                  'categories',
                )
              }
            />
            <span>{category.enabled ? 'Enabled' : 'Disabled'}</span>
            <button
              aria-label={`Edit ${category.name}`}
              title={`Edit ${category.name}`}
              onClick={() => edit(category)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></svg>
            </button>
            <button
              aria-label={`Delete ${category.name}`}
              title={`Delete ${category.name}`}
              className="category-delete"
              onClick={() =>
                window.confirm(`Delete ${category.name}?`) &&
                void onMutate(
                  `/categories/${category.id}`,
                  { method: 'DELETE' },
                  'categories',
                )
              }
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
            </button>
          </article>
          );
        })}
        {!categories.length && (
          <Empty
            title="No categories yet"
            text="Add your first category to start organising products."
          />
        )}
      </section>
      {draft && <CategoryEditor draft={draft} setDraft={setDraft} busy={saving} error={formError} onClose={() => setDraft(null)} onSave={save} />}
    </div>
  );
}

function StockManager({
  products,
  categories,
  onStock,
  onMutate,
}: {
  products: Product[];
  categories: Catalog['categories'];
  onStock: (
    product: Product,
    quantity: number,
    variantId?: string,
  ) => Promise<void>;
  onMutate: AdminMutate;
}) {
  const [filter, setFilter] = useState('All');
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockProductId, setStockProductId] = useState('');
  const [stockVariantId, setStockVariantId] = useState('');
  const [stockToAdd, setStockToAdd] = useState(1);
  const [savingStock, setSavingStock] = useState(false);
  const stockOf = (product: Product) =>
    product.variants?.length ? product.variants.reduce((total, item) => total + item.stock, 0) : product.stock;
  const units = products.reduce(
    (total, product) => total + stockOf(product),
    0,
  );
  const value = products.reduce(
    (total, product) => total + stockOf(product) * product.price,
    0,
  );
  const counts = {
    All: products.length,
    'In Stock': products.filter(
      (product) => stockOf(product) > 5 && !product.manualOutOfStock,
    ).length,
    'Low Stock': products.filter(
      (product) =>
        stockOf(product) > 0 &&
        stockOf(product) <= 5 &&
        !product.manualOutOfStock,
    ).length,
    'Out of Stock': products.filter(
      (product) => stockOf(product) < 1 || product.manualOutOfStock,
    ).length,
    Disabled: products.filter((product) => !product.enabled).length,
  };
  const visible = products
    .filter(
      (product) =>
        filter === 'All' ||
        (filter === 'In Stock' &&
          stockOf(product) > 5 &&
          !product.manualOutOfStock) ||
        (filter === 'Low Stock' &&
          stockOf(product) > 0 &&
          stockOf(product) <= 5 &&
          !product.manualOutOfStock) ||
        (filter === 'Out of Stock' &&
          (stockOf(product) < 1 || Boolean(product.manualOutOfStock))) ||
        (filter === 'Disabled' && !product.enabled),
    )
    .sort((a, b) => stockOf(a) - stockOf(b));
  const stockProduct =
    products.find((product) => product.id === stockProductId) ?? products[0];
  const stockVariant = stockProduct?.variants?.find(
    (variant) => variant.id === stockVariantId,
  );
  const currentModalStock = stockVariant
    ? stockVariant.stock
    : stockProduct
      ? stockOf(stockProduct)
      : 0;
  const openStockModal = () => {
    const product = products[0];
    setStockProductId(product?.id ?? '');
    setStockVariantId(product?.variants?.[0]?.id ?? '');
    setStockToAdd(1);
    setStockModalOpen(true);
  };
  const selectStockProduct = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    setStockProductId(productId);
    setStockVariantId(product?.variants?.[0]?.id ?? '');
  };
  const addStock = async (event: FormEvent) => {
    event.preventDefault();
    if (!stockProduct || stockToAdd < 1 || !Number.isInteger(stockToAdd))
      return;
    setSavingStock(true);
    try {
      await onStock(
        stockProduct,
        currentModalStock + stockToAdd,
        stockVariant?.id,
      );
      setStockModalOpen(false);
    } finally {
      setSavingStock(false);
    }
  };
  return (
    <div className="admin-page-stack">
      <div className="stock-toolbar">
        <div className="classic-pills stock-summary">
          <span>
            ▱ Units on hand <b>{units}</b>
          </span>
          <span>
            ₹ Stock value <b>{money(value)}</b>
          </span>
          <span>ⓘ Low stock = 5 or fewer</span>
        </div>
        <button
          className="admin-primary"
          disabled={!products.length}
          title={products.length ? 'Add stock' : 'Add a product first'}
          onClick={openStockModal}
        >
          ＋ Add Stock
        </button>
      </div>
      <div className="admin-filter-row">
        {Object.entries(counts).map(([label, count]) => (
          <button
            className={filter === label ? 'active' : ''}
            key={label}
            onClick={() => setFilter(label)}
          >
            {label} <small>{count}</small>
          </button>
        ))}
      </div>
      <section className="admin-panel target-table stock-admin-table">
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Stock level</th>
                <th>Status</th>
                <th>Update stock</th>
                <th>Out of stock</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => {
                const stock = stockOf(product);
                const unavailable = stock < 1 || product.manualOutOfStock;
                return (
                  <tr key={product.id}>
                    <td data-label="Product">
                      <div className="admin-product-cell">
                        <img src={assetUrl(product.imageUrl)} alt="" />
                        <span>
                          <b>{product.name}</b>
                          <small>
                            {
                              categories.find(
                                (item) => item.id === product.categoryId,
                              )?.name
                            }{' '}
                            · {money(product.price)}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td data-label="Stock level">
                      <b>
                        {product.manualOutOfStock
                          ? `Marked out of stock · ${stock} units`
                          : `${stock} in stock`}
                      </b>
                      <i className="stock-meter">
                        <i
                          style={{
                            width: `${Math.min(100, (stock / 40) * 100)}%`,
                          }}
                        />
                      </i>
                    </td>
                    <td data-label="Status">
                      <span
                        className={`admin-badge ${unavailable ? 'failed' : stock <= 5 ? 'pending' : 'paid'}`}
                      >
                        {product.manualOutOfStock
                          ? 'Out of Stock (manual)'
                          : stock < 1
                            ? 'Out of Stock'
                            : stock <= 5
                              ? 'Low Stock'
                              : 'In Stock'}
                      </span>
                    </td>
                    <td data-label="Update stock">
                      <div className="stock-stepper">
                        <button
                          disabled={Boolean(product.variants?.length)}
                          onClick={() =>
                            void onStock(product, Math.max(0, stock - 1))
                          }
                        >
                          −
                        </button>
                        <b>{stock}</b>
                        <button
                          disabled={Boolean(product.variants?.length)}
                          onClick={() => void onStock(product, stock + 1)}
                        >
                          ＋
                        </button>
                      </div>
                    </td>
                    <td data-label="Out of stock">
                      <Toggle
                        danger
                        checked={Boolean(product.manualOutOfStock)}
                        onChange={(checked) =>
                          void onMutate(
                            `/products/${product.id}`,
                            {
                              method: 'PATCH',
                              body: JSON.stringify({
                                manualOutOfStock: checked,
                              }),
                            },
                            'stock',
                          )
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {stockModalOpen && stockProduct && (
        <div className="product-modal-backdrop" role="presentation">
          <form
            className="product-edit-modal stock-add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-stock-title"
            onSubmit={addStock}
          >
            <header>
              <div>
                <span>Inventory update</span>
                <h2 id="add-stock-title">Add stock</h2>
                <p>Select a product and enter the quantity received.</p>
              </div>
              <button
                type="button"
                aria-label="Close add stock"
                onClick={() => setStockModalOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="product-edit-fields">
              <label className="wide">
                <span>Product</span>
                <select
                  value={stockProduct.id}
                  onChange={(event) => selectStockProduct(event.target.value)}
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              {stockProduct.variants?.length ? (
                <label>
                  <span>Variant</span>
                  <select
                    value={stockVariant?.id ?? ''}
                    onChange={(event) => setStockVariantId(event.target.value)}
                  >
                    {stockProduct.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                <span>Quantity to add</span>
                <input
                  required
                  min="1"
                  step="1"
                  type="number"
                  value={stockToAdd}
                  onChange={(event) =>
                    setStockToAdd(Number(event.target.value))
                  }
                />
              </label>
              <div className="stock-update-preview wide">
                <span>Current stock</span>
                <b>{currentModalStock}</b>
                <i aria-hidden="true">→</i>
                <span>Updated stock</span>
                <b>{currentModalStock + Math.max(0, stockToAdd || 0)}</b>
              </div>
            </div>
            <footer>
              <button type="button" onClick={() => setStockModalOpen(false)}>
                Cancel
              </button>
              <button
                className="admin-primary"
                disabled={savingStock || stockToAdd < 1}
                type="submit"
              >
                {savingStock ? 'Saving…' : 'Save stock'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}

function CustomersPanel({ customers }: { customers: CustomerSummary[] }) {
  const [query, setQuery] = useState('');
  const visible = customers.filter((item) =>
    `${item.customer.name} ${item.customer.phone} ${item.customer.city}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="admin-page-stack">
      <div className="classic-pills stock-summary">
        <span>
          ♧ Customers <b>{customers.length}</b>
        </span>
        <span>
          ↻ Repeat customers{' '}
          <b>{customers.filter((item) => item.orders > 1).length}</b>
        </span>
        <span>
          ⌾ In Madurai{' '}
          <b>
            {
              customers.filter((item) => /madurai/i.test(item.customer.city))
                .length
            }
          </b>
        </span>
      </div>
      <label className="admin-page-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, phone or city"
        />
      </label>
      <section className="admin-panel target-table">
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Orders</th>
                <th>Total spent</th>
                <th>Last order</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.customer.phone}>
                  <td>
                    <div className="customer-name">
                      <span>
                        {item.customer.name
                          .split(/\s+/)
                          .map((word) => word[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                      <b>{item.customer.name}</b>
                    </div>
                  </td>
                  <td>{item.customer.phone}</td>
                  <td>{item.customer.city}</td>
                  <td>{item.orders}</td>
                  <td>
                    <strong>{money(item.spent)}</strong>
                  </td>
                  <td>
                    <b>
                      {new Date(item.lastOrderAt).toLocaleDateString('en-IN')}
                    </b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DiscountManager({
  categories,
  onMutate,
}: {
  categories: Catalog['customerCategories'];
  onMutate: AdminMutate;
}) {
  const add = async () => {
    const name = window.prompt('Customer category name');
    if (!name) return;
    const discountPercent = Number(window.prompt('Discount percentage', '0'));
    const minimum = Number(window.prompt('Minimum order', '0'));
    await onMutate(
      '/customer-categories',
      {
        method: 'POST',
        body: JSON.stringify({ name, discountPercent, minimum }),
      },
      'customer-categories',
    );
  };
  const edit = async (category: Catalog['customerCategories'][number]) => {
    const discountPercent = Number(
      window.prompt('Discount percentage', String(category.discountPercent)),
    );
    const minimum = Number(
      window.prompt('Minimum order', String(category.minimum)),
    );
    await onMutate(
      `/customer-categories/${category.id}`,
      { method: 'PATCH', body: JSON.stringify({ discountPercent, minimum }) },
      'customer-categories',
    );
  };
  return (
    <div className="admin-page-stack">
      <div className="admin-info-action">
        <p>
          ⓘ Customers pick their type at checkout. The discount is added
          automatically when the order subtotal is greater than the minimum order value.
        </p>
        <button className="admin-primary" onClick={() => void add()}>
          ＋ Add Category
        </button>
      </div>
      <section className="admin-panel target-table">
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Discount</th>
                <th>Minimum order</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>
                    <div className="admin-tier-name">
                      <span>{category.id === 'customer' ? '♧' : '%'}</span>
                      <div>
                        <b>{category.name}</b>
                        <small>
                          {category.id === 'customer'
                            ? 'Default · always selected first'
                            : `${category.discountPercent}% off on orders above ${money(category.minimum)}`}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong>{category.discountPercent}%</strong>
                  </td>
                  <td>{money(category.minimum)}</td>
                  <td>
                    {category.id === 'customer' ? (
                      <span className="admin-badge paid">Active</span>
                    ) : (
                      <span className="active-inline">
                        <Toggle checked onChange={() => undefined} /> Active
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="square-action"
                      onClick={() => void edit(category)}
                    >
                      ⌕
                    </button>
                    {category.id !== 'customer' && (
                      <button
                        className="square-action"
                        onClick={() =>
                          window.confirm(`Delete ${category.name}?`) &&
                          void onMutate(
                            `/customer-categories/${category.id}`,
                            { method: 'DELETE' },
                            'customer-categories',
                          )
                        }
                      >
                        ♜
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const emptyBanner: Partial<Banner> = {
  label: '',
  title: '',
  description: '',
  categoryId: '',
  accent: '#315bea',
  imageUrl: '',
  enabled: true,
  duration: 0,
  buttonText: 'Shop now',
  linkType: 'category',
};

function BannerCms({
  banners,
  categories,
  shop,
  busy,
  onSave,
  onDelete,
  onSaveShop,
}: {
  banners: Banner[];
  categories: Catalog['categories'];
  shop: Catalog['shop'];
  busy: boolean;
  onSave: (banner: Partial<Banner>, isNew: boolean) => Promise<boolean>;
  onDelete: (banner: Banner) => void;
  onSaveShop: (shop: Partial<Catalog['shop']>) => Promise<void>;
}) {
  const ordered = [...banners].sort((a, b) => (a.order || 0) - (b.order || 0));
  const [editing, setEditing] = useState<Partial<Banner> | null>(null);
  const [preview, setPreview] = useState<Banner | null>(null);
  const isNew = Boolean(editing && !editing.id);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (await onSave(editing, isNew)) setEditing(null);
  };
  const move = async (index: number, direction: number) => {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const first = ordered[index];
    const second = ordered[target];
    await onSave({ id: first.id, order: second.order || target + 1 }, false);
    await onSave({ id: second.id, order: first.order || index + 1 }, false);
  };
  const active = ordered.filter((banner) => banner.enabled !== false).length;
  const linkLabel = (banner: Banner) =>
    banner.linkType === 'orders'
      ? 'My Orders'
      : banner.linkType === 'url'
        ? banner.linkValue || 'Web address'
        : banner.linkType === 'none'
          ? 'Not clickable'
          : `Category: ${categories.find((category) => category.id === (banner.linkValue || banner.categoryId))?.name || banner.categoryId}`;
  return (
    <div className="banner-cms">
      <section className="admin-panel banner-settings">
        <div className="admin-panel-head">
          <div>
            <h2>Slideshow settings</h2>
            <p>Controls the banner slideshow at the top of the shop.</p>
          </div>
          <button
            onClick={() =>
              setPreview(
                ordered.find((banner) => banner.enabled !== false) || null,
              )
            }
          >
            ◉ Preview slideshow
          </button>
        </div>
        <div className="banner-settings-row">
          <label className="banner-switch">
            <input
              type="checkbox"
              checked={shop.bannerAutoSlide !== false}
              onChange={(event) =>
                void onSaveShop({ bannerAutoSlide: event.target.checked })
              }
            />
            <i />
            <span>
              Auto slide {shop.bannerAutoSlide !== false ? 'ON' : 'OFF'}
            </span>
          </label>
          <label>
            <span>Auto slide duration</span>
            <select
              value={shop.bannerInterval || 2}
              disabled={shop.bannerAutoSlide === false}
              onChange={(event) =>
                void onSaveShop({ bannerInterval: Number(event.target.value) })
              }
            >
              <option value="2">2 seconds</option>
              <option value="3">3 seconds</option>
              <option value="5">5 seconds</option>
              <option value="10">10 seconds</option>
            </select>
          </label>
          <p>
            Each banner can override this. Customers tap a banner to open its
            link, press and hold to pause, and swipe to change banners.
          </p>
        </div>
      </section>
      <section className="admin-panel banner-list">
        <div className="admin-panel-head">
          <div>
            <h2>Banners</h2>
            <p>
              {active} active of {ordered.length} · shown on the website in this
              order
            </p>
          </div>
          <button
            className="admin-primary"
            onClick={() =>
              setEditing({
                ...emptyBanner,
                categoryId: categories[0]?.id || '',
                linkValue: categories[0]?.id || '',
                order: ordered.length + 1,
              })
            }
          >
            ＋ Add Banner
          </button>
        </div>
        {ordered.length ? (
          <div>
            {ordered.map((banner, index) => (
              <article
                className={`banner-row ${banner.enabled === false ? 'disabled' : ''}`}
                key={banner.id}
              >
                <div className="banner-order">
                  <button
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    ↑
                  </button>
                  <b>#{index + 1}</b>
                  <button
                    disabled={index === ordered.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    ↓
                  </button>
                </div>
                <button
                  className="banner-thumb"
                  onClick={() => setPreview(banner)}
                  style={{
                    background: `linear-gradient(120deg,#edf3ff,${banner.accent}24,#fff2d9)`,
                  }}
                >
                  {banner.imageUrl && (
                    <img src={assetUrl(banner.imageUrl)} alt="" />
                  )}
                  <b>{banner.label}</b>
                </button>
                <div className="banner-info">
                  <h3>{banner.title}</h3>
                  {banner.brands?.length ? <p>Brands: {banner.brands.join(', ')}{banner.videoUrl ? ' · video' : ''}</p> : null}
                  <p>{banner.description}</p>
                  <div>
                    <span>
                      → Opens: {linkLabel(banner)}
                      {banner.buttonText
                        ? ` · button “${banner.buttonText}”`
                        : ''}
                    </span>
                    <span>
                      ◷{' '}
                      {banner.duration
                        ? `${banner.duration}s`
                        : `Default (${shop.bannerInterval || 2}s)`}
                    </span>
                    <span>
                      ▧{' '}
                      {banner.imageUrl
                        ? 'Product artwork'
                        : 'Generated artwork'}
                    </span>
                  </div>
                </div>
                <label className="banner-switch">
                  <input
                    type="checkbox"
                    checked={banner.enabled !== false}
                    onChange={(event) =>
                      void onSave(
                        { id: banner.id, enabled: event.target.checked },
                        false,
                      )
                    }
                  />
                  <i />
                  <span>
                    {banner.enabled !== false ? 'Active' : 'Inactive'}
                  </span>
                </label>
                <div className="banner-actions">
                  <button title="Preview" onClick={() => setPreview(banner)}>
                    ◉
                  </button>
                  <button
                    title="Edit"
                    onClick={() => setEditing({ ...banner })}
                  >
                    ⌕
                  </button>
                  <button title="Delete" onClick={() => onDelete(banner)}>
                    ♜
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="No banners yet"
            text="Add a banner to start the storefront slideshow."
          />
        )}
      </section>
      {editing && (
        <div
          className="admin-drawer-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setEditing(null)
          }
        >
          <form className="admin-drawer" onSubmit={submit}>
            <header>
              <div>
                <span>Banner CMS</span>
                <h2>{isNew ? 'Create banner' : 'Edit banner'}</h2>
              </div>
              <button type="button" onClick={() => setEditing(null)}>
                ×
              </button>
            </header>
            <div className="admin-drawer-fields">
              <label>
                <span>Campaign label</span>
                <input
                  required
                  value={editing.label || ''}
                  onChange={(event) =>
                    setEditing({ ...editing, label: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Brands in stock</span>
                <input
                  placeholder="Polycab, Philips, Surya"
                  value={(editing.brands || []).join(', ')}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      brands: event.target.value.split(',').map((brand) => brand.trimStart()),
                    })
                  }
                />
              </label>
              <label>
                <span>Banner style</span>
                <select
                  value={editing.theme || ''}
                  onChange={(event) =>
                    setEditing({ ...editing, theme: event.target.value })
                  }
                >
                  <option value="">Standard</option>
                  <option value="plumbing">Plumbing (blue and teal)</option>
                  <option value="electrical">Electrical (blue and gold)</option>
                  <option value="paints">Paints (orange)</option>
                  <option value="cement">Cement (navy and orange)</option>
                  <option value="hardware">Hardware (navy and orange)</option>
                </select>
              </label>
              <label>
                <span>Banner video (optional)</span>
                <input
                  placeholder="/banners/paints.mp4"
                  value={editing.videoUrl || ''}
                  onChange={(event) =>
                    setEditing({ ...editing, videoUrl: event.target.value })
                  }
                />
              </label>
              <label className="wide">
                <span>Extra images, one URL per line (up to 2)</span>
                <textarea
                  placeholder="/banners/surya.jpeg"
                  value={(editing.gallery || []).join('\n')}
                  onChange={(event) =>
                    setEditing({ ...editing, gallery: event.target.value.split('\n') })
                  }
                />
              </label>
              <label>
                <span>Headline</span>
                <input
                  required
                  value={editing.title || ''}
                  onChange={(event) =>
                    setEditing({ ...editing, title: event.target.value })
                  }
                />
              </label>
              <label className="wide">
                <span>Description</span>
                <textarea
                  required
                  value={editing.description || ''}
                  onChange={(event) =>
                    setEditing({ ...editing, description: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Product category</span>
                <select
                  required
                  value={editing.categoryId || ''}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      categoryId: event.target.value,
                      linkValue:
                        editing.linkType === 'category'
                          ? event.target.value
                          : editing.linkValue,
                    })
                  }
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Banner duration</span>
                <select
                  value={editing.duration || 0}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      duration: Number(event.target.value),
                    })
                  }
                >
                  <option value="0">Use slideshow default</option>
                  <option value="2">2 seconds</option>
                  <option value="3">3 seconds</option>
                  <option value="5">5 seconds</option>
                  <option value="10">10 seconds</option>
                </select>
              </label>
              <label>
                <span>Button text</span>
                <input
                  value={editing.buttonText || ''}
                  onChange={(event) =>
                    setEditing({ ...editing, buttonText: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Link type</span>
                <select
                  value={editing.linkType || 'category'}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      linkType: event.target.value as Banner['linkType'],
                    })
                  }
                >
                  <option value="category">Product category</option>
                  <option value="orders">My Orders</option>
                  <option value="url">Web address</option>
                  <option value="none">Not clickable</option>
                </select>
              </label>
              <label className="wide">
                <span>Link value</span>
                <input
                  value={editing.linkValue || ''}
                  onChange={(event) =>
                    setEditing({ ...editing, linkValue: event.target.value })
                  }
                  placeholder="Category ID or web address"
                />
              </label>
              <label>
                <span>Accent colour</span>
                <div className="admin-colour">
                  <input
                    type="color"
                    value={editing.accent || '#315bea'}
                    onChange={(event) =>
                      setEditing({ ...editing, accent: event.target.value })
                    }
                  />
                  <input
                    value={editing.accent || ''}
                    onChange={(event) =>
                      setEditing({ ...editing, accent: event.target.value })
                    }
                  />
                </div>
              </label>
              <label className="wide">
                <span>Image URL</span>
                <input
                  value={editing.imageUrl || ''}
                  onChange={(event) =>
                    setEditing({ ...editing, imageUrl: event.target.value })
                  }
                  placeholder="Leave empty to use generated artwork"
                />
              </label>
              <ImageUpload label="Upload banner photo" value={editing.imageUrl} onChange={(imageUrl) => setEditing((current) => current ? { ...current, imageUrl } : current)} />
              <label className="admin-check wide">
                <input
                  type="checkbox"
                  checked={editing.cutout === true}
                  onChange={(event) =>
                    setEditing({ ...editing, cutout: event.target.checked })
                  }
                />
                <span>Photo has a transparent background (blend it into the banner without a card)</span>
              </label>
              <label className="admin-check wide">
                <input
                  type="checkbox"
                  checked={editing.enabled !== false}
                  onChange={(event) =>
                    setEditing({ ...editing, enabled: event.target.checked })
                  }
                />
                <span>Show this banner on the storefront</span>
              </label>
            </div>
            <footer>
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="admin-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save banner'}
              </button>
            </footer>
          </form>
        </div>
      )}
      {preview && (
        <div
          className="banner-modal"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setPreview(null)
          }
        >
          <article
            style={{ '--banner-accent': preview.accent } as React.CSSProperties}
          >
            <button onClick={() => setPreview(null)}>×</button>
            <div>
              <span>{preview.label}</span>
              <h2>{preview.title}</h2>
              <p>{preview.description}</p>
              {preview.buttonText && <b>{preview.buttonText} →</b>}
            </div>
            {preview.imageUrl && (
              <img src={assetUrl(preview.imageUrl)} alt="" />
            )}
          </article>
        </div>
      )}
    </div>
  );
}

function LegacySettingsPanel({
  config,
  busy,
  onSave,
}: {
  config: Configuration;
  busy: boolean;
  onSave: (shop: Partial<Catalog['shop']>) => void;
}) {
  const [draft, setDraft] = useState(config.shop);
  useEffect(() => setDraft(config.shop), [config]);
  const field = (key: keyof Catalog['shop'], label: string, type = 'text') => (
    <label>
      <span>{label}</span>
      <input
        type={type}
        value={String(draft[key] ?? '')}
        onChange={(event) =>
          setDraft({
            ...draft,
            [key]:
              type === 'number'
                ? Number(event.target.value)
                : event.target.value,
          })
        }
      />
    </label>
  );
  return (
    <form
      className="admin-settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Storefront content</h2>
            <p>These values appear on the public website.</p>
          </div>
        </div>
        <div className="admin-form-grid">
          {field('name', 'Store name')}
          {field('tagline', 'Tagline')}
          {field('phone', 'Phone')}
          {field('email', 'Email', 'email')}
          {field('address', 'Address')}{' '}
          {field('footerText', 'Footer description')}
          <label className="wide">
            <span>Logo URL</span>
            <input
              value={draft.logoUrl}
              onChange={(event) =>
                setDraft({ ...draft, logoUrl: event.target.value })
              }
            />
            <small>
              Use an API or hosted image URL. Leave the generated API logo to
              avoid embedded frontend assets.
            </small>
          </label>
        </div>
      </section>
      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Commerce settings</h2>
            <p>Server-authoritative pricing values</p>
          </div>
        </div>
        <div className="admin-form-grid">
          {field('minimumOrder', 'Minimum order', 'number')}
          {field('gstRate', 'GST rate (%)', 'number')}
          {field('defaultDeliveryCharge', 'Tamil Nadu delivery', 'number')}
          {field('outsideTamilNaduCharge', 'Outside Tamil Nadu', 'number')}
        </div>
        <div className="admin-tier-grid">
          {config.customerCategories.map((tier) => (
            <article key={tier.id}>
              <span>{tier.name}</span>
              <b>{tier.discountPercent}%</b>
              <small>From {money(tier.minimum)}</small>
            </article>
          ))}
        </div>
      </section>
      <footer>
        <button type="submit" className="admin-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save storefront settings'}
        </button>
      </footer>
    </form>
  );
}

function DeliveryPanel({ config }: { config: Configuration }) {
  return (
    <div className="admin-settings">
      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Default delivery</h2>
            <p>Base charges calculated by the API</p>
          </div>
        </div>
        <dl>
          <div>
            <dt>Madurai</dt>
            <dd>{config.shop.maduraiFree ? 'Free' : 'Configured rate'}</dd>
          </div>
          <div>
            <dt>Tamil Nadu default</dt>
            <dd>{money(config.shop.defaultDeliveryCharge || 0)}</dd>
          </div>
          <div>
            <dt>Outside Tamil Nadu</dt>
            <dd>{money(config.shop.outsideTamilNaduCharge || 0)}</dd>
          </div>
        </dl>
      </section>
      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h2>Location rules</h2>
            <p>District and area overrides</p>
          </div>
        </div>
        <dl>
          {config.deliveryRules.map((rule) => (
            <div key={rule.id}>
              <dt>{rule.match}</dt>
              <dd>{money(rule.charge)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

export function DeliveryManager({
  config,
  busy,
  onSaveShop,
  onMutate,
}: {
  config: Configuration;
  busy: boolean;
  onSaveShop: (shop: Partial<Catalog['shop']>) => Promise<void>;
  onMutate: AdminMutate;
}) {
  const [draft, setDraft] = useState(config.shop);
  const [rules, setRules] = useState(config.deliveryRules);
  useEffect(() => {
    setDraft(config.shop);
    setRules(config.deliveryRules);
  }, [config]);
  const dirty = useMemo(
    () =>
      JSON.stringify({
        maduraiFree: draft.maduraiFree,
        defaultDeliveryCharge: draft.defaultDeliveryCharge,
        outsideTamilNaduCharge: draft.outsideTamilNaduCharge,
        rules,
      }) !==
      JSON.stringify({
        maduraiFree: config.shop.maduraiFree,
        defaultDeliveryCharge: config.shop.defaultDeliveryCharge,
        outsideTamilNaduCharge: config.shop.outsideTamilNaduCharge,
        rules: config.deliveryRules,
      }),
    [config.deliveryRules, config.shop, draft, rules],
  );
  const save = async () => {
    await onSaveShop({
      maduraiFree: draft.maduraiFree,
      defaultDeliveryCharge: draft.defaultDeliveryCharge,
      outsideTamilNaduCharge: draft.outsideTamilNaduCharge,
    });
    await Promise.all(
      rules.map((rule) =>
        onMutate(
          `/delivery-rules/${rule.id}`,
          { method: 'PATCH', body: JSON.stringify(rule) },
          'delivery',
        ),
      ),
    );
  };
  const addRule = async () => {
    const match = window.prompt('Town, district, area or pincode prefix');
    if (!match?.trim()) return;
    const enteredCharge = window.prompt('Delivery charge (required; enter 0 for free delivery)', '0');
    if (enteredCharge === null) return;
    const charge = Number(enteredCharge);
    if (!enteredCharge.trim() || !Number.isFinite(charge) || charge < 0) {
      window.alert('Enter a valid delivery charge of 0 or more.');
      return;
    }
    await onMutate(
      '/delivery-rules',
      { method: 'POST', body: JSON.stringify({ match: match.trim(), charge }) },
      'delivery',
    );
  };
  return (
    <form
      className="delivery-manager"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="required-note"><span className="required-mark" aria-hidden="true">*</span> Required fields. Enter 0 for free delivery.</p>
      <div className="delivery-top-grid">
        <section className="admin-panel settings-card">
          <h2>
            <i>▰</i> Delivery charges
          </h2>
          <div className="delivery-free">
            <span>
              <b>Free delivery in Madurai</b>
              <small>
                When city or district is Madurai, or pincode is 6250xx.
              </small>
            </span>
            <Toggle
              checked={draft.maduraiFree !== false}
              onChange={(checked) =>
                setDraft({ ...draft, maduraiFree: checked })
              }
            />
          </div>
          <div className="settings-fields two">
            <label>
              <span>Other places in Tamil Nadu (₹) <span className="required-mark" aria-hidden="true">*</span></span>
              <input
                type="number"
                required min="0" step="0.01"
                value={draft.defaultDeliveryCharge || 0}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    defaultDeliveryCharge: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              <span>Courier — outside Tamil Nadu (₹) <span className="required-mark" aria-hidden="true">*</span></span>
              <input
                type="number"
                required min="0" step="0.01"
                value={draft.outsideTamilNaduCharge || 0}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    outsideTamilNaduCharge: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
        </section>
        <section className="admin-panel settings-card">
          <h2>
            <i>⌾</i> Location-based rules
          </h2>
          <p>Checked first. Match a town, district or pincode prefix.</p>
          <div className="delivery-rules">
            {rules.map((rule, index) => (
              <div key={rule.id}>
                <label><span>Location / pincode <span className="required-mark" aria-hidden="true">*</span></span>
                <input
                  required pattern=".*\S.*" title="Enter a town, district, area or pincode prefix"
                  value={rule.match}
                  onChange={(event) =>
                    setRules(
                      rules.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, match: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                </label>
                <label><span>Delivery charge (₹) <span className="required-mark" aria-hidden="true">*</span></span>
                <input
                  type="number"
                  required min="0" step="0.01"
                  value={rule.charge}
                  onChange={(event) =>
                    setRules(
                      rules.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, charge: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    window.confirm(`Delete ${rule.match}?`) &&
                    void onMutate(
                      `/delivery-rules/${rule.id}`,
                      { method: 'DELETE' },
                      'delivery',
                    )
                  }
                >
                  ♜
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="outline-button"
            onClick={() => void addRule()}
          >
            ＋ Add rule
          </button>
        </section>
      </div>
      <section className="admin-panel settings-card delivery-preview">
        <h2>
          <i>ⓘ</i> What customers pay now
        </h2>
        <div>
          <p>
            <b>Madurai</b>
            <strong>{draft.maduraiFree ? 'FREE' : money(draft.defaultDeliveryCharge || 0)}</strong>
          </p>
          {rules.map((rule) => (
            <p key={rule.id}>
              <b>{rule.match}</b>
              <strong>{money(rule.charge)}</strong>
            </p>
          ))}
          <p>
            <b>Elsewhere in Tamil Nadu</b>
            <strong>{money(draft.defaultDeliveryCharge || 0)}</strong>
          </p>
          <p>
            <b>Outside Tamil Nadu</b>
            <strong>{money(draft.outsideTamilNaduCharge || 0)}</strong>
          </p>
        </div>
        <small>Based on the current API configuration.</small>
      </section>
      {dirty && (
        <div className="sticky-save">
          <span>Changes apply to the shop immediately after saving.</span>
          <button
            type="button"
            onClick={() => {
              setDraft(config.shop);
              setRules(config.deliveryRules);
            }}
          >
            Discard
          </button>
          <button className="admin-primary" disabled={busy}>
            ✓ Save changes
          </button>
        </div>
      )}
    </form>
  );
}

function SettingsPanel({
  config,
  busy,
  onSave,
}: {
  config: Configuration;
  busy: boolean;
  onSave: (shop: Partial<Catalog['shop']>) => void;
}) {
  const [draft, setDraft] = useState(config.shop);
  const [soundUploading, setSoundUploading] = useState(false);
  useEffect(() => setDraft(config.shop), [config]);
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(config.shop),
    [config.shop, draft],
  );
  const set = (key: keyof Catalog['shop'], value: unknown) =>
    setDraft({ ...draft, [key]: value });
  return (
    <form
      className="settings-manager"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || soundUploading) return;
        onSave(draft);
      }}
    >
      <div className="settings-grid">
        <section className="admin-panel settings-card">
          <h2>
            <i>▣</i> Shop details
          </h2>
          <ImageUpload
            label="Upload shop logo"
            variant="logo"
            value={draft.logoUrl}
            onChange={(logoUrl) => setDraft((current) => ({ ...current, logoUrl }))}
            onReset={() => set('logoUrl', '/api/media/logo.svg')}
          />
          <div className="settings-fields two">
            <label>
              <span>Shop name (trade name)</span>
              <input
                value={draft.name}
                onChange={(event) => set('name', event.target.value)}
              />
            </label>
            <label>
              <span>Legal name (as per GST)</span>
              <input
                value={draft.legalName}
                onChange={(event) => set('legalName', event.target.value)}
              />
            </label>
            <label className="wide">
              <span>Tagline</span>
              <input
                value={draft.tagline}
                onChange={(event) => set('tagline', event.target.value)}
              />
            </label>
            <label className="wide">
              <span>GST number (GSTIN)</span>
              <input
                value={draft.gstin}
                onChange={(event) => set('gstin', event.target.value)}
              />
              <small>Shown in the footer, receipts and order records.</small>
            </label>
            <label>
              <span>Phone</span>
              <input
                value={draft.phone}
                onChange={(event) => set('phone', event.target.value)}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={draft.email}
                onChange={(event) => set('email', event.target.value)}
              />
            </label>
            <label className="wide">
              <span>Address</span>
              <input
                value={draft.address}
                onChange={(event) => set('address', event.target.value)}
              />
            </label>
            <label className="wide">
              <span>Opening hours</span>
              <input value={draft.openingHours || ''} onChange={(event) => set('openingHours', event.target.value)} placeholder="e.g. Monday–Saturday, 9 AM–8 PM" />
            </label>
          </div>
        </section>
        <section className="admin-panel settings-card">
          <h2>
            <i>▤</i> Order settings
          </h2>
          <div className="settings-fields two">
            <label>
              <span>Minimum order value (₹)</span>
              <input
                type="number"
                value={draft.minimumOrder}
                onChange={(event) =>
                  set('minimumOrder', Number(event.target.value))
                }
              />
              <small>Customers can’t check out below this amount.</small>
            </label>
            <label>
              <span>GST on prices</span>
              <select
                value={draft.gstInclusive ? 'included' : 'added'}
                onChange={(event) =>
                  set('gstInclusive', event.target.value === 'included')
                }
              >
                <option value="included">Prices include GST</option>
                <option value="added">Add GST at checkout</option>
              </select>
            </label>
            <label>
              <span>GST rate (%)</span>
              <input
                type="number"
                value={draft.gstRate}
                onChange={(event) => set('gstRate', Number(event.target.value))}
              />
            </label>
          </div>
          <p className="settings-note">
            ▰ Delivery charges have moved to the <b>Delivery</b> page.
          </p>
        </section>
        <section className="admin-panel settings-card">
          <h2>
            <i>▣</i> Payments (UPI)
          </h2>
          <div className="settings-fields two">
            <label className="wide">
              <span>Shop UPI ID</span>
              <input
                value={draft.upiId || ''}
                onChange={(event) => set('upiId', event.target.value)}
              />
              <small>
                Double-check it — money sent to a wrong ID can’t be recovered.
              </small>
            </label>
            <label>
              <span>Name shown to customers</span>
              <input
                value={draft.payeeName || ''}
                onChange={(event) => set('payeeName', event.target.value)}
              />
            </label>
            <label>
              <span>Merchant category code</span>
              <input
                value={draft.merchantCategoryCode || ''}
                onChange={(event) =>
                  set('merchantCategoryCode', event.target.value)
                }
              />
            </label>
            <label>
              <span>Merchant reference</span>
              <input
                value={draft.merchantReference || ''}
                onChange={(event) =>
                  set('merchantReference', event.target.value)
                }
              />
            </label>
            <label>
              <span>SmartHub terminal ID (TID)</span>
              <input
                value={draft.terminalId || ''}
                onChange={(event) => set('terminalId', event.target.value)}
              />
            </label>
          </div>
        </section>
        <OrderSoundSettings value={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} onUploading={setSoundUploading}
          toggle={<Toggle checked={draft.orderSoundEnabled !== false} onChange={(checked) => set('orderSoundEnabled', checked)} />} />
      </div>
      {dirty && (
        <div className="sticky-save">
          <span>Changes apply to the shop immediately after saving.</span>
          <button type="button" disabled={busy || soundUploading} onClick={() => setDraft(config.shop)}>
            Discard
          </button>
          <button className="admin-primary" disabled={busy || soundUploading}>
            ✓ Save changes
          </button>
        </div>
      )}
    </form>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="admin-empty">
      <span>＋</span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}
