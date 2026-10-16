import type { SVGProps } from 'react';

const paths = {
  shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5',
  cart: 'M2 3h3l3 13h11l3-9H6M10 21h.01M18 21h.01',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  chevron: 'm8 4 8 8-8 8',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'm5 12 4 4L19 6',
  pause: 'M8 5v14M16 5v14',
  play: 'm8 4 12 8-12 8V4Z',
  phone: 'M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C9 21 3 15 3 5a2 2 0 0 1 2-2Z',
  mail: 'M3 5h18v14H3zM3 5l9 8 9-8',
  pin: 'M12 22S4 14 4 9a8 8 0 0 1 16 0c0 5-8 13-8 13ZM12 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  orders: 'M7 3h10v3H7zM6 5H4v16h16V5h-2M8 11h8M8 16h5',
  payments: 'M3 5h18v14H3zM3 10h18M7 15h3',
  products: 'm12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9v10M3 8l9 4 9-4M8 5l9 5',
  categories: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  'paint-shades': 'M4 3h14v7H4zM18 6h3v8h-9v7M9 17h6v4H9z',
  'wire-colors': 'M3 4v7a4 4 0 0 0 8 0V7a4 4 0 0 1 8 0v13M7 2v9M15 7v15M19 2v2',
  stock: 'M3 8h18v13H3zM2 3h20v5H2zM9 12h6',
  customers: 'M16 21v-2a5 5 0 0 0-10 0v2M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM18 4a4 4 0 0 1 0 7M21 21v-2a5 5 0 0 0-3-4.6',
  'customer-categories': 'm5 19 14-14M7 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM17 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  banners: 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M16 7h.01',
  delivery: 'M1 4h13v13H1zM14 9h4l4 4v4h-8M7 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  shop: 'M4 10v11h16V10M3 10l2-7h14l2 7M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0M9 21v-7h6v7',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
} as const;

export function ShopIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}
