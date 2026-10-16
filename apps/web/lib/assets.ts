export const API = process.env.NEXT_PUBLIC_API_URL || '/api';
export const assetUrl = (path?: string) => {
  // Upgrade only the bundled tank photo; leave admin uploads and external artwork alone.
  const source = path === '/banners/astral.jpeg' || path === '/banners/astral-white.webp' ? '/banners/astral-transparent.webp' : path;
  return source ? (/^https?:\/\//i.test(source) || /^\/(banners|brand)\//.test(source) ? source : `${API.replace(/\/api\/?$/, '')}${source.startsWith('/') ? '' : '/'}${source}`) : '';
};
export const shopLogoUrl = (path?: string) => !path || path === '/api/media/logo.svg' ? '/brand/reference-logo.svg' : assetUrl(path);
