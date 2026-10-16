"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { api, ApiError, assetUrl } from "../lib/api";
import { paymentStatusLabel } from '../lib/payment-status';
import type {
  CartLine,
  Catalog,
  Customer,
  Order,
  OrderQuote,
  Product,
  Variant,
} from "../lib/types";
import { AdminPanel } from "./AdminPanel";
import { useWishlist } from './store/useWishlist';
import styles from './store/Store.module.css';
import { MyOrders } from './store/MyOrders';
import { useCustomerOrders } from './store/useCustomerOrders';
import { OrderDetails } from './store/OrderDetails';
import { CancelOrder } from './store/CancelOrder';
import { receiptToken, rememberReceipt } from '../lib/order-receipts';
import { StoreHeader } from './store/StoreHeader';
import { StoreCatalog } from './store/StoreCatalog';
import { StoreFooter } from './store/StoreFooter';
import { ProductDetails } from './store/ProductDetails';
import { CommercePage, CheckoutSection } from './store/CommerceLayout';
import { CheckoutField } from './store/CheckoutField';
import { CustomerTypeSelect } from './store/CustomerTypeSelect';
import { CheckoutTotals } from './store/CheckoutTotals';
import { formatOrderMoney } from '../lib/checkout-pricing';
import { customerLabels, validateCustomer, validatePaymentReference, type CustomerErrors } from '../lib/checkout-validation';
import { cartLineKey, cartPreview, parseSavedCart, resolveCartLines } from '../lib/cart';

type View = "wishlist" | "shop" | "cart" | "checkout" | "payment" | "orders" | "admin";
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
const blankCustomer: Customer = {
  name: "",
  phone: "",
  address: "",
  area: "",
  city: "",
  district: "",
  state: "",
  pincode: "",
};

