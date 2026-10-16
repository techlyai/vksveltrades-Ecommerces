'use client';

import { createContext, ReactNode, useContext, useEffect, useId, useRef, useState } from 'react';
import { API, assetUrl, shopLogoUrl } from '../lib/api';

const UploadContext = createContext({ token: '', changePending: (_amount: number) => {} });

export function ImageUploadProvider({ token, children }: { token: string; children: ReactNode }) {
  const [pending, setPending] = useState(0);
  return (
    <UploadContext.Provider value={{ token, changePending: (amount) => setPending((count) => count + amount) }}>
      <div className="upload-scope" onSubmitCapture={(event) => {
        if (pending > 0) { event.preventDefault(); event.stopPropagation(); }
      }}>
        {children}
      </div>
    </UploadContext.Provider>
  );
}

export function ImageUpload({ label, value, onChange, variant, onReset, required = false }: {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  variant?: 'logo' | 'photo';
  onReset?: () => void;
  required?: boolean;
}) {
  const { token, changePending } = useContext(UploadContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const helpId = useId();
  useEffect(() => () => controller.current?.abort(), []);
  const picker = (
    <input
      ref={fileInput}
      hidden={Boolean(variant)}
      aria-label={label}
      aria-describedby={helpId}
      aria-required={required || undefined}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      disabled={busy}
      onChange={async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setError('');
        if (file.size > 5 * 1024 * 1024) {
          setError('Choose an image up to 5 MB.');
          return;
        }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          setError('Choose a JPEG, PNG or WebP image.');
          return;
        }
        const request = new AbortController();
        controller.current = request;
        setBusy(true);
        changePending(1);
        try {
          const body = new FormData();
          body.append('file', file);
          const response = await fetch(`${API}/admin/uploads`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body,
            signal: request.signal,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'Upload failed');
          onChange(result.url);
        } catch (reason) {
          if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : 'Upload failed');
        } finally {
          changePending(-1);
          if (!request.signal.aborted) setBusy(false);
        }
      }}
    />
  );
  const help = <small id={helpId} role="status">{busy ? 'Uploading photo… Please wait before saving.' : 'JPEG, PNG or WebP · up to 5 MB. Save changes to publish.'}</small>;
  if (variant === 'logo' || variant === 'photo') {
    return (
      <div className="shop-logo-upload" data-variant={variant} aria-busy={busy} role="group" aria-label={label}>
        <div className="shop-logo-preview">
          {value || variant === 'logo' ? <img src={variant === 'logo' ? shopLogoUrl(value) : assetUrl(value)} alt={`${label} preview`} /> : <span>No photo</span>}
        </div>
        <div className="shop-logo-controls">
          <strong>{variant === 'logo' ? 'Shop logo' : label}{required && <span aria-hidden="true"> *</span>}</strong>
          <p>{variant === 'logo' ? 'Shown in your storefront and admin panel.' : 'Upload a clear photo. Images are resized automatically.'}</p>
          <div className="shop-logo-actions">
            <button type="button" className="shop-logo-upload-button" disabled={busy} aria-describedby={helpId} onClick={() => fileInput.current?.click()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></svg>
              {busy ? 'Uploading…' : variant === 'logo' ? (value ? 'Replace logo' : 'Upload logo') : (value ? 'Replace image' : 'Upload image')}
            </button>
            {onReset && (variant === 'logo' || value) && <button type="button" disabled={busy} onClick={onReset}>{variant === 'logo' ? 'Use default' : 'Remove image'}</button>}
          </div>
          {picker}
          {help}
          {error && <p className="admin-error" role="alert">{error}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="image-upload wide">
      {value && <img src={assetUrl(value)} alt={`${label} preview`} />}
      <label>
        <span>{label}</span>
        {picker}
        {help}
      </label>
      {error && <p className="admin-error" role="alert">{error}</p>}
    </div>
  );
}
