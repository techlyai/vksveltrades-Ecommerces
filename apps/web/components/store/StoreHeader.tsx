'use client';

import { useEffect, useRef, useState } from 'react';
import type { Catalog, Product } from '../../lib/types';
import { assetUrl, shopLogoUrl } from '../../lib/api';
import { filterProducts, formatPrice, visibleProducts } from '../../lib/catalog-view';
import { CategoryIcon } from '../CategoryIcon';
import { ShopIcon } from '../ShopIcon';
import { ShopWordmark } from './ShopWordmark';
import styles from './Store.module.css';

export function StoreHeader({ catalog, category, query, quantity, onCategory, onQuery, onCart, onOrders, onProduct, onWishlist, wishlistActive = false, showCategories = true, activeOrders = 0 }: {
  catalog: Catalog; category: string; query: string; quantity: number;
  onCategory: (id: string) => void; onQuery: (query: string) => void;
  onCart: () => void; onOrders: () => void; onProduct: (product: Product) => void;
  onWishlist: () => void; wishlistActive?: boolean; showCategories?: boolean; activeOrders?: number;
}) {
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const categoryButton = useRef<HTMLButtonElement>(null);
  const products = visibleProducts(catalog);
  const categories = catalog.categories.filter((item) => item.enabled);
  const results = filterProducts(products, 'all', query, 'featured');
  const choose = (id: string, clearSearch = true) => { setCategoriesOpen(false); setSearchOpen(false); if (clearSearch) onQuery(''); onCategory(id); };

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setCategoriesOpen(false);
      if (!search.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (menu.current?.querySelector('[aria-expanded="true"]')) categoryButton.current?.focus();
        setCategoriesOpen(false); setSearchOpen(false);
      }
      if (event.key === '/' && !(event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) {
        event.preventDefault(); input.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); };
  }, []);

  useEffect(() => {
    if (!showCategories) setCategoriesOpen(false);
  }, [showCategories]);

  useEffect(() => {
    if (!categoriesOpen) return;
    document.documentElement.classList.add('store-category-open');
    return () => document.documentElement.classList.remove('store-category-open');
  }, [categoriesOpen]);

  return (
    <header className={styles.header}>
      <div className={`${styles.container} ${styles.headerRow}`}>
        <button className={styles.brand} onClick={() => { onQuery(''); choose('all'); }}>
          <img src={shopLogoUrl(catalog.shop.logoUrl)} alt="" width="46" height="46" />
          <span><ShopWordmark name={catalog.shop.name} /><small>Electrical | Plumbing | Paints | Hardware</small></span>
        </button>
        <div className={styles.search} ref={search}>
          <ShopIcon name="search" />
          <input ref={input} aria-label="Search products" aria-expanded={searchOpen && Boolean(query.trim())} aria-controls="store-search-results" placeholder="Search products, brands or HSN…" value={query} onFocus={() => { setSearchOpen(true); setCategoriesOpen(false); }} onChange={(event) => { onQuery(event.target.value); setSearchOpen(true); }} onKeyDown={(event) => { if (event.key === 'Enter') setSearchOpen(false); }} />
          {query ? <button aria-label="Clear search" onClick={() => { onQuery(''); input.current?.focus(); }}><ShopIcon name="close" /></button> : <kbd>/</kbd>}
          {searchOpen && query.trim() && <div id="store-search-results" className={styles.searchResults}>
            <small>Products</small>
            {results.slice(0, 5).map((product) => <button key={product.id} onClick={() => { setSearchOpen(false); onProduct(product); }}>
              <span className={styles.searchThumb}>{product.imageUrl ? <img src={assetUrl(product.imageUrl)} alt="" /> : <ShopIcon name="products" />}</span>
              <span><b>{product.name}</b><small>{catalog.categories.find((item) => item.id === product.categoryId)?.name}</small></span>
              <strong>{formatPrice(product.price)}</strong>
            </button>)}
            {!results.length && <p>No products match “{query}”.</p>}
            {results.length > 0 && <button className={styles.searchAll} onClick={() => choose('all', false)}>See all {results.length} results <ShopIcon name="arrow" /></button>}
          </div>}
        </div>
        <nav className={styles.headerActions} aria-label="Shop navigation">
          {showCategories && <div className={styles.categoryMenu} ref={menu}>
            <button ref={categoryButton} className={styles.navButton} aria-label="Browse categories" aria-expanded={categoriesOpen} aria-controls="store-category-list" onClick={() => { setCategoriesOpen(!categoriesOpen); setSearchOpen(false); }}><ShopIcon name="categories" /><span>Categories</span><ShopIcon name="chevron" className={styles.downChevron} /></button>
            {categoriesOpen && <div id="store-category-list" className={styles.categoryList} aria-label="Available categories">
              <button onClick={() => choose('all')} aria-current={category === 'all' ? 'true' : undefined}><i><ShopIcon name="categories" /></i><span><b>All Products</b><small>{products.length} items</small></span></button>
              {categories.map((item) => <button key={item.id} aria-current={category === item.id ? 'true' : undefined} onClick={() => choose(item.id)}><i>{item.imageUrl ? <img src={assetUrl(item.imageUrl)} alt="" /> : <CategoryIcon name={item.icon} />}</i><span><b>{item.name}</b><small>{products.filter((product) => product.categoryId === item.id).length} items</small></span></button>)}
            </div>}
          </div>}
          <button className={`${styles.navButton} ${styles.iconNav} ${styles.orderNav}`} aria-label="My Orders" title={`My Orders: ${activeOrders} active orders saved on this device`} onClick={onOrders}><ShopIcon name="orders" /><b aria-label={`${activeOrders} active orders`} aria-live="polite">{activeOrders}</b></button>
          <button className={`${styles.navButton} ${styles.iconNav}`} aria-label="Wishlist" title="Wishlist" aria-current={wishlistActive ? 'page' : undefined} onClick={onWishlist}><ShopIcon name="heart" fill={wishlistActive ? 'currentColor' : 'none'} /></button>
          <button className={styles.cartButton} onClick={onCart} aria-label={`View cart, ${quantity} items`} title="Shopping cart"><ShopIcon name="cart" /><b aria-live="polite" aria-atomic="true">{quantity}</b></button>
        </nav>
      </div>
      {showCategories && <div className={styles.railBorder}><nav className={`${styles.container} ${styles.categoryRail}`} aria-label="Browse categories">
        <button aria-pressed={category === 'all'} onClick={() => choose('all')}><ShopIcon name="categories" />All Products <span>{products.length}</span></button>
        {categories.map((item) => <button key={item.id} aria-pressed={category === item.id} onClick={() => choose(item.id)}><CategoryIcon name={item.icon} />{item.name}<span>{products.filter((product) => product.categoryId === item.id).length}</span></button>)}
      </nav></div>}
    </header>
  );
}
