'use client';

import { useState } from 'react';
import { filterPaintShades, findPaintShade, paintShades, type PaintShade } from '../../lib/paint-shades';
import { assetUrl } from '../../lib/api';
import { ShopIcon } from '../ShopIcon';
import styles from './PaintShadePicker.module.css';

export function PaintShadePicker({ value, onChange, card = paintShades }: { value: string; onChange: (code: string) => void; card?: PaintShade[] }) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('all');
  const selected = findPaintShade(value, card);
  const available = card.filter((shade) => shade.enabled);
  const shadeFamilies = [...new Set(available.map((shade) => shade.family))];
  const shades = filterPaintShades(query, shadeFamilies.includes(family) ? family : 'all', card);
  return <section className={styles.picker} aria-labelledby="paint-shades-title">
    <div className={styles.heading}><div><h3 id="paint-shades-title">Choose a paint shade</h3><p>Choose a color or enter your shade number</p></div><span>{available.length} shades</span></div>
    <div className={styles.filters}>
      <label><span>Search shade name or code</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Jasmine or WW 0029" autoComplete="off" /></label>
      <label><span>Color family</span><select aria-label="Color family" value={shadeFamilies.includes(family) ? family : 'all'} onChange={(event) => setFamily(event.target.value)}><option value="all">All shades</option>{shadeFamilies.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
    </div>
    <p className={styles.count} role="status">{shades.length} {shades.length === 1 ? 'shade' : 'shades'} found</p>
    <div className={styles.grid} role="group" aria-label="Paint shades">
      {shades.map((shade) => <button type="button" key={shade.id} aria-label={`${shade.name}, ${shade.code}`} aria-pressed={selected?.id === shade.id} onClick={() => onChange(shade.code)}>
        <span className={styles.swatch} style={{ backgroundColor: shade.color }} aria-hidden="true">{shade.imageUrl && <img key={shade.imageUrl} src={assetUrl(shade.imageUrl)} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
        <span className={styles.name}>{shade.name}</span><span className={styles.code}>{shade.code}{selected?.code === shade.code && <ShopIcon name="check" />}</span>
      </button>)}
    </div>
    {!shades.length && <p className={styles.empty}>No matching shade. Try another name or code, choose All shades, or enter your own code below.</p>}
    {selected && <div className={styles.selected} aria-live="polite"><i style={{ backgroundColor: selected.color }} aria-hidden="true">{selected.imageUrl && <img key={selected.imageUrl} src={assetUrl(selected.imageUrl)} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}</i><div><small>Selected paint shade</small><strong>{selected.name}</strong><span>{selected.code} · {selected.brand}</span></div><button type="button" onClick={() => onChange('')} aria-label="Clear selected paint shade"><ShopIcon name="close" /></button></div>}
    <div className={`${styles.filters} ${styles.editCode}`}>
      <label htmlFor="custom-shade-code"><span>Custom shade / color code (editable)</span>
        <input id="custom-shade-code" type="text" maxLength={80} value={value} placeholder="Enter or edit the shade number" autoComplete="off" aria-describedby="custom-shade-help" onChange={(event) => onChange(event.target.value.replace(/[\u0000-\u001f\u007f]/g, ''))} />
      </label>
      <small id="custom-shade-help">Optional. Select a swatch to fill the code, or edit it for your order. A matching code shows its shade automatically. Any extra shade charge will be discussed separately.</small>
      {value.trim() && !selected && <p className={styles.custom} aria-live="polite">Your custom shade code: <strong>{value.trim()}</strong></p>}
    </div>
    <p className={styles.note}>Screen colors are approximate. Confirm the shade and suitability for this paint with the shop before mixing.</p>
  </section>;
}
