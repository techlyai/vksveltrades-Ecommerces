'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { OrderSoundSettings as Settings } from '../../lib/admin-order-sound';
import { useAdminOrderSound } from './AdminOrderAlerts';

export function OrderSoundSettings({ value, onChange, onUploading, toggle }: {
  value: Settings; onChange: (patch: Settings) => void; onUploading: (busy: boolean) => void; toggle: ReactNode;
}) {
  const sound = useAdminOrderSound();
  const picker = useRef<HTMLInputElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => () => request.current?.abort(), []);
  return <section className="admin-panel settings-card">
    <h2><i>♧</i> Order notification sound</h2>
    <div className="delivery-free"><span><b>Play sound for new orders</b><small>While the admin panel is open.</small></span>
      {toggle}
    </div>
    <div className="sound-options">
      {[['chime', 'Chime'], ['bell', 'Shop bell'], ['cash', 'Cash counter'], ['ping', 'Soft ping'], ...(value.orderSoundUrl ? [['custom', 'My uploaded sound']] : [])].map(([id, label]) =>
        <label className={(value.orderSound || 'chime') === id ? 'active' : ''} key={id}>
          <input type="radio" name="order-sound" checked={(value.orderSound || 'chime') === id} onChange={() => onChange({ orderSound: id })} />{label}
        </label>)}
    </div>
    <label className="volume"><span>Volume ({value.orderSoundVolume ?? 70}%)</span><input type="range" min="0" max="100" value={value.orderSoundVolume ?? 70}
      onChange={(event) => onChange({ orderSoundVolume: Number(event.target.value) })} /></label>
    <div className="sound-actions">
      <button type="button" disabled={testing || uploading} onClick={async () => {
        setTesting(true); setError(''); setMessage('');
        try { const played = await sound.test(value); setMessage(played ? 'Test sound played. Save changes to use these settings for new orders.' : 'Volume is 0. Increase it to hear the test sound.'); }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not play sound.'); }
        finally { setTesting(false); }
      }}>{testing ? 'Playing…' : '▷ Play test sound'}</button>
      <button type="button" disabled={uploading || testing} onClick={() => picker.current?.click()}>{uploading ? 'Uploading…' : '⇧ Upload my own sound'}</button>
      {value.orderSoundUrl && <button type="button" disabled={uploading} onClick={() => onChange({ orderSound: 'chime', orderSoundUrl: '' })}>Use built-in sound</button>}
    </div>
    <input ref={picker} type="file" hidden disabled={uploading || testing} accept="audio/*,.mp3,.wav,.ogg,.m4a" aria-label="Upload notification sound" onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      const controller = new AbortController(); request.current = controller;
      setUploading(true); onUploading(true); setError(''); setMessage('');
      try {
        const url = await sound.upload(file, controller.signal);
        if (!controller.signal.aborted) { onChange({ orderSound: 'custom', orderSoundUrl: url }); setMessage('Sound uploaded. Save changes to enable it for new orders.'); }
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Upload failed.'); }
      finally { if (!controller.signal.aborted) { setUploading(false); onUploading(false); } }
    }} />
    <p className="settings-note">MP3, WAV or another audio format supported by your browser · up to 5 MB and 15 seconds. Click Enable order sounds once per admin session. Save changes to apply the selected sound, volume and switch.</p>
    {message && <p role="status" className="settings-note">{message}</p>}
    {error && <p role="alert" className="admin-error">{error}</p>}
  </section>;
}
