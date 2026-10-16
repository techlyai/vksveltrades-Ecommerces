import { strict as assert } from 'node:assert';
import { test, after } from 'node:test';
import { Module } from 'node:module';
import React from 'react';
import load from './load-source.cjs';

const previousCss = Module._extensions['.css'];
Module._extensions['.css'] = (module) => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) }; };
after(() => { if (previousCss) Module._extensions['.css'] = previousCss; else delete Module._extensions['.css']; });
const { BannerCarousel } = load('../components/store/BannerCarousel.tsx');

function setup(t, { reducedMotion = false, autoSlide = true, count = 3 } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const state = [], refs = [], effects = [], images = [];
  let cursor = 0, refCursor = 0, effectCursor = 0, scheduled = [];
  const previousWindow = globalThis.window;
  globalThis.window = {
    Image: class { set src(value) { images.push(value); } },
    matchMedia: () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }),
  };
  t.mock.method(React, 'useState', (initial) => {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
  });
  t.mock.method(React, 'useRef', (initial) => {
    const index = refCursor++;
    return refs[index] ||= { current: initial };
  });
  t.mock.method(React, 'useEffect', (effect, dependencies) => {
    const index = effectCursor++;
    const previous = effects[index];
    if (!previous || dependencies.some((value, key) => !Object.is(value, previous.dependencies[key]))) {
      scheduled.push(() => { previous?.cleanup?.(); effects[index] = { dependencies, cleanup: effect() }; });
    }
  });
  const props = {
    catalog: {
      shop: { bannerAutoSlide: autoSlide, bannerInterval: 2 }, categories: [],
      banners: [
        { id: 'one', imageUrl: '/banners/finolex.jpeg', duration: 2 },
        { id: 'two', imageUrl: '/banners/astral.jpeg', duration: 2 },
        { id: 'three', imageUrl: '/banners/ramco.jpeg', duration: 2 },
      ].slice(0, count),
    }, onCategory() {}, onOrders() {},
  };
  const render = () => {
    cursor = 0; refCursor = 0; effectCursor = 0; scheduled = [];
    const tree = BannerCarousel(props);
    for (const effect of scheduled) effect();
    return tree;
  };
  t.after(() => {
    for (const effect of effects) effect?.cleanup?.();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  });
  return { render, props, images };
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}
const slide = (tree) => find(tree, (node) => node.props['aria-roledescription'] === 'slide').props['aria-label'];

test('carousel changes every two seconds, preloads the corrected next photo, and wraps', (t) => {
  const { render, props, images } = setup(t);
  const first = render();
  assert.equal(slide(first), '1 of 3');
  assert.equal(first.props.onMouseEnter, undefined); // Passive pointer placement no longer stalls rotation.
  assert.deepEqual(images, ['/banners/astral-transparent.webp']);
  t.mock.timers.tick(1000);
  props.catalog = { ...props.catalog, banners: props.catalog.banners.map((banner) => ({ ...banner })) };
  render(); // A catalog refresh must not restart the timer.
  t.mock.timers.tick(999); assert.equal(slide(render()), '1 of 3');
  t.mock.timers.tick(1); assert.equal(slide(render()), '2 of 3');
  assert.equal(images.at(-1), '/banners/ramco.jpeg');
  t.mock.timers.tick(2000); assert.equal(slide(render()), '3 of 3');
  t.mock.timers.tick(2000); assert.equal(slide(render()), '1 of 3');
});

test('keyboard focus and touch hold pause independently, then resume with swipe support', (t) => {
  const { render } = setup(t);
  let tree = render();
  tree.props.onFocusCapture(); tree = render();
  t.mock.timers.tick(3000); assert.equal(slide(render()), '1 of 3');
  tree.props.onTouchStart({ touches: [{ clientX: 200 }] }); tree = render();
  tree.props.onTouchCancel(); tree = render();
  t.mock.timers.tick(3000); assert.equal(slide(render()), '1 of 3'); // Focus still holds pause.
  tree.props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null });
  tree = render(); t.mock.timers.tick(2000); tree = render();
  assert.equal(slide(tree), '2 of 3');
  tree.props.onTouchStart({ touches: [{ clientX: 200 }] }); tree = render();
  t.mock.timers.tick(3000); assert.equal(slide(render()), '2 of 3');
  tree.props.onTouchEnd({ changedTouches: [{ clientX: 100 }] }); tree = render();
  assert.equal(slide(tree), '3 of 3');
  t.mock.timers.tick(2000); assert.equal(slide(render()), '1 of 3');
});

