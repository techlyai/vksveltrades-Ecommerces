import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import { wishlistKey, updateWishlist, WISHLIST_KEY } from '../lib/wishlist.ts';

test('wishlist browser key persists over reloads without containing customer information', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  const first = wishlistKey(storage, webcrypto);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(wishlistKey(storage, webcrypto), first);
  assert.equal(data.get(WISHLIST_KEY), first);
  data.clear();
  assert.notEqual(wishlistKey(storage, webcrypto), first);
});

test('invalid old keys are replaced and blocked storage does not claim persistence', () => {
  let stored;
  const storage = { getItem: () => 'invalid', setItem: (_key, value) => { stored = value; } };
  assert.equal(wishlistKey(storage, webcrypto), stored);
  assert.throws(() => wishlistKey({ getItem: () => null, setItem: () => { throw new Error('Blocked'); } }, webcrypto), /Blocked/);
});

test('wishlist toggles are idempotent and retain other saved items', () => {
  assert.deepEqual(updateWishlist(['one'], 'two', true), ['one', 'two']);
  assert.deepEqual(updateWishlist(['one', 'two'], 'two', true), ['one', 'two']);
  assert.deepEqual(updateWishlist(['one', 'two'], 'one', false), ['two']);
  assert.deepEqual(updateWishlist(['two'], 'two', false), []);
});
