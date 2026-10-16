import type { Shop } from '../../lib/types';
import { formatPrice } from '../../lib/catalog-view';
import { ShopIcon } from '../ShopIcon';
import styles from './Store.module.css';

export function TrustBadges({ shop }: { shop: Shop }) {
  return <div className={styles.trustBadges} aria-label="Shop services">
    <span><i><ShopIcon name={shop.maduraiFree ? 'check' : 'delivery'} /></i>{shop.maduraiFree ? 'Free delivery in Madurai' : 'Delivery available'}</span>
    <span><i><ShopIcon name="payments" /></i>{shop.minimumOrder > 0 ? `Minimum order ${formatPrice(shop.minimumOrder)}` : 'No minimum order'}</span>
    <span><i><ShopIcon name="orders" /></i>{shop.gstin ? 'GST invoice' : 'Order receipt'}</span>
    <span><i><ShopIcon name="shield" /></i>{shop.upiEnabled ? 'Secure UPI payment' : 'UPI payment setup pending'}</span>
    {shop.trustBadges.filter((badge) => !/^(free delivery|minimum order|no minimum|gst invoice|secure upi|upi payment|delivery available|order receipt)/i.test(badge)).map((badge) => <span key={badge}><i><ShopIcon name="check" /></i>{badge}</span>)}
  </div>;
}
