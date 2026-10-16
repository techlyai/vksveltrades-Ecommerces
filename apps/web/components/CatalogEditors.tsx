'use client';

import { useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import type { Category, Product } from '../lib/types';
import { AdminModal } from './AdminModal';
import { CategoryIcon, categoryIconOptions } from './CategoryIcon';
import { ImageUpload } from './ImageUpload';
import { customShadesEnabled } from '../lib/cart';
import { isWireProduct } from '../lib/wire-colors';
import { WireColorFields } from './admin/WireColorFields';
import { productImageLabels, productImageSlots } from '../lib/product-images';
import imageStyles from './admin/ProductImages.module.css';

type EditorProps<T> = {
  draft: T;
  setDraft: Dispatch<SetStateAction<T | null>>;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (event: FormEvent) => void;
};

export function ProductEditor({ draft, setDraft, busy, error, onClose, onSave, categories, gstInclusive }: EditorProps<Product> & { categories: Category[]; gstInclusive: boolean }) {
  const change = (patch: Partial<Product>) => setDraft((current) => current ? { ...current, ...patch } : current);
  const wire = isWireProduct(draft, categories);
  const [imageError, setImageError] = useState('');
  const imageSection = useRef<HTMLElement>(null);
  const images = productImageSlots(draft);
  const setImage = (index: number, url: string) => {
    setDraft((current) => {
      if (!current) return current;
      const slots = productImageSlots(current);
      slots[index] = url;
      return { ...current, imageUrls: slots, imageUrl: slots[0] };
    });
    if (index === 0 && url) setImageError('');
  };
  const submit = (event: FormEvent) => {
    if (!images[0]) {
      event.preventDefault();
      setImageError('Upload the main product image before saving.');
      imageSection.current?.scrollIntoView({ block: 'center' });
      return;
    }
    setImageError('');
    onSave(event);
  };
  return (
    <AdminModal labelledBy="edit-product-title" busy={busy} onClose={onClose}>
      <form className="product-edit-modal catalog-editor" onSubmit={submit}>
        <header>
          <div><h2 id="edit-product-title">{draft.id ? 'Edit product' : 'Add product'}</h2><p>{draft.id ? 'Changes appear in the shop as soon as you save.' : 'Fill in the details customers will see.'}</p></div>
          <button type="button" aria-label="Close product editor" disabled={busy} onClick={onClose}>×</button>
        </header>
        <div className="catalog-editor-scroll" tabIndex={0} role="region" aria-label="Product details form">
        <fieldset className="catalog-editor-body" disabled={busy}>
          {error && <p className="admin-form-error" role="alert">{error}</p>}
          {!categories.length && <p className="admin-form-note">No categories available. Add a category in Categories first.</p>}
          <section className="editor-section">
            <h3>Product information</h3>
            <label><span>Product name *</span><input autoFocus required maxLength={200} value={draft.name} placeholder="e.g. Asian Paints Apcolite – White 1 L" onChange={(event) => change({ name: event.target.value })} /></label>
            <label className="product-category-field"><span>Category *</span><select name="categoryId" required disabled={!categories.length} value={draft.categoryId} onChange={(event) => change({ categoryId: event.target.value })}><option value="" disabled>Choose a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.enabled ? '' : ' (hidden)'}</option>)}</select></label>
            <label><span>Short description (Optional)</span><input maxLength={110} value={draft.short} placeholder="One line shown on the product card" onChange={(event) => change({ short: event.target.value })} /></label>
            <label><span>Full description (Optional)</span><textarea rows={4} value={draft.description} placeholder="Shown in product details" onChange={(event) => change({ description: event.target.value })} /></label>
            <label><span>Product color name (Optional)</span><input maxLength={80} value={draft.colorName ?? ''} placeholder="e.g. Red, Dark Red or Military Green" onChange={(event) => change({ colorName: event.target.value })} /><small>Enter the product's color as text. Shown under Color in product details for any category. No swatch or separate color stock is needed.</small></label>
          </section>
          <section className="editor-section">
            <h3>Pricing</h3>
            <div className="editor-columns">
              <label><span>Price (₹) *</span><input required disabled={Boolean(draft.variants?.length)} type="number" min="0" step="0.01" inputMode="decimal" value={Number.isFinite(draft.price) ? draft.price : ''} onChange={(event) => change({ price: event.target.valueAsNumber })} /><small>{draft.variants?.length ? 'The lowest color price is shown in the catalog. Set prices under Available colors.' : gstInclusive ? 'Enter the price including GST.' : 'GST is added at checkout.'}</small></label>
              <label><span>MRP / previous price (₹) <em>optional</em></span><input type="number" min="0" step="0.01" inputMode="decimal" value={draft.originalPrice || ''} placeholder="e.g. 1000" onChange={(event) => change({ originalPrice: event.target.value ? event.target.valueAsNumber : undefined })} /><small>A higher MRP shows a crossed-out price and a discount badge.</small></label>
            </div>
          </section>
          <section className="editor-section">
            <h3>Inventory</h3>
            <label><span>Stock quantity *</span><input required disabled={Boolean(draft.variants?.length)} type="number" min="0" step="1" inputMode="numeric" value={Number.isFinite(draft.stock) ? draft.stock : ''} onChange={(event) => change({ stock: event.target.valueAsNumber })} /><small>{draft.variants?.length ? 'Update individual color quantities below or in the Stock section.' : 'Reduces automatically when an order reserves this product.'}</small></label>
            <div className="editor-switches">
              <label className="editor-switch"><input type="checkbox" checked={draft.enabled} onChange={(event) => change({ enabled: event.target.checked })} /><span>Visible in shop</span></label>
              <label className="editor-switch danger"><input type="checkbox" checked={Boolean(draft.manualOutOfStock)} onChange={(event) => change({ manualOutOfStock: event.target.checked })} /><span>Mark out of stock</span></label>
            </div>
          </section>
          <section className="editor-section">
            <h3>Product details</h3>
            <label><span>HSN number (Optional)</span><input value={draft.hsn} placeholder="e.g. 3209" onChange={(event) => change({ hsn: event.target.value })} /></label>
          </section>
          <section className="editor-section">
            <h3>Features &amp; Specifications (Optional)</h3>
            <p className="admin-form-note">Add real product details such as brand, material, dimensions or warranty. These appear in a table below the product photo.</p>
            {(draft.specifications ?? []).map((entry, index) => <div className="product-specification-row" key={index}>
              <label><span>Feature {index + 1}</span><input required maxLength={80} value={entry.label} placeholder="e.g. Material" onChange={(event) => change({ specifications: draft.specifications!.map((item, position) => position === index ? { ...item, label: event.target.value } : item) })} /></label>
              <label><span>Value {index + 1}</span><input required maxLength={500} value={entry.value} placeholder="e.g. Copper" onChange={(event) => change({ specifications: draft.specifications!.map((item, position) => position === index ? { ...item, value: event.target.value } : item) })} /></label>
              <button type="button" aria-label={`Remove specification ${index + 1}`} onClick={() => change({ specifications: draft.specifications!.filter((_, position) => position !== index) })}>Remove</button>
            </div>)}
            <button type="button" className="product-editor-add" disabled={(draft.specifications?.length ?? 0) >= 40} onClick={() => change({ specifications: [...(draft.specifications ?? []), { label: '', value: '' }] })}>Add specification</button>
          </section>
          <section className="editor-section">
            <h3>{wire ? 'Available wire colors (Optional)' : 'Available colors (Optional)'}</h3>
            <p className="admin-form-note">Leave colors empty to sell this product using its normal price and stock.</p>
            {wire ? <WireColorFields variants={draft.variants ?? []} price={draft.price} onChange={(variants) => change({ variants })} /> : <>
            <label className="editor-switch"><input type="checkbox" checked={customShadesEnabled(draft)} onChange={(event) => change({ customShadeEnabled: event.target.checked })} /><span>Allow a custom shade / color code</span></label>
            <p className="admin-form-note">Enabled by default for Paints. Customers can enter a shade-card code alongside their selected color. The code appears in Orders; it does not change the listed price.</p>
            <p className="admin-form-note">Add only colors you sell. Each color has its own price and stock. Customers select a color before adding it to their cart.</p>
            {(draft.variants ?? []).map((variant, index) => <fieldset className="product-color-row" key={variant.id}>
              <legend>Color {index + 1}</legend>
              <div className="editor-columns">
                <label><span>Color name</span><input required maxLength={80} value={variant.name} placeholder="e.g. Blue" onChange={(event) => change({ variants: draft.variants!.map((item) => item.id === variant.id ? { ...item, name: event.target.value } : item) })} /></label>
                <label><span>Color swatch</span><input type="color" value={variant.color.length === 4 ? '#' + [...variant.color.slice(1)].map((character) => character.repeat(2)).join('') : variant.color} onChange={(event) => change({ variants: draft.variants!.map((item) => item.id === variant.id ? { ...item, color: event.target.value } : item) })} /></label>
                <label><span>Color price (₹)</span><input required type="number" min="0" step="0.01" value={Number.isFinite(variant.price) ? variant.price : ''} onChange={(event) => change({ variants: draft.variants!.map((item) => item.id === variant.id ? { ...item, price: event.target.valueAsNumber } : item) })} /></label>
                <label><span>Color stock</span><input required type="number" min="0" step="1" value={Number.isFinite(variant.stock) ? variant.stock : ''} onChange={(event) => change({ variants: draft.variants!.map((item) => item.id === variant.id ? { ...item, stock: event.target.valueAsNumber } : item) })} /></label>
              </div>
              <button type="button" aria-label={`Remove color ${index + 1}`} onClick={() => change({ variants: draft.variants!.filter((item) => item.id !== variant.id) })}>Remove color</button>
            </fieldset>)}
            <button type="button" className="product-editor-add" disabled={(draft.variants?.length ?? 0) >= 50} onClick={() => change({ variants: [...(draft.variants ?? []), { id: crypto.randomUUID(), name: '', color: '#000000', price: Number.isFinite(draft.price) ? draft.price : 0, stock: 0 }] })}>Add color</button>
            </>}
          </section>
          <section ref={imageSection} className="editor-section" aria-labelledby="product-images-title">
            <h3 id="product-images-title">Product images</h3>
            <p className="admin-form-note">Add up to four photos. Only the main product image is required. Additional photos are optional.</p>
            <div className={imageStyles.images}>{productImageLabels.map((label, index) => <div className={imageStyles.slot} key={index}>
              <ImageUpload variant="photo" label={label} required={index === 0} value={images[index]} onChange={(url) => setImage(index, url)} onReset={() => setImage(index, '')} />
            </div>)}</div>
            {imageError && <p role="alert" className="admin-form-error">{imageError}</p>}
          </section>
        </fieldset>
        </div>
        <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="admin-primary" disabled={busy || !categories.length}>{busy ? 'Saving…' : draft.id ? 'Save changes' : 'Add product'}</button></footer>
      </form>
    </AdminModal>
  );
}

