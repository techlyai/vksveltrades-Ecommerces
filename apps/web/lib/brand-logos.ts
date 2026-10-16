// Logos cropped from the owner's supplied artwork and banner mockups (public/brands).
// Brands without an entry, or whose logo fails to load, show their name instead.
const logos: Record<string, string> = {
  astral: '/brands/astral.png',
  cera: '/brands/cera.png',
  'taps & fittings': '/brands/taps-fittings.png',
  leo: '/brands/leo.png',
  watertec: '/brands/watertec.png',
  sproxware: '/brands/sproxware.png',
  finolex: '/brands/finolex.png',
  polycab: '/brands/polycab.png',
  'kundan cab': '/brands/kundan-cab.png',
  philips: '/brands/philips.png',
  surya: '/brands/surya.png',
  dulux: '/brands/dulux.png',
  ramco: '/brands/ramco.png',
  roff: '/brands/roff.png',
  araldite: '/brands/araldite.png',
};

export const brandLogoUrl = (brand: string) => logos[brand.trim().toLowerCase()];
