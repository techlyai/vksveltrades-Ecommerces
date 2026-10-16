'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Category, Product, Variant } from '../../lib/types';
import { isWireProduct, wireColorError } from '../../lib/wire-colors';
import { AdminModal } from '../AdminModal';
import { WireColorFields } from './WireColorFields';
import styles from './WireColorManager.module.css';

export function WireColorManager({ token, gstInclusive, onChanged }: {
  token: string; gstInclusive: boolean; onChanged: () => void;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setError(''); setLoading(true);
    Promise.all([api.admin<Product[]>('/products', token), api.admin<Category[]>('/categories', token)])
      .then(([items, groups]) => { if (active) { setProducts(items); setCategories(groups); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load wire products'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, retry]);
  const wires = (products ?? []).filter((product) => isWireProduct(product, categories));
  const filtered = wires.filter((product) => product.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className={styles.manager}>
    <div className={styles.heading}><div><h2>Wire colors</h2><p>Add and edit the colors available for each wire or cable. Customers choose a color before adding the product to their cart.</p></div><button type="button" disabled={loading} onClick={() => setRetry((value) => value + 1)}>{loading ? 'Loading…' : 'Reload wire products'}</button></div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {error && <p role="alert" className="admin-error">{error}</p>}
    {!products && !error && <p role="status">Loading wire products…</p>}
    {products && <>
      <label className={styles.search}><span>Search wire products</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Product name" /></label>
      <div className={styles.cards}>{filtered.map((product) => <article key={product.id}>
        <h3>{product.name}</h3><small>{product.enabled ? 'Visible in shop' : 'Product hidden'}{product.manualOutOfStock ? ' · Marked out of stock' : ''}</small>
        <div className={styles.swatches}>{(product.variants ?? []).map((variant) => <span key={variant.id}><i aria-hidden="true" style={{ background: variant.color }} />{variant.name} · {variant.stock} in stock</span>)}</div>
        {!product.variants?.length && <p>No wire colors configured yet.</p>}
        <button type="button" className="admin-primary" aria-label={`Edit colors for ${product.name}`} disabled={loading} onClick={() => { setNotice(''); setEditing(structuredClone(product)); }}>Edit colors</button>
      </article>)}</div>
      {!filtered.length && <p>{wires.length ? 'No matching wire products.' : 'Add a product in Wires & Cables under Products, then configure its colors here.'}</p>}
    </>}
    {editing && <WireColorEditor key={editing.id} product={editing} gstInclusive={gstInclusive} onClose={() => setEditing(null)} onSave={async (variants) => {
      const saved = await api.admin<Product>(`/products/${encodeURIComponent(editing.id)}/colors`, token, {
        method: 'PUT', body: JSON.stringify({ variants, expected: { variants: editing.variants ?? [], price: editing.price, stock: editing.stock } }),
      });
      setProducts((current) => (current ?? []).map((product) => product.id === saved.id ? saved : product));
      setEditing(null); setNotice(saved.variants?.length ? `Colors saved for ${saved.name}. Customers can buy colors that have stock.` : `${saved.name} saved without colors. Customers use the product's normal price and stock.`); onChanged();
    }} />}
  </section>;
}

function WireColorEditor({ product, gstInclusive, onClose, onSave }: {
  product: Product; gstInclusive: boolean; onClose: () => void; onSave: (variants: Variant[]) => Promise<void>;
}) {
  const [variants, setVariants] = useState(product.variants ?? []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const issue = wireColorError(variants);
    if (issue) { setError(issue); return; }
    setBusy(true); setError('');
    try { await onSave(variants); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save wire colors'); }
    finally { setBusy(false); }
  };
  return <AdminModal busy={busy} onClose={onClose} labelledBy="wire-editor-title"><form className={styles.editor} onSubmit={submit}>
    <header><div><h2 id="wire-editor-title">Edit wire colors</h2><p>{product.name}</p></div><button type="button" aria-label="Close wire color editor" disabled={busy} onClick={onClose}>×</button></header>
    <div className={styles.scroll}>
      <p>{gstInclusive ? 'Enter prices including GST.' : 'GST is added at checkout.'} Stock is counted separately for each color.</p>
      {!product.variants?.length && <p className={styles.notice}>Current stock: {product.stock}. Enter the actual quantity for each color; the saved total will replace the product stock.</p>}
      <fieldset disabled={busy}><WireColorFields variants={variants} price={product.price} onChange={(value) => { setVariants(value); setError(''); }} /></fieldset>
      {!variants.length && <p className={styles.notice}>Colors are optional. Save without colors to use the product price and total available stock. You can edit these in Products.</p>}
      {error && <p role="alert" className="admin-error">{error}</p>}
    </div>
    <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="admin-primary" disabled={busy}>{busy ? 'Saving…' : 'Save wire colors'}</button></footer>
  </form></AdminModal>;
}
