'use client';

import type { CartLine, Catalog, Product } from '../../lib/types';
import { filterProducts, visibleProducts } from '../../lib/catalog-view';
import { ProductCard } from './ProductCard';
import { BannerCarousel } from './BannerCarousel';
import { ShopIcon } from '../ShopIcon';
import styles from './Store.module.css';

export function StoreCatalog({ catalog, cart, category, query, sort, onSort, onCategory, onOrders, onAdd, onDecrease, onProduct, onReset, savedIds = [], wishlistPending = [], wishlistReady = true, onWishlist, wishlistMode = false }: {
  savedIds?: string[]; wishlistPending?: string[]; wishlistReady?: boolean; onWishlist?: (id: string) => void; wishlistMode?: boolean;
  catalog: Catalog; cart: CartLine[]; category: string; query: string; sort: string;
  onSort: (sort: string) => void; onCategory: (id: string) => void; onOrders: () => void;
  onAdd: (product: Product) => void; onDecrease: (product: Product) => void;
  onProduct: (product: Product) => void; onReset: () => void;
}) {
  const products = visibleProducts(catalog);
  const list = wishlistMode ? filterProducts(products.filter((product) => savedIds.includes(product.id)), 'all', '', sort) : filterProducts(products, category, query, sort);
  const title = wishlistMode ? 'Your wishlist' : query.trim() ? `Results for “${query.trim()}”` : category === 'all' ? 'All Products' : catalog.categories.find((item) => item.id === category)?.name || 'Products';
  return <main className={styles.store}>
    {!wishlistMode && category === 'all' && !query.trim() && <BannerCarousel catalog={catalog} onCategory={onCategory} onOrders={onOrders} />}
    <section id="shop-products" className={`${styles.container} ${styles.catalog}`}>
      <div className={styles.catalogToolbar}>
        <div><h2>{title}</h2><p aria-live="polite">{list.length} {list.length === 1 ? 'product' : 'products'}{query || category !== 'all' ? ' found' : ' available'}</p></div>
        <label className={styles.sort}><span>Sort by</span><select value={sort} onChange={(event) => onSort(event.target.value)}><option value="featured">Featured</option><option value="low">Price: Low to High</option><option value="high">Price: High to Low</option><option value="name">Name: A–Z</option></select></label>
      </div>
      {!wishlistMode && (query || category !== 'all') && <button className={styles.clearFilters} onClick={onReset}><ShopIcon name="close" />Clear filters</button>}
      {wishlistMode && <p className={styles.wishlistNote}>Saved for this browser. Your favourites stay here when you return.</p>}
      {wishlistMode && !wishlistReady ? <div className={styles.emptyState}><ShopIcon name="heart" /><h3>Loading your wishlist</h3><p>If loading fails, use Retry wishlist above.</p></div> : list.length ? <div className={styles.productGrid}>{list.map((product) => <ProductCard key={product.id} product={product} gstRate={catalog.shop.gstRate} gstInclusive={catalog.shop.gstInclusive} categoryIcon={catalog.categories.find((item) => item.id === product.categoryId)?.icon} saved={savedIds.includes(product.id)} wishlistBusy={!wishlistReady || wishlistPending.includes(product.id)} onWishlist={() => onWishlist?.(product.id)} categoryName={catalog.categories.find((item) => item.id === product.categoryId)?.name || ''} quantity={cart.filter((line) => line.productId === product.id && !line.variantId && !line.customShadeCode).reduce((total, line) => total + line.quantity, 0)} onAdd={() => onAdd(product)} onDecrease={() => onDecrease(product)} onOpen={() => onProduct(product)} />)}</div> : <div className={styles.emptyState}><ShopIcon name="products" /><h3>{wishlistMode ? 'Your wishlist is empty' : products.length ? 'No matching products' : 'Products are on their way'}</h3><p>{wishlistMode ? 'Tap the heart on a product to save it here.' : products.length ? 'Try another category or clear your search.' : 'Check back soon for the latest products from our shop.'}</p>{(wishlistMode || products.length > 0) && <button className={styles.primaryButton} onClick={onReset}>Browse all products<ShopIcon name="arrow" /></button>}</div>}
    </section>
  </main>;
}
