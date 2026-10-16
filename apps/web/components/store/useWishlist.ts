'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { updateWishlist, wishlistKey } from '../../lib/wishlist';

export function useWishlist() {
  const [ids, setIds] = useState<string[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const key = useRef('');
  const active = useRef(false);
  const mutations = useRef(new Set<string>());
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    if (mutations.current.size) return;
    const request = ++revision.current;
    try {
      key.current = wishlistKey(window.localStorage, window.crypto);
      const result = await api.wishlist(key.current);
      if (active.current && request === revision.current) {
        setIds(result.productIds); setReady(true); setError('');
      }
    } catch {
      if (active.current && request === revision.current) setError('Wishlist could not be loaded. Check your connection and allow browser storage, then retry.');
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void refresh();
    const focus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => { active.current = false; revision.current++; window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [refresh]);

  const toggle = async (id: string) => {
    if (!ready || mutations.current.has(id)) return;
    const saved = !ids.includes(id);
    mutations.current.add(id); revision.current++;
    setPending([...mutations.current]); setError('');
    try {
      await api.saveWishlist(key.current, id, saved);
      if (active.current) setIds((current) => updateWishlist(current, id, saved));
    } catch (error) {
      if (active.current) setError(error instanceof Error ? error.message : 'Wishlist could not be saved. Please try again.');
    } finally {
      mutations.current.delete(id);
      if (active.current) setPending([...mutations.current]);
    }
  };

  return { ids, pending, ready, error, refresh, toggle };
}
