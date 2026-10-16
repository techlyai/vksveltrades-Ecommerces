'use client';

import { useState } from 'react';
import type { PaintShade, Product, Variant } from '../../lib/types';
import { assetUrl } from '../../lib/api';
import { formatPrice } from '../../lib/catalog-view';
import { customShadesEnabled, productColorName } from '../../lib/cart';
import { paintShadeRequest } from '../../lib/paint-shades';
import { PaintShadePicker } from './PaintShadePicker';
import { isWireProduct } from '../../lib/wire-colors';
import { productImages } from '../../lib/product-images';
import { ProductDialog } from '../ProductDialog';
import { ShopIcon } from '../ShopIcon';
import styles from './ProductDetails.module.css';

export function ProductDetails({ product, gstInclusive, gstRate, paintShades, onAdd, onClose }: {
  paintShades?: PaintShade[];
  product: Product; gstInclusive: boolean; gstRate: number; onAdd: (product: Product, variant?: Variant, customShadeCode?: string) => void; onClose: () => void;
}) {
  const [variantId, setVariantId] = useState(product.variants?.find((item) => item.stock > 0)?.id ?? product.variants?.[0]?.id);
  const [customShadeCode, setCustomShadeCode] = useState('');
  const images = productImages(product);
  const [selectedImage, setSelectedImage] = useState('');
  const currentImage = images.includes(selectedImage) ? selectedImage : images[0];
  const variant = product.variants?.find((item) => item.id === variantId) ?? product.variants?.find((item) => item.stock > 0) ?? product.variants?.[0];
  const stock = variant?.stock ?? product.stock;
  const colorName = productColorName(product, variant);
  const unavailable = product.manualOutOfStock || stock <= 0;
  const specifications = [
    ...(product.short ? [{ label: 'Overview', value: product.short }] : []),
    ...(product.specifications ?? []),
    ...(product.hsn ? [{ label: 'HSN', value: product.hsn }] : []),
  ];
  return <ProductDialog onClose={onClose}>
    <section className={styles.details}>
      <button className={styles.close} aria-label="Close product details" onClick={onClose}><ShopIcon name="close" /></button>
      <div className={styles.overview}>
        <div className={styles.media}>{currentImage ? <img src={assetUrl(currentImage)} alt={`${product.name} — image ${images.indexOf(currentImage) + 1} of ${images.length}`} /> : <ShopIcon name="products" />}</div>
        {images.length > 1 && <div className={styles.thumbnails} role="group" aria-label="Product photos">{images.map((url, index) => <button type="button" key={`${index}-${url}`} aria-label={`View product image ${index + 1}`} aria-pressed={url === currentImage} onClick={() => setSelectedImage(url)}><img src={assetUrl(url)} alt={`${product.name} thumbnail ${index + 1}`} loading="lazy" /></button>)}</div>}
        <section className={styles.specifications} aria-labelledby="product-specifications-title">
          <h3 id="product-specifications-title">Features &amp; Specifications</h3>
          {specifications.length ? <table><caption className={styles.srOnly}>Specifications for {product.name}</caption><tbody>{specifications.map((entry, index) => <tr key={index}><th scope="row">{entry.label}</th><td>{entry.value}</td></tr>)}</tbody></table> : <p>Specifications have not been added for this product yet.</p>}
        </section>
      </div>
      <div className={styles.information}>
        {product.hsn && <span className={styles.hsn}>HSN {product.hsn}</span>}
        <h2 id="product-detail-title">{product.name}</h2>
        <span className={`${styles.status} ${unavailable ? styles.unavailable : ''}`}>{unavailable ? 'Out of stock' : stock <= 5 ? `Only ${stock} left` : 'In stock'}</span>
        {product.description && <p className={styles.description}>{product.description}</p>}
        {colorName && <section className={styles.colorName} aria-labelledby="product-color-title"><h3 id="product-color-title">Color</h3><p aria-live="polite">{colorName}</p></section>}
        {Boolean(product.variants?.length) && <fieldset className={styles.shades}><legend>{isWireProduct(product) ? 'Choose a wire color' : 'Available colors — choose a color'}</legend>{product.variants!.map((item) => <button type="button" key={item.id} aria-pressed={item.id === variant?.id} disabled={item.stock <= 0 || product.manualOutOfStock} onClick={() => setVariantId(item.id)}><i aria-hidden="true" style={{ backgroundColor: item.color }} /><span><b>{item.name}</b><small>{formatPrice(item.price)} · {item.stock > 0 && !product.manualOutOfStock ? `${item.stock} in stock` : 'Out of stock'}</small></span>{item.id === variant?.id && <ShopIcon name="check" />}</button>)}</fieldset>}
        {customShadesEnabled(product) && <PaintShadePicker value={customShadeCode} onChange={setCustomShadeCode} card={paintShades} />}
        <div className={styles.purchase}><div aria-live="polite"><strong>{formatPrice(variant?.price ?? product.price)}</strong><small>{gstInclusive ? `Inclusive of ${gstRate}% GST` : `${gstRate}% GST added at checkout`}</small>{variant && <small>Selected color: {variant.name}</small>}</div><button disabled={unavailable} onClick={() => onAdd(product, variant, customShadesEnabled(product) ? paintShadeRequest(customShadeCode, paintShades) || undefined : undefined)}><ShopIcon name="cart" />{unavailable ? 'Unavailable' : 'Add to cart'}</button></div>
      </div>
    </section>
  </ProductDialog>;
}