for (const options of [{ reducedMotion: true }, { autoSlide: false }, { count: 1 }]) {
  test(`carousel does not auto-advance when ${JSON.stringify(options)}`, (t) => {
    const { render } = setup(t, options);
    render();
    const initial = slide(render()); // Flush preference state from the mount effect.
    t.mock.timers.tick(10000);
    assert.equal(slide(render()), initial);
  });
}

test('department banners show an accent headline, brand chips, a photo cluster and a muted looping video', (t) => {
  const { render, props } = setup(t, { count: 2 });
  props.catalog.banners[0] = { ...props.catalog.banners[0], title: 'Electrical Products', brands: [' Polycab', '', 'Philips '],
    imageUrl: '/banners/finolex.jpeg', gallery: ['/banners/surya.jpeg', '', '/banners/polycab.jpeg', '/banners/leo.jpeg'] };
  props.catalog.banners[1] = { ...props.catalog.banners[1], title: 'Paints & Finishing', brands: [],
    imageUrl: '/banners/paints-poster.jpg', videoUrl: '/banners/paints.mp4' };
  let tree = render();
  const headline = find(tree, (node) => node.props.title === 'Electrical Products');
  const heading = headline.type(headline.props); // Render the small Headline component.
  assert.equal(find(heading, (node) => node.type === 'em').props.children, 'Electrical');
  const chips = find(tree, (node) => node.props.className === 'bannerBrands');
  assert.deepEqual(React.Children.toArray(find(chips, (node) => node.type === 'ul').props.children).map((chip) => find(chip, (node) => node.type === 'img')?.props.alt || chip.props.children), ['Polycab', 'Philips']);
  const cluster = find(tree, (node) => typeof node.props.className === 'string' && node.props.className.startsWith('bannerCluster'));
  const photos = [];
  (function walk(node) { if (!node || typeof node !== 'object') return; if (node.type === 'img') photos.push(node.props.src); React.Children.toArray(node.props?.children).forEach(walk); })(cluster);
  assert.deepEqual(photos, ['/banners/finolex.jpeg', '/banners/surya.jpeg', '/banners/polycab.jpeg']); // At most two extra cards.
  assert.equal(find(tree, (node) => node.type === 'video'), undefined);
  t.mock.timers.tick(2000); tree = render();
  assert.equal(find(tree, (node) => node.props.className === 'bannerBrands'), undefined); // No empty brand row.
  const video = find(tree, (node) => node.type === 'video');
  assert.equal(video.props.src, '/banners/paints.mp4');
  assert.equal(video.props.poster, '/banners/paints-poster.jpg');
  assert.ok(video.props.muted && video.props.loop && video.props.playsInline && video.props.autoPlay);
});

test('reduced motion keeps the paint video paused on its poster frame', (t) => {
  const { render, props } = setup(t, { reducedMotion: true, count: 1 });
  props.catalog.banners[0] = { ...props.catalog.banners[0], videoUrl: '/banners/paints.mp4', imageUrl: '/banners/paints-poster.jpg' };
  render();
  assert.equal(find(render(), (node) => node.type === 'video').props.autoPlay, false);
});

