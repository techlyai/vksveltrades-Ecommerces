'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, assetUrl } from '../../lib/api';
import type { PaintShade } from '../../lib/types';
import { AdminModal } from '../AdminModal';
import { ImageUpload } from '../ImageUpload';
import styles from './PaintShadeManager.module.css';

const blankShade = (): PaintShade => ({ id: '', name: '', code: '', brand: 'Birla Opus', family: 'Whites and Neutrals', color: '#f5f3e8', enabled: true });
const pageSize = 24;

export function PaintShadeManager({ token, onChanged }: { token: string; onChanged: () => void }) {
  const [shades, setShades] = useState<PaintShade[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState<PaintShade | null>(null);
  useEffect(() => {
    let active = true;
    setError('');
    api.admin<PaintShade[]>('/paint-shades', token).then((rows) => { if (active) setShades(rows); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load paint shades'); });
    return () => { active = false; };
  }, [token, retry]);
  const key = query.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const filtered = (shades ?? []).filter((shade) => `${shade.name} ${shade.code} ${shade.brand} ${shade.family}`.toLowerCase().replace(/[^a-z0-9]/g, '').includes(key));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const open = (shade: PaintShade) => { setNotice(''); setDraft({ ...shade }); };
  return <section className={styles.manager}>
    <div className={styles.heading}><div><h2>Paint shade card</h2><p>Add or edit shade numbers, colors and photos. Saved changes appear on products that allow custom shades.</p></div>
      <button type="button" className="admin-primary" disabled={!shades} onClick={() => open(blankShade())}>Add shade</button>
    </div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {error && <p role="alert" className="admin-error">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry shades</button></p>}
    {!shades && !error && <p role="status">Loading paint shades…</p>}
    {shades && <>
      <label className={styles.search}><span>Search admin shades</span><input type="search" placeholder="Shade name, number, brand or family" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
      <p className={styles.count}>{filtered.length} shades · {shades.filter((shade) => shade.enabled).length} visible to customers</p>
      <div className={styles.grid}>{filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((shade) => <article key={shade.id}>
        <div className={styles.preview} style={{ backgroundColor: shade.color }}>{shade.imageUrl && <img key={shade.imageUrl} src={assetUrl(shade.imageUrl)} alt={`${shade.name} shade`} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}</div>
        <div className={styles.info}><strong>{shade.name}</strong><span>{shade.code} · {shade.brand}</span><small>{shade.family}</small><em>{shade.enabled ? 'Visible' : 'Hidden'}</em></div>
        <button type="button" aria-label={`Edit ${shade.name}, ${shade.code}`} onClick={() => open(shade)}>Edit shade</button>
      </article>)}</div>
      {!filtered.length && <p>No matching shades. Try another search or add a shade.</p>}
      {pages > 1 && <nav className={styles.pagination} aria-label="Shade pages"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pages}</span><button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
    </>}
    {draft && <ShadeEditor key={draft.id || 'new'} shade={draft} families={[...new Set((shades ?? []).map((shade) => shade.family))]} onClose={() => setDraft(null)} onSave={async (value) => {
      const { id, ...body } = value;
      const saved = await api.admin<PaintShade>(id ? `/paint-shades/${encodeURIComponent(id)}` : '/paint-shades', token, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      setShades((current) => id ? (current ?? []).map((shade) => shade.id === id ? saved : shade) : [saved, ...(current ?? [])]);
      setDraft(null); setNotice(`${saved.name} saved. ${saved.enabled ? 'Available in the customer shade picker.' : 'Hidden from the customer shade picker.'}`);
      onChanged();
    }} />}
  </section>;
}

function ShadeEditor({ shade, families, onClose, onSave }: { shade: PaintShade; families: string[]; onClose: () => void; onSave: (shade: PaintShade) => Promise<void> }) {
  const [draft, setDraft] = useState(shade);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof PaintShade, value: string | boolean) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (`${draft.brand.trim()} / ${draft.code.trim()} / ${draft.name.trim()}`.length > 80) {
      setError('Brand, shade code and name together must fit within 80 characters.'); return;
    }
    setBusy(true);
    try { await onSave(draft); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save shade'); }
    finally { setBusy(false); }
  };
  return <AdminModal busy={busy} onClose={onClose} labelledBy="shade-editor-title"><form className={styles.editor} onSubmit={submit}>
    <header><h2 id="shade-editor-title">{shade.id ? 'Edit paint shade' : 'Add paint shade'}</h2><button type="button" aria-label="Close shade editor" disabled={busy} onClick={onClose}>×</button></header>
    <fieldset disabled={busy}>
      <div className={styles.fields}>
        <label><span>Shade name</span><input required maxLength={50} value={draft.name} onChange={(event) => set('name', event.target.value)} /></label>
        <label><span>Shade number / code</span><input required maxLength={30} value={draft.code} onChange={(event) => set('code', event.target.value)} placeholder="e.g. WW 0029" /></label>
        <label><span>Paint brand</span><input required maxLength={30} value={draft.brand} onChange={(event) => set('brand', event.target.value)} /></label>
        <label><span>Shade color family</span><input required maxLength={50} list="shade-families" value={draft.family} onChange={(event) => set('family', event.target.value)} /><datalist id="shade-families">{families.map((family) => <option key={family} value={family} />)}</datalist></label>
        <label><span>Preview color</span><input type="color" value={draft.color} onChange={(event) => set('color', event.target.value)} /><small>Used when no shade photo is uploaded.</small></label>
        <label className={styles.toggle}><input type="checkbox" checked={draft.enabled} onChange={(event) => set('enabled', event.target.checked)} /><span>Show this shade to customers</span></label>
      </div>
      <ImageUpload label="Shade color image" variant="photo" value={draft.imageUrl} onChange={(url) => set('imageUrl', url)} onReset={() => set('imageUrl', '')} />
    </fieldset>
    <p className={styles.help}>Customers can select this shade or type their own code. Previous orders keep the shade details saved at checkout.</p>
    {error && <p role="alert" className="admin-error">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="admin-primary" disabled={busy}>{busy ? 'Saving shade…' : 'Save shade'}</button></footer>
  </form></AdminModal>;
}
