'use client';

import type { CSSProperties } from 'react';
import type { Product } from '../../lib/types';
import { assetUrl } from '../../lib/api';
import { formatPrice, productAvailability } from '../../lib/catalog-view';
import { customShadesEnabled } from '../../lib/cart';
import { ShopIcon } from '../ShopIcon';
import { CategoryIcon } from '../CategoryIcon';
import styles from './Store.module.css';

export function ProductCard({ product, categoryName, categoryIcon = 'box', quantity, gstRate, gstInclusive, onAdd, onDecrease, onOpen, saved = false, wishlistBusy = false, onWishlist }: {
  product: Product; categoryName: string; quantity: number; gstRate?: number; gstInclusive?: boolean;
  onAdd: () => void; onDecrease: () => void; onOpen: () => void;
  saved?: boolean; wishlistBusy?: boolean; onWishlist?: () => void; categoryIcon?: string;
}) {
  const { stock, unavailable, hasVariants } = productAvailability(product);
  const needsOptions = hasVariants || customShadesEnabled(product);
  const colorNames = [...new Set((product.variants?.length ? product.variants.map((variant) => variant.name) : [product.colorName ?? '']).map((name) => name.trim()).filter(Boolean))];
  const discount = product.originalPrice && product.originalPrice > product.price ? Math.round((1 - product.price / product.originalPrice) * 100) : 0;
  return (
    <article className={styles.productCard} data-saved={saved || undefined} style={{ '--product-tone': product.accent || '#2156e8' } as CSSProperties}>
      <div className={styles.productImageArea}>
      <button className={styles.productMedia} aria-label={`View ${product.name}`} onClick={onOpen}>
        {product.imageUrl ? <img src={assetUrl(product.imageUrl)} alt={product.name} loading="lazy" /> : <span className={styles.productPlaceholder}><CategoryIcon name={categoryIcon} /></span>}
        {discount > 0 && <span className={styles.discount}>{discount}% off</span>}
        <span className={styles.quickView}>Quick view</span>
      </button>
      <button className={styles.wishlistHeart} aria-label={`${saved ? 'Remove' : 'Save'} ${product.name} ${saved ? 'from' : 'to'} wishlist`} aria-pressed={saved} disabled={wishlistBusy} onClick={onWishlist}><ShopIcon name="heart" fill={saved ? 'currentColor' : 'none'} /></button>
      </div>
      <div className={styles.productBody}>
        <span className={styles.productCategory}>{categoryName}</span>
        <button className={styles.productName} onClick={onOpen}>{product.name}</button>
        {product.short && <p className={styles.productDescription}>{product.short}</p>}
        {colorNames.length > 0 && <p className={styles.productColors}><strong>{colorNames.length === 1 ? 'Color' : 'Colors'}:</strong> {colorNames.join(', ')}</p>}
        <span className={`${styles.stockStatus} ${unavailable ? styles.outOfStock : stock <= 5 ? styles.lowStock : ''}`}><i />{unavailable ? 'Out of stock' : stock <= 5 ? `Only ${stock} left` : 'In stock'}</span>
        {gstRate !== undefined && <small className={styles.productTax}>{gstInclusive ? `Inclusive of ${gstRate}% GST` : `${gstRate}% GST added at checkout`}</small>}
        <div className={styles.productBuy}>
          <div className={styles.price}>{product.originalPrice && product.originalPrice > product.price && <del>{formatPrice(product.originalPrice)}</del>}<strong>{formatPrice(product.price)}</strong>{hasVariants && <small>onwards</small>}</div>
          {!needsOptions && quantity > 0 ? <div className={styles.quantity} aria-label={`Quantity of ${product.name}`}>
            <button aria-label={`Remove one ${product.name}`} onClick={onDecrease}><ShopIcon name="minus" /></button><output aria-live="polite">{quantity}</output><button disabled={unavailable || quantity >= stock} aria-label={`Add one ${product.name}`} onClick={onAdd}><ShopIcon name="plus" /></button>
          </div> : <button className={styles.addButton} disabled={unavailable} onClick={needsOptions ? onOpen : onAdd}>{!unavailable && !needsOptions && <ShopIcon name="plus" />}{unavailable ? 'Unavailable' : hasVariants ? 'Choose color' : needsOptions ? 'Choose shade' : 'Add'}</button>}
        </div>
      </div>
    </article>
  );
}
