import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import React from 'react';
import load from './load-source.cjs';
const { OrderAlertTracker, OrderSoundPlayer, encodeSoundWav } = load('../lib/admin-order-sound.ts');
const { AdminOrderAlerts } = load('../components/admin/AdminOrderAlerts.tsx');
const { OrderSoundSettings } = load('../components/admin/OrderSoundSettings.tsx');
const { api } = load('../lib/api.ts');

function fakeAudio(t) {
  const previous = globalThis.window, previousDocument = globalThis.document;
  const sources = [], peaks = [];
  class Context {
    state = 'suspended'; currentTime = 0; destination = {}; onstatechange;
    async resume() { this.state = 'running'; this.onstatechange?.(); }
    async close() { this.state = 'closed'; }
    createOscillator() { return this.source('tone'); }
    createBufferSource() { return this.source('clip'); }
    source(kind) {
      const node = { kind, frequency: { setValueAtTime(value) { node.frequencyValue = value; } },
        connect() {}, disconnect() {}, start() { node.started = true; }, stop() { node.stops = (node.stops || 0) + 1; } };
      sources.push(node); return node;
    }
    createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime(value) { peaks.push(value); }, exponentialRampToValueAtTime(value) { peaks.push(value); } } }; }
    async decodeAudioData() { return { duration: 1 }; }
  }
  globalThis.window = { AudioContext: Context, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  return { sources, peaks };
}
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };

test('initial order history is silent and new IDs are deduplicated across polls, reorder and removal', () => {
  const tracker = new OrderAlertTracker();
  assert.deepEqual(tracker.observe([{ id: 'old' }]), []);
  assert.deepEqual(tracker.observe([{ id: 'new' }, { id: 'old' }, { id: 'new' }]), ['new']);
  assert.deepEqual(tracker.observe([{ id: 'old' }, { id: 'new' }]), []);
  tracker.observe([]);
  assert.deepEqual(tracker.observe([{ id: 'new' }, { id: 'newer' }]), ['newer']);
});

test('all four real tone patterns play only after activation and obey volume, mute and cleanup', async (t) => {
  const { sources, peaks } = fakeAudio(t);
  const player = new OrderSoundPlayer(); t.after(() => player.close());
  assert.equal(await player.play({ orderSound: 'chime' }), false); assert.equal(sources.length, 0);
  await player.unlock();
  const patterns = [];
  for (const sound of ['chime', 'bell', 'cash', 'ping']) {
    const before = sources.length;
    assert.equal(await player.play({ orderSound: sound, orderSoundVolume: 50 }), true);
    patterns.push(sources.slice(before).map((source) => source.frequencyValue).join(','));
  }
  assert.equal(new Set(patterns).size, 4);
  assert.ok(Math.max(...peaks) <= .09);
  const count = sources.length;
  assert.equal(await player.play({ orderSoundEnabled: false }), false);
  assert.equal(await player.play({ orderSoundVolume: 0 }), false);
  assert.equal(sources.length, count);
  assert.ok(sources.every((source) => source.started && source.stops));
});

test('custom sound loads from the saved URL, is cached and cannot start after logout', async (t) => {
  const { sources } = fakeAudio(t);
  const player = new OrderSoundPlayer(); t.after(() => player.close()); await player.unlock();
  const url = '/api/media/order-sounds/11111111-1111-4111-8111-111111111111.wav';
  const fetched = t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1, 2, 3])));
  assert.equal(await player.play({ orderSound: 'custom', orderSoundUrl: url, orderSoundVolume: 30 }), true);
  assert.equal(await player.play({ orderSound: 'custom', orderSoundUrl: url }), true);
  assert.equal(fetched.mock.calls.length, 1); assert.equal(fetched.mock.calls[0].arguments[0], url);
  assert.equal(sources.length, 2); assert.equal(sources[0].kind, 'clip');
  let finish;
  fetched.mock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const pending = player.play({ orderSound: 'custom', orderSoundUrl: url.replace('11111111', '22222222') });
  player.close(); finish(new Response(new Uint8Array([1])));
  assert.equal(await pending, false); assert.equal(sources.length, 2);
});

test('audio upload conversion preserves samples and rejects empty, long and oversized clips', async (t) => {
  fakeAudio(t);
  const buffer = { numberOfChannels: 1, length: 3, sampleRate: 8000, getChannelData: () => new Float32Array([-1, 0, 1]) };
  const wav = Buffer.from(encodeSoundWav(buffer));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(40), 6); assert.equal(wav.readInt16LE(44), -32768); assert.equal(wav.readInt16LE(48), 32767);
  assert.throws(() => encodeSoundWav({ ...buffer, length: 0 }));
  assert.throws(() => encodeSoundWav({ ...buffer, length: 8000 * 16 }));
  const player = new OrderSoundPlayer(); t.after(() => player.close());
  await assert.rejects(player.decodeUpload({ size: 6 * 1024 * 1024, type: 'audio/mpeg' }), /5 MB/);
  await assert.rejects(player.decodeUpload({ size: 100, type: 'image/png' }), /audio file/);
});

test('the existing admin API sends audio multipart with authentication and keeps JSON settings requests intact', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { requests.push({ url, init }); return new Response(JSON.stringify({ url: '/api/media/order-sounds/test.wav' }), { headers: { 'Content-Type': 'application/json' } }); });
  const body = new FormData(); body.append('file', new Blob(['wav'], { type: 'audio/wav' }), 'notification.wav');
  await api.admin('/order-sounds', 'test-token', { method: 'POST', body });
  assert.equal(requests[0].init.headers.get('Authorization'), 'Bearer test-token');
  assert.equal(requests[0].init.headers.has('Content-Type'), false, 'Browser must set the correct multipart boundary');
  assert.equal(requests[0].init.body, body);
  await api.admin('/configuration/shop', 'test-token', { method: 'PATCH', body: JSON.stringify({ orderSound: 'ping' }) });
  assert.equal(requests[1].init.headers.get('Content-Type'), 'application/json');
});