export function CategoryEditor({ draft, setDraft, busy, error, onClose, onSave }: EditorProps<Category>) {
  return (
    <AdminModal labelledBy="category-form-title" busy={busy} onClose={onClose}>
      <form className="product-edit-modal catalog-editor category-editor" onSubmit={onSave}>
        <header><div><h2 id="category-form-title">{draft.id ? 'Edit category' : 'Add category'}</h2><p>Organise how customers browse your shop.</p></div><button type="button" disabled={busy} aria-label="Close category editor" onClick={onClose}>×</button></header>
        <div className="catalog-editor-scroll" tabIndex={0} role="region" aria-label="Category details form">
        <fieldset className="catalog-editor-body" disabled={busy}>
          {error && <p className="admin-form-error" role="alert">{error}</p>}
          <label><span>Category name</span><input autoFocus required maxLength={120} value={draft.name} placeholder="e.g. Bathroom Fittings" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <div className="editor-icon-field"><span id="category-icon-label">Icon</span><div className="category-icon-picker" role="group" aria-labelledby="category-icon-label">{categoryIconOptions.map((icon) => <button type="button" key={icon} aria-label={`${icon} icon`} aria-pressed={draft.icon === icon} onClick={() => setDraft({ ...draft, icon })}><CategoryIcon name={icon} /></button>)}</div></div>
          <label className="editor-switch"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span>Show in shop</span></label>
          <section className="editor-section"><h3>Category image <em>optional</em></h3><ImageUpload variant="photo" label="Category photo" value={draft.imageUrl} onChange={(imageUrl) => setDraft((current) => current ? { ...current, imageUrl } : current)} onReset={() => setDraft({ ...draft, imageUrl: '' })} /><details className="editor-image-url"><summary>Use an image URL instead</summary><label><span>Image URL</span><input value={draft.imageUrl || ''} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} /></label></details></section>
        </fieldset>
        </div>
        <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="admin-primary" disabled={busy}>{busy ? 'Saving…' : draft.id ? 'Save changes' : 'Add category'}</button></footer>
      </form>
    </AdminModal>
  );
}
