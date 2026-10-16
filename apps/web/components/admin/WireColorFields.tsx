'use client';

import type { Variant } from '../../lib/types';
import { wireColorPresets } from '../../lib/wire-colors';
import styles from './WireColorManager.module.css';

export function WireColorFields({ variants, price, onChange }: {
  variants: Variant[]; price: number; onChange: (variants: Variant[]) => void;
}) {
  const add = (name = '', color = '#202124') => onChange([...variants, {
    id: crypto.randomUUID(), name, color, price: Number.isFinite(price) ? price : 0, stock: 0,
  }]);
  const update = (id: string, patch: Partial<Variant>) => onChange(variants.map((variant) => variant.id === id ? { ...variant, ...patch } : variant));
  return <div className={styles.fields}>
    <p>Choose presets or add your own color. Set the price and actual stock for each color you sell. New colors start with zero stock.</p>
    <div className={styles.presets} role="group" aria-label="Wire color presets">
      {wireColorPresets.map((preset) => <button key={preset.name} type="button"
        disabled={variants.length >= 50 || variants.some((variant) => variant.name.trim().toLowerCase() === preset.name.toLowerCase())}
        onClick={() => add(preset.name, preset.color)}><i aria-hidden="true" style={{ background: preset.color }} />{preset.name}</button>)}
    </div>
    {variants.map((variant, index) => <fieldset key={variant.id} className={styles.colorRow}>
      <legend>Wire color {index + 1}</legend>
      <div className={styles.inputs}>
        <label><span>Color name {index + 1}</span><input required maxLength={80} value={variant.name} onChange={(event) => update(variant.id, { name: event.target.value })} /></label>
        <label><span>Color swatch {index + 1}</span><input type="color" value={variant.color.length === 4 ? '#' + [...variant.color.slice(1)].map((character) => character.repeat(2)).join('') : variant.color} onChange={(event) => update(variant.id, { color: event.target.value })} /></label>
        <label><span>Color price {index + 1} (₹)</span><input required type="number" min="0" step="0.01" value={Number.isFinite(variant.price) ? variant.price : ''} onChange={(event) => update(variant.id, { price: event.target.valueAsNumber })} /></label>
        <label><span>Color stock {index + 1}</span><input required type="number" min="0" step="1" value={Number.isFinite(variant.stock) ? variant.stock : ''} onChange={(event) => update(variant.id, { stock: event.target.valueAsNumber })} /></label>
      </div>
      <button type="button" onClick={() => onChange(variants.filter((item) => item.id !== variant.id))}>Remove {variant.name || `color ${index + 1}`}</button>
    </fieldset>)}
    <button type="button" className="product-editor-add" disabled={variants.length >= 50} onClick={() => add()}>Add custom wire color</button>
  </div>;
}