export function Storefront({ initialView = "shop" }: { initialView?: View }) {
  const customerOrders = useCustomerOrders();
  const wishlist = useWishlist();
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [error, setError] = useState(""),
    [view, setView] = useState<View>(initialView);
  const [cart, setCart] = useState<CartLine[]>([]),
    [category, setCategory] = useState("all"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("featured");
  const [detail, setDetail] = useState<Product | null>(null),
    [lastOrder, setLastOrder] = useState<Order | null>(null);
  useEffect(() => { if (initialView !== 'admin' && new URLSearchParams(window.location.search).get('view') === 'orders') setView('orders'); }, [initialView]);
  useEffect(() => {
    api
      .catalog()
      .then(setCatalog)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (view === 'admin') return;
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void api.catalog().then((next) => {
        if (!controller.signal.aborted) setCatalog((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      }).catch(() => {});
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [view]);
  useEffect(() => {
    try {
      setCart(parseSavedCart(JSON.parse(localStorage.getItem("vks-cart") || "[]")));
    } catch {}
  }, []);
  const saveCart = (next: CartLine[]) => {
    setCart(next);
    try { localStorage.setItem("vks-cart", JSON.stringify(next)); } catch {}
  };
  const add = (p: Product, v?: Variant, customShadeCode?: string) => {
    const key = v?.id;
    const nextLine: CartLine = { productId: p.id, variantId: key, quantity: 1, ...(customShadeCode?.trim() ? { customShadeCode: customShadeCode.trim() } : {}) };
    const found = cart.find((x) => cartLineKey(x) === cartLineKey(nextLine));
    const max = v?.stock ?? p.stock;
    const reserved = cart.filter((x) => x.productId === p.id && x.variantId === key).reduce((sum, x) => sum + x.quantity, 0);
    if (max < 1 || p.manualOutOfStock || reserved >= max) return;
    saveCart(
      found
        ? cart.map((x) =>
            x === found ? { ...x, quantity: Math.min(max, x.quantity + 1) } : x,
          )
        : [...cart, nextLine],
    );
    setDetail(null);
  };
  const { quantity, subtotal: cartSubtotal } = cartPreview(cart, catalog?.products || []);
  const goto = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (error)
    return (
      <main className="fatal">
        <h1>Unable to load the shop</h1>
        <p>{error}</p>
        <p>Start the NestJS API on port 4000, then refresh.</p>
      </main>
    );
  if (!catalog)
    return (
      <main className="loading">
        <span className="spinner" />
        <b>Preparing the shop…</b>
      </main>
    );
  return (
    <div className={view === 'admin' ? undefined : 'storefront-theme'}>
      {view !== "admin" && (
        <StoreHeader
          catalog={catalog} query={query} quantity={quantity} category={category}
          showCategories={!['cart', 'checkout', 'payment'].includes(view)}
          activeOrders={customerOrders.activeCount}
          onQuery={(value) => { setQuery(value); setCategory('all'); setView('shop'); }}
          onCategory={(id) => { setCategory(id); goto('shop'); }}
          onCart={() => goto('cart')} onOrders={() => goto('orders')}
          onWishlist={() => { setDetail(null); goto('wishlist'); }} wishlistActive={view === 'wishlist'}
          onProduct={(product) => { setDetail(product); setView('shop'); }}
        />
      )}
      {view !== 'admin' && wishlist.error && <div className={styles.wishlistError} role="alert">{wishlist.error}<button onClick={() => void wishlist.refresh()}>Retry wishlist</button></div>}
      {(view === 'shop' || view === 'wishlist') && <>
        <StoreCatalog
          catalog={catalog} cart={cart} category={category} query={query} sort={sort}
          wishlistMode={view === 'wishlist'} savedIds={wishlist.ids} wishlistPending={wishlist.pending} wishlistReady={wishlist.ready} onWishlist={(id) => void wishlist.toggle(id)}
          onSort={setSort} onCategory={(id) => { setQuery(''); setCategory(id); goto('shop'); }}
          onOrders={() => goto('orders')} onAdd={add} onProduct={setDetail}
          onDecrease={(product) => {
            saveCart(cart.map((line) => line.productId === product.id && !line.variantId && !line.customShadeCode ? { ...line, quantity: line.quantity - 1 } : line).filter((line) => line.quantity > 0));
          }}
          onReset={() => { setQuery(''); setCategory('all'); goto('shop'); }}
        />
        {detail && <ProductDetails key={detail.id} product={catalog.products.find((product) => product.id === detail.id) ?? detail} gstInclusive={catalog.shop.gstInclusive} gstRate={catalog.shop.gstRate} paintShades={catalog.paintShades} onAdd={add} onClose={() => setDetail(null)} />}
      </>}
      {view === "cart" && (
        <Cart catalog={catalog} cart={cart} saveCart={saveCart} goto={goto} />
      )}
      {view === "checkout" && (
        <Checkout
          catalog={catalog}
          cart={cart}
          onCreated={(o) => {
            setLastOrder(o);
            goto("payment");
          }}
          goto={goto}
        />
      )}
      {view === "payment" && lastOrder && (
        <Payment
          order={lastOrder}
          setOrder={setLastOrder}
          done={() => {
            if (lastOrder.payment.reference && lastOrder.status !== 'Cancelled') saveCart([]);
            goto("orders");
          }}
        />
      )}
      {view === "orders" && <MyOrders initial={lastOrder} orders={customerOrders.orders} listError={customerOrders.error} onRetry={() => void customerOrders.refresh()} onBack={() => goto('shop')} />}
      {view === "admin" && (
        <AdminPanel
          catalog={catalog}
          refresh={() => api.catalog().then(setCatalog)}
        />
      )}
      {view !== 'admin' && <StoreFooter shop={catalog.shop} onOrders={() => goto('orders')}  />}
      {(view === 'shop' || view === 'wishlist') && quantity > 0 && !detail && <>
        <div className="cart-summary-space" aria-hidden="true" />
        <aside className="floating-cart-summary" aria-label="Shopping cart summary">
          <span className="floating-cart-icon" aria-hidden="true"><Icon name="cart" /><b>{quantity > 99 ? '99+' : quantity}</b></span>
          <span className="floating-cart-info" role="status" aria-live="polite" aria-atomic="true">
            <strong>{quantity} {quantity === 1 ? 'item' : 'items'}</strong>
            <span className="floating-cart-dot" aria-hidden="true">·</span>
            <strong aria-label={`Item subtotal ${money(cartSubtotal)}, before delivery and checkout adjustments`}>{money(cartSubtotal)}</strong>
          </span>
          <button type="button" onClick={() => goto('cart')}>View Cart <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
        </aside>
      </>}
    </div>
  );
}

function Icon({
  name,
}: {
  name: "search" | "grid" | "orders" | "cart" | "chevron";
}) {
  const paths = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
    grid: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </>
    ),
    orders: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    cart: (
      <>
        <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" />
        <circle cx="10" cy="20.5" r="1.3" />
        <circle cx="17" cy="20.5" r="1.3" />
      </>
    ),
    chevron: <path d="m7 10 5 5 5-5" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Cart({
  catalog,
  cart,
  saveCart,
  goto,
}: {
  catalog: Catalog;
  cart: CartLine[];
  saveCart: (v: CartLine[]) => void;
  goto: (v: View) => void;
}) {
  const lines = resolveCartLines(cart, catalog.products);
  const subtotal = lines.reduce((n, l) => n + l.price * l.quantity, 0);
  const change = (i: number, max: number, q: number) =>
    saveCart(
      cart
        .map((x, n) =>
          n === i
            ? { ...x, quantity: Math.max(0, Math.min(max, q)) }
            : x,
        )
        .filter((x) => x.quantity),
    );
  return (
    <CommercePage title="Your Cart" subtitle={`${lines.reduce((total, line) => total + line.quantity, 0)} items`} backLabel="Continue shopping" onBack={() => goto('shop')} step={1}>
      {!lines.length ? (
        <div className="empty">
          <b>Your cart is empty</b>
          <button onClick={() => goto("shop")}>Browse products</button>
        </div>
      ) : (
        <div className="two-col">
          <section className="line-list">
            {lines.map((l) => (
              <article className="cart-line" key={cartLineKey(l)}>
                <img className="mini-art" src={assetUrl(l.p.imageUrl)} alt="" />
                <div>
                  <b>{l.p.name}</b>
                  {l.colorName && <small>Color: {l.colorName}</small>}
                  {l.customShadeCode && <small className="custom-shade-code">Custom shade code: {l.customShadeCode}</small>}
                  <span>{money(l.price)}</span>
                </div>
                <div className="qty">
                  <button aria-label={`Remove one ${l.p.name}`} onClick={() => change(l.cartIndex, l.max, l.quantity - 1)}>−</button>
                  <b>{l.quantity}</b>
                  <button aria-label={`Add one ${l.p.name}`} disabled={l.quantity >= l.max} onClick={() => change(l.cartIndex, l.max, l.quantity + 1)}>+</button>
                </div>
                <strong>{money(l.price * l.quantity)}</strong>
              </article>
            ))}
          </section>
          <aside className="summary">
            <h2>Order summary</h2>
            <div>
              <span>Subtotal</span>
              <b>{money(subtotal)}</b>
            </div>
            <div>
              <span>Delivery</span>
              <small>Calculated at checkout</small>
            </div>
            <div>
              <span>GST</span>
              <small>Included in prices</small>
            </div>
            {subtotal < catalog.shop.minimumOrder && (
              <p className="warning">
                Add {money(catalog.shop.minimumOrder - subtotal)} to reach the
                minimum order.
              </p>
            )}
            <button
              disabled={subtotal < catalog.shop.minimumOrder}
              onClick={() => {
                saveCart(lines.map(({ productId, variantId, customShadeCode, quantity }) => ({ productId, variantId, customShadeCode, quantity })));
                goto('checkout');
              }}
            >
              Checkout securely →
            </button>
          </aside>
        </div>
      )}
    </CommercePage>
  );
}

export function Checkout({
  catalog,
  cart,
  onCreated,
  goto,
}: {
  catalog: Catalog;
  cart: CartLine[];
  onCreated: (o: Order) => void;
  goto: (v: View) => void;
}) {
  const [customer, setCustomer] = useState<Customer>(blankCustomer),
    [tier, setTier] = useState("customer"),
    [quoteResult, setQuoteResult] = useState<{ key: string; value: OrderQuote | null; error?: string }>({ key: '', value: null }),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CustomerErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof Customer, boolean>>>({});
  const quoteKey = JSON.stringify([cart, customer, tier]);
  const checkoutKey = useRef<{ quote: string; key: string }>();
  const quote = quoteResult.key === quoteKey ? quoteResult.value : null;
  const quoteError = quoteResult.key === quoteKey ? quoteResult.error : undefined;
  useEffect(() => {
    let active = true;
    setQuoteResult({ key: quoteKey, value: null });
    if (Object.keys(validateCustomer(customer)).length) return;
    const timer = window.setTimeout(() => {
      void api.quote(cart, customer, tier)
        .then((value) => { if (active) setQuoteResult({ key: quoteKey, value }); })
        .catch((error) => { if (active) setQuoteResult({ key: quoteKey, value: null, error: error instanceof Error ? error.message : 'Unable to calculate the order total.' }); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [cart, customer, tier, quoteKey]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const errors = validateCustomer(customer);
    setFieldErrors(errors);
    setTouched(Object.fromEntries(Object.keys(customerLabels).map((key) => [key, true])));
    if (Object.keys(errors).length) {
      form.querySelector<HTMLInputElement>(`[name="${Object.keys(errors)[0]}"]`)?.focus();
      return;
    }
    setBusy(true);
    setErr("");
    try {
      if (checkoutKey.current?.quote !== quoteKey) {
        checkoutKey.current = { quote: quoteKey, key: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('') };
      }
      onCreated(await api.order(cart, customer, tier, checkoutKey.current.key));
    } catch (x) {
      if (x instanceof ApiError && x.fields) {
        const errors = Object.fromEntries(Object.entries(x.fields).filter(([key, value]) => key in customerLabels && typeof value === 'string'));
        setFieldErrors(errors);
        form.querySelector<HTMLInputElement>(`[name="${Object.keys(errors)[0]}"]`)?.focus();
      }
      setErr(x instanceof Error ? x.message : "Could not create order");
    } finally {
      setBusy(false);
    }
  };
  const field = (key: keyof Customer, label: string, placeholder = "") => (
    <CheckoutField
        id={`checkout-${key}`} label={label} error={fieldErrors[key]}
        name={key}
        type={key === 'phone' ? 'tel' : 'text'}
        pattern={key === 'phone' ? '[6-9][0-9]{9}' : key === 'pincode' ? '[1-9][0-9]{5}' : '.*\\S.*'}
        autoComplete={key === 'name' ? 'name' : key === 'phone' ? 'tel' : key === 'address' ? 'street-address' : key === 'city' ? 'address-level2' : key === 'state' ? 'address-level1' : key === 'pincode' ? 'postal-code' : undefined}
        inputMode={key === 'phone' || key === 'pincode' ? 'numeric' : undefined}
        maxLength={key === 'phone' ? 10 : key === 'pincode' ? 6 : undefined}
        value={customer[key]}
        placeholder={placeholder}
        onBlur={() => { setTouched((current) => ({ ...current, [key]: true })); setFieldErrors((current) => ({ ...current, [key]: validateCustomer(customer)[key] })); }}
        onChange={(e) => {
          const next = { ...customer, [key]: e.target.value };
          setCustomer(next);
          if (touched[key]) setFieldErrors((current) => ({ ...current, [key]: validateCustomer(next)[key] }));
        }}
    />
  );
  return (
    <CommercePage title="Checkout" backLabel="Back to cart" onBack={() => goto('cart')} step={2}>
      <form className="two-col checkout-form" onSubmit={submit} noValidate aria-busy={busy}>
        <div>
          <CustomerTypeSelect categories={catalog.customerCategories} value={tier} onChange={setTier} />
          <CheckoutSection number="01" title="Customer" description="We’ll call this number to confirm your order.">
            {field('name', 'Full name', 'Enter full name')}
            {field('phone', 'Mobile number', '10-digit mobile number')}
          </CheckoutSection>
          <CheckoutSection number="02" title="Delivery" description="Delivery charges update for your address.">
            {field('address', 'Address', 'Door number and street')}
            {field('area', 'Area / locality', 'Area or neighbourhood')}
            {field('city', 'City')}
            {field('district', 'District')}
            {field('state', 'State')}
            {field('pincode', 'Pincode', '6-digit pincode')}
          </CheckoutSection>
        </div>
        <aside className="summary" aria-live="polite" aria-atomic="true">
          <h2>Review order</h2>
          {resolveCartLines(cart, catalog.products).filter((line) => line.customShadeCode || line.colorName).map((line) => <div key={cartLineKey(line)}><span>{line.p.name}{line.colorName && <small>Color: {line.colorName}</small>}{line.customShadeCode && <small className="custom-shade-code">Custom shade code: {line.customShadeCode}</small>}</span><b>× {line.quantity}</b></div>)}
          {cart.some((line) => line.customShadeCode) && <p className="notice">Custom shade codes will be sent to the shop. This total uses the listed product prices; any extra shade charge will be discussed separately.</p>}
          {quote ? (
            <CheckoutTotals totals={quote} />
          ) : (
            <p>{Object.keys(validateCustomer(customer)).length ? 'Enter a valid delivery address to calculate the final total.' : quoteError || 'Updating your order total…'}</p>
          )}
          {err && <p className="error">{err}</p>}
          <button disabled={busy}>
            {busy ? "Preparing payment…" : "Proceed to UPI payment →"}
          </button>
          <small>Prices and stock are rechecked securely by the server.</small>
        </aside>
      </form>
    </CommercePage>
  );
}

export function Payment({
  order,
  setOrder,
  done,
}: {
  order: Order;
  setOrder: (o: Order) => void;
  done: () => void;
}) {
  const [ref, setRef] = useState(""),
    [msg, setMsg] = useState("");
  const [referenceError, setReferenceError] = useState('');
  const [referenceTouched, setReferenceTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const upi = order.paymentConfig?.upiId || "";
  const link = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(order.paymentConfig?.payeeName || "VKS VEL TRADERS")}&tn=${encodeURIComponent(order.id)}&am=${order.total.toFixed(2)}&cu=INR`;
  useEffect(() => {
    const timer = setInterval(() => {
      const make = (
        window as unknown as {
          qrcode?: (
            type: number,
            level: string,
          ) => {
            addData: (s: string) => void;
            make: () => void;
            createSvgTag: (o: {
              cellSize: number;
              margin: number;
              scalable: boolean;
            }) => string;
          };
        }
      ).qrcode;
      if (make && qrRef.current) {
        const qr = make(0, "M");
        qr.addData(link);
        qr.make();
        qrRef.current.innerHTML = qr.createSvgTag({
          cellSize: 5,
          margin: 0,
          scalable: true,
        });
        clearInterval(timer);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [link]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const error = validatePaymentReference(ref);
    setReferenceTouched(true); setReferenceError(error); setMsg('');
    if (error) { e.currentTarget.querySelector<HTMLInputElement>('input')?.focus(); return; }
    setSubmitting(true);
    try {
      const updated = await api.reference(order.id, ref, order.trackingToken || receiptToken(order.id));
      rememberReceipt(order.id, order.trackingToken);
      setOrder({ ...updated, trackingToken: order.trackingToken, paymentConfig: order.paymentConfig });
      setMsg("Reference submitted. We will verify your payment shortly.");
    } catch (x) {
      setMsg(x instanceof Error ? x.message : "Unable to submit");
    } finally { setSubmitting(false); }
  };
  return (
    <main className="page shell">
      <div className="page-title">
        <span className="eyebrow">Order {order.id}</span>
        <h1>{order.status === 'Cancelled' ? 'Payment cancelled' : order.status === 'Pending Verification' ? 'Payment pending verification' : 'Complete your payment'}</h1>
        <p>
          {order.status === 'Pending Payment' ? <>Your stock is reserved until{" "}
          {new Date(order.payment.expiresAt).toLocaleTimeString("en-IN", {
            hour: "numeric",
            minute: "2-digit",
          })}
          .</> : order.status === 'Cancelled' ? 'Your order is cancelled.' : 'The shop will verify your transaction before confirming your order.'}
        </p>
      </div>
      <div className="pay-layout">
        <section className="payment-card">
          {order.status === 'Pending Payment' ? <>
          <div className="pay-amount">
            <span>Amount to pay</span>
            <b>{formatOrderMoney(order.total)}</b>
          </div>
          <div ref={qrRef} className="qr-placeholder">
            <span>Loading QR…</span>
            <small>Or use the UPI button below</small>
          </div>
          <a className="primary-link" href={link}>
            Pay with any UPI app →
          </a>
          <div className="upi">
            <span>UPI ID</span>
            <b>{upi}</b>
          </div>
          <form onSubmit={submit} noValidate aria-busy={submitting}>
              <CheckoutField id="payment-reference" name="reference" label="Already paid? Enter UTR / reference" error={referenceError}
                minLength={12}
                maxLength={12}
                pattern="[0-9]{12}"
                value={ref}
                onBlur={() => { setReferenceTouched(true); setReferenceError(validatePaymentReference(ref)); }}
                onChange={(e) => { const value = e.target.value.replace(/\s/g, ''); setRef(value); if (referenceTouched) setReferenceError(validatePaymentReference(value)); }}
                placeholder="12-digit payment reference"
              />
            <button disabled={submitting}>{submitting ? 'Submitting…' : 'OK / Confirm Payment'}</button>
          </form>
          </> : <p role="status">{order.status === 'Cancelled' ? 'This checkout was cancelled. Do not send payment.' : 'Reference submitted. Payment is pending verification by the shop. This is not proof of payment.'}</p>}
          {msg && <p className="notice">{msg}</p>}
        </section>
        <aside className="summary">
          <h2>{order.id}</h2>
          {order.items.map((i) => (
            <div key={cartLineKey(i)}>
              <span>
                {i.name} × {i.quantity}
                {i.shade && <small>Color: {i.shade}</small>}
                {i.customShadeCode && <small className="custom-shade-code">Custom shade code: {i.customShadeCode}</small>}
              </span>
              <b>{formatOrderMoney(i.price * i.quantity)}</b>
            </div>
          ))}
          <CheckoutTotals totals={order} /><CancelOrder order={order} token={order.trackingToken} onChanged={(updated) => setOrder({ ...updated, trackingToken: order.trackingToken, paymentConfig: order.paymentConfig })} />
          <button className="secondary" onClick={done}>
            View my order
          </button>
        </aside>
      </div>
      <div style={{ marginTop: 24 }}><OrderDetails showCancel={false} order={order} token={order.trackingToken || receiptToken(order.id)} onChanged={(updated) => setOrder({ ...updated, trackingToken: order.trackingToken, paymentConfig: order.paymentConfig })} /></div>
    </main>
  );
}

function Admin({
  catalog,
  refresh,
}: {
  catalog: Catalog;
  refresh: () => void;
}) {
  const [token, setToken] = useState(""),
    [credentials, setCredentials] = useState({
      username: "ADMIN",
      password: "",
    }),
    [tab, setTab] = useState("dashboard"),
    [data, setData] = useState<any>(null),
    [err, setErr] = useState("");
  const load = async (t = token, section = tab) => {
    try {
      setData(
        await api.admin(
          section === "dashboard"
            ? "/dashboard"
            : section === "configuration"
              ? "/configuration"
              : `/${section}`,
          t,
        ),
      );
      setErr("");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Admin request failed");
    }
  };
  const login = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.login(credentials.username, credentials.password);
      setToken(r.accessToken);
      setTab("dashboard");
      await load(r.accessToken, "dashboard");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Login failed");
    }
  };
  useEffect(() => {
    if (token) load();
  }, [tab]);
  if (!token)
    return (
      <main className="admin-login">
        <form onSubmit={login}>
          <span className="mark">V</span>
          <span className="eyebrow">Owner console</span>
          <h1>Welcome back</h1>
          <label>
            <span>Username</span>
            <input
              value={credentials.username}
              onChange={(e) =>
                setCredentials({ ...credentials, username: e.target.value })
              }
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={credentials.password}
              onChange={(e) =>
                setCredentials({ ...credentials, password: e.target.value })
              }
            />
          </label>
          {err && <p className="error">{err}</p>}
          <button>Sign in securely</button>
        </form>
      </main>
    );
  const saveStock = async (p: Product, value: number) => {
    await api.updateProduct({ ...p, stock: value }, token);
    await load(token, "products");
    refresh();
  };
  return (
    <main className="admin-page shell">
      <div className="admin-head">
        <div>
          <span className="eyebrow">VKS management</span>
          <h1>Shop control centre</h1>
        </div>
        <button onClick={() => setToken("")}>Sign out</button>
      </div>
      <div className="admin-tabs">
        {["dashboard", "orders", "products", "configuration"].map((t) => (
          <button
            className={tab === t ? "on" : ""}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      {err && <p className="error">{err}</p>}
      {tab === "dashboard" && data && (
        <div className="stats">
          {Object.entries(data).map(([k, v]) => (
            <article key={k}>
              <span>{k.replace(/([A-Z])/g, " $1")}</span>
              <b>{k === "revenue" ? money(Number(v)) : String(v)}</b>
            </article>
          ))}
        </div>
      )}
      {tab === "orders" && Array.isArray(data) && (
        <div className="admin-list">
          {data.length ? (
            data.map((o: Order) => (
              <article key={o.id}>
                <div>
                  <b>{o.id}</b>
                  <span>
                    {o.customer.name} · {o.customer.phone}
                  </span>
                </div>
                <strong>{money(o.total)}</strong>
                <span className="pill">{paymentStatusLabel(o.payment.status)}</span>
                <span>{o.status}</span>
                {o.payment.status === "PENDING_VERIFICATION" && (
                  <button
                    onClick={async () => {
                      await api.admin(`/orders/${o.id}/verify-payment`, token, {
                        method: "POST",
                      });
                      load();
                    }}
                  >
                    Verify payment
                  </button>
                )}
              </article>
            ))
          ) : (
            <div className="empty">
              <b>No orders yet</b>
            </div>
          )}
        </div>
      )}
      {tab === "products" && Array.isArray(data) && (
        <div className="admin-list">
          {data.map((p: Product) => (
            <article key={p.id}>
              <div>
                <b>{p.name}</b>
                <span>
                  {catalog.categories.find((c) => c.id === p.categoryId)?.name}{" "}
                  · HSN {p.hsn}
                </span>
              </div>
              <strong>{money(p.price)}</strong>
              <label className="stock-edit">
                Stock{" "}
                <input
                  type="number"
                  min="0"
                  defaultValue={p.stock}
                  onBlur={(e) =>
                    Number(e.target.value) !== p.stock &&
                    saveStock(p, Number(e.target.value))
                  }
                />
              </label>
              <span className={`pill ${p.stock < 6 ? "warn" : ""}`}>
                {p.manualOutOfStock
                  ? "Manual OOS"
                  : p.stock
                    ? "Active"
                    : "Out of stock"}
              </span>
            </article>
          ))}
        </div>
      )}
      {tab === "configuration" && data && (
        <div className="config-grid">
          <article>
            <h2>Shop</h2>
            <p>
              <b>{data.shop.name}</b>
              <br />
              {data.shop.address}
              <br />
              {data.shop.phone}
              <br />
              GSTIN {data.shop.gstin}
            </p>
          </article>
          <article>
            <h2>Delivery rules</h2>
            {data.deliveryRules.map((r: any) => (
              <p key={r.id}>
                {r.match}
                <b>{money(r.charge)}</b>
              </p>
            ))}
          </article>
          <article>
            <h2>Customer discounts</h2>
            {data.customerCategories.map((c: any) => (
              <p key={c.id}>
                {c.name}
                <b>
                  {c.discountPercent}% over {money(c.minimum)}
                </b>
              </p>
            ))}
          </article>
          <article>
            <h2>Hero banners</h2>
            {data.banners.map((b: any) => (
              <p key={b.id}>
                {b.label}
                <b>{b.categoryId}</b>
              </p>
            ))}
          </article>
        </div>
      )}
    </main>
  );
}
