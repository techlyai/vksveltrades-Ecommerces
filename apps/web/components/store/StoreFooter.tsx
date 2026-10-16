import type { Shop } from '../../lib/types';
import { shopLogoUrl } from '../../lib/api';
import { formatPrice } from '../../lib/catalog-view';
import { ShopIcon } from '../ShopIcon';
import { ShopWordmark } from './ShopWordmark';
import styles from './Store.module.css';

export function StoreFooter({ shop, onOrders }: { shop: Shop; onOrders: () => void }) {
  return <footer className={styles.footer}>
    <div className={`${styles.container} ${styles.footerGrid}`}>
      <div><div className={styles.brand}><img src={shopLogoUrl(shop.logoUrl)} alt="" width="48" height="48" /><span><ShopWordmark name={shop.name} /><small>Electrical | Plumbing | Paints | Hardware</small></span></div>{shop.footerText && <p>{shop.footerText}</p>}{shop.gstin && <div className={styles.gstin}>GSTIN <b>{shop.gstin}</b></div>}{shop.legalName && <p className={styles.legalName}>Proprietor: {shop.legalName}</p>}</div>
      <div><h3>Contact</h3>{shop.phone && <a className={styles.contactLine} href={`tel:${shop.phone}`}><ShopIcon name="phone" />{shop.phone}</a>}{shop.email && <a className={styles.contactLine} href={`mailto:${shop.email}`}><ShopIcon name="mail" />{shop.email}</a>}{shop.openingHours && <p className={styles.contactLine}><ShopIcon name="clock" />{shop.openingHours}</p>}</div>
      <div><h3>Visit the shop</h3>{shop.address && <p className={styles.contactLine}><ShopIcon name="pin" />{shop.address}</p>}<p className={styles.contactLine}><ShopIcon name="delivery" /><span>{shop.maduraiFree ? 'Free delivery within Madurai' : 'Delivery available'} · Min. order {formatPrice(shop.minimumOrder)}</span></p></div>
    </div>
    <div className={`${styles.container} ${styles.footerBottom}`}><span className={styles.copyright}><span className={styles.footerWires} aria-hidden="true"><i /><i /><i /><i /><i /></span>© {new Date().getFullYear()} VKS VEL TRADERS</span><div><button onClick={onOrders}><ShopIcon name="orders" />My Orders</button></div></div>
    <div className={styles.powered}><span>Powered by</span><span className={styles.poweredBrand}><img src="/brand/techly-mark.svg" alt="" width="31" height="20" /><b>Tech<span>ly</span></b></span></div>
  </footer>;
}
