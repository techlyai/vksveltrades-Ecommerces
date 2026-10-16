export const WISHLIST_KEY = 'vks-wishlist-key';

export function wishlistKey(storage: Pick<Storage, 'getItem' | 'setItem'>, crypto: Pick<Crypto, 'getRandomValues'>) {
  const existing = storage.getItem(WISHLIST_KEY);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  storage.setItem(WISHLIST_KEY, key);
  return key;
}

export function updateWishlist(ids: string[], id: string, saved: boolean) {
  return saved ? Array.from(new Set([...ids, id])) : ids.filter((item) => item !== id);
}
