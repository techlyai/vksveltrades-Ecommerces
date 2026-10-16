import styles from './Store.module.css';

export function ShopWordmark({ name }: { name: string }) {
  return <b className={styles.wordmarkText}><span className={styles.wordmarkGold}>VKS</span> VEL TRADERS</b>;
}
