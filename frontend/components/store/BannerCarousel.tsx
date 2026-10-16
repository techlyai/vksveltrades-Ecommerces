'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Catalog } from '../../lib/types';
import { assetUrl, shopLogoUrl } from '../../lib/api';
import { safeBannerUrl } from '../../lib/catalog-view';
import { scheduleBannerAdvance } from '../../lib/banner-timer';
import { brandLogoUrl } from '../../lib/brand-logos';
import { CategoryIcon } from '../CategoryIcon';
import { ShopIcon } from '../ShopIcon';
import { TrustBadges } from './TrustBadges';
import { ShopWordmark } from './ShopWordmark';
import styles from './Store.module.css';

// Brand-coloured "Brands in stock" chips; unknown brands use the banner text colour.
const brandColours: Record<string, string> = {
  polycab: '#e2231a', finolex: '#1a4f9c', 'kundan cab': '#d7261e', philips: '#0b5ed7', surya: '#d71920',
  astral: '#1b4fa0', cera: '#0067b1', leo: '#0d6eb8', watertec: '#c8102e', sproxware: '#e88a00',
  ramco: '#1d4f91', roff: '#d4141c', araldite: '#0b3d91', dulux: '#0b2c6b', 'birla opus': '#5b2d8e',
};

// "Paints & Finishing" -> accent "Paints" + "& Finishing", as in the reference banners.
function Headline({ title }: { title: string }) {
  const [lead, ...rest] = title.trim().split(/\s+/);
  return <h1>{rest.length ? <><em>{lead}</em> {rest.join(' ')}</> : title}</h1>;
}

// Light pipe-and-valve line art behind plumbing product cut-outs.
function PlumbingLines() {
  return <svg className={styles.bannerPipes} viewBox="0 0 600 500" preserveAspectRatio="xMidYMid meet">
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 410h150v-90h110M420 410h160M520 410V250h60" strokeWidth="18" />
      <path d="M60 150h90v70" strokeWidth="12" />
      <circle cx="170" cy="410" r="16" /><circle cx="520" cy="410" r="16" /><circle cx="150" cy="150" r="12" />
      <circle cx="560" cy="250" r="22" strokeWidth="6" /><path d="M560 228v44M538 250h44" strokeWidth="6" />
    </g>
    <g className={styles.bannerDrops}><path d="M110 250c-10 14-14 22-14 28a14 14 0 0 0 28 0c0-6-4-14-14-28z" /><path d="M470 120c-8 11-11 18-11 22a11 11 0 0 0 22 0c0-4-3-11-11-22z" /><path d="M300 60c-6 8-8 13-8 16a8 8 0 0 0 16 0c0-3-2-8-8-16z" /></g>
  </svg>;
}

// Colour swatches and brush swooshes around the paint video (Paints banner mockup).
function PaintStrokes() {
  return <svg className={styles.bannerPaint} viewBox="0 0 1000 580" preserveAspectRatio="none">
    <path className={styles.paintLavender} d="M200 120c120-40 300-30 420-45s260-50 350-20" />
    <path className={styles.paintPeach} d="M140 470c160 30 330-10 470 0s250 40 350 0" />
    <path className={styles.paintGold} d="M560 560c120-20 230-10 330-25" />
    <g className={styles.paintSwatches}>
      <rect x="140" y="22" width="22" height="22" rx="5" fill="#f4b6a6" /><rect x="172" y="30" width="22" height="22" rx="5" fill="#f8c99a" />
      <rect x="204" y="18" width="22" height="22" rx="5" fill="#fbe08b" /><rect x="236" y="30" width="22" height="22" rx="5" fill="#aab8f6" />
      <rect x="268" y="20" width="22" height="22" rx="5" fill="#9fd9c1" /><rect x="300" y="30" width="22" height="22" rx="5" fill="#f5a3b6" />
      <rect x="760" y="0" width="22" height="34" rx="6" fill="#f8b979" /><rect x="796" y="0" width="16" height="44" rx="6" fill="#fbd96a" />
      <rect x="826" y="0" width="18" height="28" rx="6" fill="#a5b4f4" />
    </g>
  </svg>;
}

