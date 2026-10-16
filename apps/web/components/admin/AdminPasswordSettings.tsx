'use client';

import { FormEvent, useRef, useState } from 'react';
import { api } from '../../lib/api';
import styles from './AdminPasswordSettings.module.css';

export function AdminPasswordSettings({ token, username, onChanged }: { token: string; username: string; onChanged: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    if (newPassword.length < 12 || newPassword.length > 128 || !newPassword.trim()) {
      setError('Use a new password between 12 and 128 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('Choose a different new password.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await api.changePassword(token, { currentPassword, newPassword, confirmPassword });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to change password. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return <form className={`settings-manager ${styles.form}`} onSubmit={submit} aria-labelledby="admin-password-heading">
    <section className="admin-panel settings-card">
      <h2 id="admin-password-heading">Change password</h2>
      <p>Enter your current password and choose a new one. All admin sessions will be signed out after saving.</p>
      <input type="hidden" name="username" autoComplete="username" value={username} />
      <fieldset disabled={busy} className={styles.fields}>
        <div className="settings-fields two">
          <label className="wide"><span>Current password</span>
            <input name="currentPassword" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={1024} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
          <label><span>New password</span>
            <input name="newPassword" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="admin-password-help" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </label>
          <label><span>Confirm new password</span>
            <input name="confirmPassword" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </label>
        </div>
        <p id="admin-password-help" className={styles.help}>Use 12–128 characters. A long, unique passphrase works well.</p>
        <label className={styles.visibility}><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /> Show passwords</label>
        {error && <p role="alert" className="admin-error">{error}</p>}
        <button type="submit" className="admin-primary" disabled={busy}>{busy ? 'Changing password…' : 'Change password'}</button>
      </fieldset>
    </section>
  </form>;
}
