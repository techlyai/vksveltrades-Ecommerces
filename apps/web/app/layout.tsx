import type { Metadata } from 'next';
import './globals.css';
import './qr.css';
import './admin.css';
import './admin-ratio.css';
import './catalog-responsive.css';
import './reference-theme.css';
import './order-history.css';
export const metadata: Metadata = {
  title: 'VKS VEL TRADERS | Electrical, Plumbing, Paints & Hardware',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
      { url: '/brand/favicon-32.png?v=2', type: 'image/png', sizes: '32x32' },
      { url: '/brand/favicon-16.png?v=2', type: 'image/png', sizes: '16x16' },
    ],
    shortcut: '/favicon.ico?v=2',
    apple: [{ url: '/brand/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' }],
  },
  description: 'Genuine building, electrical, plumbing, paint and hardware products with GST billing and delivery from Madurai.',
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<script defer src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"/></body></html>}