export function BannerCarousel({ catalog, onCategory, onOrders }: { catalog: Catalog; onCategory: (id: string) => void; onOrders: () => void }) {
  const banners = catalog.banners.filter((banner) => banner.enabled !== false).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const [index, setIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const markFailed = (url?: string) => { if (url) setFailed((list) => list.includes(url) ? list : [...list, url]); };
  const loads = (url?: string) => Boolean(url?.trim()) && !failed.includes(url!);
  const touchStart = useRef<number | null>(null);
  const banner = banners[index % Math.max(1, banners.length)];
  const auto = catalog.shop.bannerAutoSlide !== false && !reducedMotion && !interacting && !focused;
  const duration = Math.max(2, banner?.duration || catalog.shop.bannerInterval || 2);
  const nextImage = banners.length > 1 ? assetUrl(banners[(index + 1) % banners.length]?.imageUrl) : '';
  const next = (direction: number) => setIndex((current) => (current + direction + banners.length) % Math.max(1, banners.length));

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!auto || banners.length < 2) return;
    return scheduleBannerAdvance(() => setIndex((current) => (current + 1) % banners.length), duration);
  }, [auto, duration, index, banners.length]);
  useEffect(() => {
    if (!nextImage) return;
    // Warm the browser cache before the next two-second slide, not after it appears.
    const image = new window.Image();
    image.src = nextImage;
  }, [nextImage]);

  const brands = (banner?.brands || []).map((brand) => brand.trim()).filter(Boolean);
  const gallery = (banner?.gallery || []).filter(loads).slice(0, 2);
  // Uploaded logo first, then the bundled original; never a broken image.
  const logo = [shopLogoUrl(catalog.shop.logoUrl), '/brand/reference-logo.svg'].find(loads);
  const plumbing = ['plumbing', 'pipes'].includes(banner?.categoryId || '');
  const theme = banner?.theme?.trim() || undefined;
  const selectedCategory = catalog.categories.find((category) => category.id === (banner?.linkValue || banner?.categoryId));
  const open = () => {
    if (!banner || banner.linkType === 'none') return;
    if (banner.linkType === 'orders') onOrders();
    else if (banner.linkType === 'url') { const url = safeBannerUrl(banner.linkValue); if (url) window.open(url, '_blank', 'noopener,noreferrer'); }
    else onCategory(selectedCategory?.id || 'all');
  };
  const canOpen = banner && banner.linkType !== 'none' && (banner.linkType !== 'url' || safeBannerUrl(banner.linkValue));

  return (
    <section className={styles.banner} data-theme={theme} style={{ '--banner-accent': banner?.accent || '#b47b24' } as CSSProperties} aria-label={banner ? 'Shop highlights' : 'Welcome to the shop'} aria-roledescription={banner ? 'carousel' : undefined} onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); }} onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; setInteracting(true); }} onTouchEnd={(event) => { if (touchStart.current !== null && banners.length > 1) { const delta = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(delta) > 50) next(delta > 0 ? -1 : 1); } touchStart.current = null; setInteracting(false); }} onTouchCancel={() => { touchStart.current = null; setInteracting(false); }}>
      <div className={styles.bannerPattern} aria-hidden="true" />
      <div className={styles.container}>
        <div className={styles.bannerSlide} key={banner?.id || 'welcome'} role={banner ? 'group' : undefined} aria-roledescription={banner ? 'slide' : undefined} aria-label={banner ? `${index % banners.length + 1} of ${banners.length}` : undefined}>
          <div className={styles.bannerCopy}>
            <span className={styles.bannerPill}>{logo && <img src={logo} alt="" onError={() => markFailed(logo)} />}<span><ShopWordmark name={catalog.shop.name} /></span>{banner?.label && <><i>·</i><b>{banner.label}</b></>}</span>
            {banner?.title ? <Headline title={banner.title} /> : <h1>VKS VEL TRADERS</h1>}
            <p>{banner?.description || 'Electrical | Plumbing | Paints | Hardware'}</p>
            {brands.length > 0 && <div className={styles.bannerBrands}>
              <small>Brands we stock</small>
              <ul>{brands.map((brand, position) => {
                const logoUrl = brandLogoUrl(brand);
                return <li key={brand} className={loads(logoUrl) ? styles.brandLogo : undefined} style={{ '--brand': brandColours[brand.toLowerCase()] || '#13254d', '--i': position } as CSSProperties}>
                  {loads(logoUrl) ? <img src={logoUrl} alt={brand} title={brand} onError={() => markFailed(logoUrl)} /> : brand}
                </li>;
              })}</ul>
            </div>}
            {canOpen ? <button className={`${styles.primaryButton} ${styles.bannerCta}`} onClick={open}>{banner.buttonText || 'Shop the collection'}<ShopIcon name="arrow" /></button> : !banner ? <a className={styles.primaryButton} href="#shop-products">Browse products<ShopIcon name="arrow" /></a> : null}
          </div>
          <div className={styles.bannerVisual} aria-hidden="true">
            {banner && <span className={styles.bannerShapes}><i /><i /><i /><i /></span>}
            {theme === 'paints' && <PaintStrokes />}
            {banner?.videoUrl ? <div className={`${styles.bannerVideo} ${theme ? styles.bannerVideoBlend : ''}`}>
              <video src={assetUrl(banner.videoUrl)} poster={banner.imageUrl ? assetUrl(banner.imageUrl) : undefined} autoPlay={!reducedMotion} muted loop playsInline preload="auto" />
            </div> : theme && loads(banner?.imageUrl) ? <div className={styles.bannerArt}>
              <img className={styles.bannerArtImage} src={assetUrl(banner!.imageUrl)} alt="" onError={() => markFailed(banner!.imageUrl)} />
            </div> : banner?.cutout && loads(banner.imageUrl) ? <div className={styles.bannerCutout}>
              {plumbing && <PlumbingLines />}
              <img className={styles.bannerCutoutImage} src={assetUrl(banner.imageUrl)} alt="" onError={() => markFailed(banner.imageUrl)} />
            </div> : banner && loads(banner.imageUrl) ? <div className={`${styles.bannerCluster} ${gallery.length ? '' : styles.bannerSolo}`}>
              <div className={styles.bannerFrame}><img className={styles.bannerImage} src={assetUrl(banner.imageUrl)} alt="" onError={() => markFailed(banner.imageUrl)} /></div>
              {gallery.map((url) => <div key={url} className={`${styles.bannerFrame} ${styles.bannerExtra}`}><img className={styles.bannerImage} src={assetUrl(url)} alt="" onError={() => markFailed(url)} /></div>)}
            </div> : <div className={styles.bannerArtwork}>
              <div className={styles.artRing} />
              <div className={styles.artTile}><CategoryIcon name={selectedCategory?.icon || 'box'} /></div>
              <span className={styles.artSmall}><ShopIcon name="delivery" /></span><span className={styles.artSmall}><ShopIcon name="shop" /></span>
            </div>}
          </div>
        </div>
        <div className={styles.bannerBottom}>
          <TrustBadges shop={catalog.shop} />
        </div>
      </div>
    </section>
  );
}