test('plumbing banner blends the cut-out tanks without a card and shows official logos with text fallback', (t) => {
  const { render, props } = setup(t, { count: 1 });
  props.catalog.shop = { ...props.catalog.shop, logoUrl: '/api/media/uploads/missing.webp' };
  props.catalog.banners[0] = { ...props.catalog.banners[0], title: 'Plumbing Products', categoryId: 'plumbing', cutout: true,
    imageUrl: '/banners/astral.jpeg', gallery: ['/banners/leo.jpeg'], brands: ['Astral', 'CERA', 'LEO', 'Watertec', 'Sproxware', 'Supreme'] };
  const all = (node, predicate, found = []) => {
    if (!node || typeof node !== 'object') return found;
    if (predicate(node)) found.push(node);
    for (const child of React.Children.toArray(node.props?.children)) all(child, predicate, found);
    return found;
  };
  let tree = render();
  assert.equal(find(tree, (node) => node.props.className === 'bannerFrame'), undefined); // No card behind the product.
  const cutout = find(tree, (node) => node.props.className === 'bannerCutout');
  assert.equal(find(cutout, (node) => node.type === 'img').props.src, '/banners/astral-transparent.webp');
  assert.ok(find(cutout, (node) => typeof node.type === 'function' && node.type.name === 'PlumbingLines'));
  const chips = all(find(tree, (node) => node.props.className === 'bannerBrands'), (node) => node.type === 'li');
  assert.deepEqual(chips.map((chip) => find(chip, (node) => node.type === 'img')?.props.src || chip.props.children),
    ['/brands/astral.png', '/brands/cera.png', '/brands/leo.png', '/brands/watertec.png', '/brands/sproxware.png', 'Supreme']);
  assert.equal(find(chips[1], (node) => node.type === 'img').props.alt, 'CERA');

  // A logo that fails to load becomes its brand name; the shop logo falls back to the bundled original.
  find(chips[1], (node) => node.type === 'img').props.onError();
  const pillLogo = () => find(find(render(), (node) => node.props.className === 'bannerPill'), (node) => node.type === 'img');
  assert.equal(pillLogo().props.src, '/api/media/uploads/missing.webp');
  pillLogo().props.onError();
  assert.equal(pillLogo().props.src, '/brand/reference-logo.svg');
  pillLogo().props.onError();
  assert.equal(pillLogo(), undefined); // Never a broken image icon.
  tree = render();
  const cera = all(find(tree, (node) => node.props.className === 'bannerBrands'), (node) => node.type === 'li')[1];
  assert.equal(cera.props.children, 'CERA');
});

test('framed photos drop a failed extra image instead of showing it broken', (t) => {
  const { render, props } = setup(t, { count: 1 });
  props.catalog.banners[0] = { ...props.catalog.banners[0], imageUrl: '/banners/finolex.jpeg', gallery: ['/banners/surya.jpeg', '/banners/gone.jpeg'] };
  const sources = () => {
    const found = [];
    (function walk(node) { if (!node || typeof node !== 'object') return; if (node.type === 'img') found.push(node); React.Children.toArray(node.props?.children).forEach(walk); })(find(render(), (node) => typeof node.props.className === 'string' && node.props.className.startsWith('bannerCluster')));
    return found;
  };
  sources().find((image) => image.props.src === '/banners/gone.jpeg').props.onError();
  assert.deepEqual(sources().map((image) => image.props.src), ['/banners/finolex.jpeg', '/banners/surya.jpeg']);
});

test('themed department banners use the mockup artwork, theme styling and every brand logo', (t) => {
  const { render, props } = setup(t, { count: 2 });
  props.catalog.banners[0] = { ...props.catalog.banners[0], theme: 'electrical', title: 'Electrical Products', imageUrl: '/banners/dept-electrical.webp',
    brands: ['Finolex', 'Polycab', 'Kundan Cab', 'Philips', 'Surya'] };
  props.catalog.banners[1] = { ...props.catalog.banners[1], theme: 'paints', imageUrl: '/banners/paints-poster.jpg', videoUrl: '/banners/paints.mp4', brands: ['Dulux'] };
  const all = (node, predicate, found = []) => {
    if (!node || typeof node !== 'object') return found;
    if (predicate(node)) found.push(node);
    for (const child of React.Children.toArray(node.props?.children)) all(child, predicate, found);
    return found;
  };
  let tree = render();
  assert.equal(tree.props['data-theme'], 'electrical');
  const art = find(tree, (node) => node.props.className === 'bannerArt');
  assert.equal(find(art, (node) => node.type === 'img').props.src, '/banners/dept-electrical.webp');
  assert.equal(find(tree, (node) => node.props.className === 'bannerFrame'), undefined);
  const brands = find(tree, (node) => node.props.className === 'bannerBrands');
  assert.equal(find(brands, (node) => node.type === 'small').props.children, 'Brands we stock');
  assert.deepEqual(all(brands, (node) => node.type === 'img').map((logo) => logo.props.src),
    ['/brands/finolex.png', '/brands/polycab.png', '/brands/kundan-cab.png', '/brands/philips.png', '/brands/surya.png']);
  t.mock.timers.tick(2000); tree = render();
  assert.equal(tree.props['data-theme'], 'paints');
  assert.ok(find(tree, (node) => typeof node.type === 'function' && node.type.name === 'PaintStrokes'));
  assert.match(find(tree, (node) => typeof node.props.className === 'string' && node.props.className.startsWith('bannerVideo')).props.className, /bannerVideoBlend/);
  assert.equal(find(find(tree, (node) => node.props.className === 'bannerBrands'), (node) => node.type === 'img').props.src, '/brands/dulux.png');
});
