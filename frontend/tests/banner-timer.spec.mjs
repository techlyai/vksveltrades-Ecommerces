import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { scheduleBannerAdvance } from '../lib/banner-timer.ts';

test('banner advances at two seconds and wraps from last slide to first', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let index = 12;
  scheduleBannerAdvance(() => { index = (index + 1) % 13; });
  t.mock.timers.tick(1999);
  assert.equal(index, 12);
  t.mock.timers.tick(1);
  assert.equal(index, 0);
});

test('banner cleanup cancels rotation while interacting or unmounting', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const cancel = scheduleBannerAdvance(() => { calls++; });
  cancel();
  t.mock.timers.tick(2000);
  assert.equal(calls, 0);
});