test('browser refusal to unlock audio remains silent and reports the failure', async (t) => {
  const { sources } = fakeAudio(t);
  t.mock.method(window.AudioContext.prototype, 'resume', async () => { throw new Error('Audio was blocked by the browser'); });
  const player = new OrderSoundPlayer(); t.after(() => player.close());
  await assert.rejects(player.unlock(), /blocked by the browser/);
  assert.equal(await player.play({ orderSound: 'bell' }), false); assert.equal(sources.length, 0);
});

function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) { const result = find(child, predicate); if (result) return result; }
}

test('sound settings test the selected volume and upload a clip before making it saveable', async (t) => {
  const states = [], refs = []; let cursor = 0, refCursor = 0;
  t.mock.method(React, 'useState', (initial) => { const index = cursor++; if (!(index in states)) states[index] = initial;
    return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; });
  t.mock.method(React, 'useRef', (initial) => { const index = refCursor++; return refs[index] ||= { current: initial }; });
  t.mock.method(React, 'useEffect', () => {});
  const tested = []; let finish, uploadedFile;
  t.mock.method(React, 'useContext', () => ({ test: async (value) => { tested.push(value); return true; },
    upload: (file) => { uploadedFile = file; return new Promise((resolve) => { finish = resolve; }); } }));
  const busy = [];
  const props = { value: { orderSound: 'cash', orderSoundVolume: 35 }, onChange: (patch) => { props.value = { ...props.value, ...patch }; }, onUploading: (value) => busy.push(value), toggle: null };
  const render = () => { cursor = 0; refCursor = 0; return OrderSoundSettings(props); };
  const testButton = () => find(render(), (node) => node.type === 'button' && String(node.props.children).includes('Play test'));
  await testButton().props.onClick(); assert.equal(tested[0].orderSound, 'cash'); assert.equal(tested[0].orderSoundVolume, 35);
  assert.ok(find(render(), (node) => node.props.role === 'status' && String(node.props.children).includes('Test sound played')));
  const file = new File(['test clip'], 'ring.mp3', { type: 'audio/mpeg' });
  const uploading = find(render(), (node) => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [file], value: 'file' } });
  assert.equal(uploadedFile, file); assert.deepEqual(busy, [true]);
  assert.equal(find(render(), (node) => node.type === 'input' && node.props.type === 'file').props.disabled, true);
  const url = '/api/media/order-sounds/11111111-1111-4111-8111-111111111111.wav'; finish(url); await uploading;
  assert.deepEqual(busy, [true, false]); assert.equal(props.value.orderSound, 'custom'); assert.equal(props.value.orderSoundUrl, url);
  assert.ok(find(render(), (node) => node.type === 'label' && React.Children.toArray(node.props.children).some((child) => child === 'My uploaded sound')));
});

test('admin monitor skips existing orders, plays once for a new order, respects mute and cancels polling on logout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = [], refs = [], effects = [];
  const cleanup = () => { for (const effect of effects) effect?.cleanup?.(); effects.length = 0; };
  t.after(cleanup);
  const { sources } = fakeAudio(t);
  let cursor = 0, refCursor = 0, effectCursor = 0, pending = [];
  t.mock.method(React, 'useState', (initial) => {
    const index = cursor++; if (!(index in state)) state[index] = initial;
    return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
  });
  t.mock.method(React, 'useRef', (initial) => { const index = refCursor++; return refs[index] ||= { current: initial }; });
  t.mock.method(React, 'useEffect', (effect, dependencies) => {
    const index = effectCursor++, previous = effects[index];
    if (!previous || dependencies.some((value, key) => !Object.is(value, previous.dependencies[key])))
      pending.push(() => { previous?.cleanup?.(); effects[index] = { dependencies, cleanup: effect() }; });
  });
  let orders = [{ id: 'old' }], enabled = true, arrivals = 0, count;
  const request = t.mock.method(api, 'admin', async () => ({ orders, activeOrders: orders.length,
    sound: { orderSound: 'chime', orderSoundVolume: 70, orderSoundEnabled: enabled } }));
  const props = { token: 'test-token', onCount: (value) => { count = value; }, onOrders() {}, onArrival() { arrivals++; }, children: null };
  const render = () => { cursor = 0; refCursor = 0; effectCursor = 0; pending = []; const tree = AdminOrderAlerts(props); for (const effect of pending) effect(); return tree; };
  render(); await flush();
  assert.equal(sources.length, 0); assert.equal(count, 1);
  const status = render().props.value.status;
  const enable = React.Children.toArray(status.props.children).find((node) => node.type === 'button');
  enable.props.onClick(); await flush(); render();
  orders = [{ id: 'old' }, { id: 'new' }];
  t.mock.timers.tick(5000); await flush(); render();
  assert.equal(arrivals, 1); assert.equal(count, 2); assert.equal(sources.length, 3);
  t.mock.timers.tick(5000); await flush(); render();
  assert.equal(arrivals, 1); assert.equal(sources.length, 3);
  enabled = false; orders = [...orders, { id: 'muted-order' }];
  t.mock.timers.tick(5000); await flush(); render();
  assert.equal(arrivals, 2); assert.equal(sources.length, 3);
  enabled = true;
  t.mock.timers.tick(5000); await flush(); render();
  assert.equal(sources.length, 3); // Re-enabling does not replay previously observed orders.
  const calls = request.mock.calls.length; cleanup();
  t.mock.timers.tick(20000); await flush(); assert.equal(request.mock.calls.length, calls);
});
