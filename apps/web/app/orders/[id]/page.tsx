import type { Metadata } from 'next';
import { OrderTracking } from '../../../components/store/OrderTracking';
export const metadata: Metadata = { title: 'Track your order | VKS VEL TRADERS', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function Page({ params }: { params: { id: string } }) { return <OrderTracking id={params.id} />; }
