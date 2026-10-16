import type { Banner, Category } from './models';

// Artwork supplied by the shop owner, shipped with the Next.js public assets.
const artwork = [
  ['finolex', 'Wires & Cables', 'Finolex cables for your electrical projects.', 'wires'],
  ['astral', 'Water Storage', 'Explore Astral tanks and plumbing essentials.', 'plumbing'],
  ['kundan', 'Wiring Cables', 'Discover the Kundan Cab collection.', 'wires'],
  ['cera', 'Bathroom Essentials', 'Explore the CERA collection.', 'plumbing'],
  ['pvc-taps', 'Taps & Fittings', 'Browse PVC taps and fittings for your home.', 'plumbing'],
  ['leo', 'Plumbing Essentials', 'Discover LEO taps and bathroom fittings.', 'plumbing'],
  ['roff', 'Tile Adhesives', 'Explore Roff materials for your next project.', 'cement'],
  ['araldite', 'Hardware & Tools', 'Browse Araldite adhesives and hardware essentials.', 'hardware'],
  ['ramco', 'Cement & Construction', 'Explore Ramco construction materials.', 'cement'],
  ['dulux', 'Paints & Colours', 'Discover the Dulux collection.', 'paints'],
  ['philips', 'Lighting Essentials', 'Explore the Philips collection.', 'lighting'],
  ['surya', 'LED Lighting', 'Discover Surya lighting for your home.', 'lighting'],
  ['polycab', 'Electrical Essentials', 'Explore the Polycab collection.', 'electrical'],
] as const;

export function suppliedBanners(categories: Category[]): Banner[] {
  return artwork.map(([name, title, description, categoryId], order) => {
    const category = categories.find((item) => item.id === categoryId);
    return {
      id: `owner-banner-${name}`, title, description, label: category?.name || title,
      imageUrl: `/banners/${name}.jpeg`, accent: '#b47b24', duration: 2,
      enabled: true, order, buttonText: 'Explore collection',
      linkType: category ? 'category' : 'none', categoryId: category?.id || '',
      linkValue: category?.id,
    };
  });
}

// One banner per department, matching the owner's banner mockups (text, brands, artwork).
// `theme` selects the storefront gradients/background; artwork is bundled in the frontend.
const departments = [
  { id: 'paints', label: 'Paints', title: 'Paints & Finishing', description: 'Bring colour and quality to every space',
    brands: ['Dulux'], imageUrl: '/banners/paints-poster.jpg', videoUrl: '/banners/paints.mp4', gallery: [], cutout: false,
    theme: 'paints', accent: '#e2640f', buttonText: 'Shop Paints', duration: 10 },
  { id: 'hardware', label: 'Hardware', title: 'Hardware & Tools', description: 'Reliable tools and hardware for every job',
    brands: ['Araldite'], imageUrl: '/banners/dept-hardware.webp', gallery: [], cutout: false,
    theme: 'hardware', accent: '#e0700f', buttonText: 'Shop Hardware', duration: 5 },
  { id: 'electrical', label: 'Electrical', title: 'Electrical Products', description: 'Quality electrical products from trusted brands',
    brands: ['Finolex', 'Polycab', 'Kundan Cab', 'Philips', 'Surya'], imageUrl: '/banners/dept-electrical.webp', gallery: [], cutout: false,
    theme: 'electrical', accent: '#b7791f', buttonText: 'Shop Electrical', duration: 5 },
  { id: 'plumbing', label: 'Plumbing', title: 'Plumbing Products', description: 'Pipes, fittings, taps & trusted plumbing solutions',
    brands: ['Astral', 'CERA', 'Taps & Fittings', 'Watertec'], imageUrl: '/banners/dept-plumbing.webp', gallery: [], cutout: false,
    theme: 'plumbing', accent: '#1f6fe0', buttonText: 'Shop Plumbing', duration: 5 },
  { id: 'cement', label: 'Construction', title: 'Cement & Construction', description: 'Quality building materials for every project',
    brands: ['Ramco', 'Roff'], imageUrl: '/banners/dept-cement.webp', gallery: [], cutout: false,
    theme: 'cement', accent: '#c8700f', buttonText: 'Shop Construction', duration: 5 },
];

export const bannerThemes = departments.map((department) => department.theme);

// Images used by earlier department releases; a banner still showing one of these is untouched.
export const previousDepartmentImages: Record<string, string[]> = {
  paints: ['/banners/paints-poster.jpg'], hardware: ['/banners/araldite.jpeg'], electrical: ['/banners/finolex.jpeg'],
  plumbing: ['/banners/astral.jpeg'], cement: ['/banners/roff.jpeg'],
};

// Mockup-matching fields applied to untouched department banners from earlier releases.
export function departmentArtwork(id: string) {
  const department = departments.find((item) => item.id === id);
  if (!department) return undefined;
  const { label, title, description, brands, imageUrl, gallery, cutout, theme, accent, buttonText } = department;
  return { label, title, description, brands, imageUrl, gallery, cutout, theme, accent, buttonText };
}

export function categoryBanners(categories: Category[]): Banner[] {
  return departments.map(({ id, ...banner }, order) => {
    const category = categories.find((item) => item.id === id);
    return {
      ...banner, id: `category-banner-${id}`, enabled: true, order,
      linkType: category ? 'category' : 'none', categoryId: category?.id || '', linkValue: category?.id,
    };
  });
}

// The first department release framed the plumbing posters; the transparent Astral
// tanks now blend straight into the banner instead.
export const legacyPlumbingGallery = ['/banners/pvc-taps.jpeg', '/banners/leo.jpeg'];

// Owner brand banners still using bundled artwork are superseded by the department banners.
export const isBundledOwnerBanner = (banner: Banner) =>
  banner.id.startsWith('owner-banner-') && /^\/banners\//.test(banner.imageUrl || '');

export function isUnchangedSampleBanner(banner: Banner, categories: Category[]): boolean {
  const category = categories.find((item) => `sample-banner-${item.id}` === banner.id);
  return banner.id.startsWith('sample-banner-') && banner.label === 'Sample collection'
    && banner.description === 'Explore essentials for your next project. Discover the collection below.'
    && banner.title === category?.name && banner.linkValue === category?.id
    && banner.linkType === 'category' && banner.buttonText === 'Explore collection'
    && banner.accent === '#d7a447' && !banner.imageUrl;
}
