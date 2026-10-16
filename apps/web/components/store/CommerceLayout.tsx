import type { ReactNode } from 'react';
import { ShopIcon } from '../ShopIcon';
import styles from './CommerceLayout.module.css';

export function CommercePage({ title, subtitle, backLabel, onBack, step, children }: {
  title: string; subtitle?: string; backLabel: string; onBack: () => void; step: 1 | 2 | 3; children: ReactNode;
}) {
  return <main className={styles.page}>
    <div className={styles.pageHead}><div><button className={styles.back} onClick={onBack}><ShopIcon name="chevron" />{backLabel}</button><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      <ol className={styles.steps} aria-label="Checkout progress">{['Cart', 'Details', 'Payment'].map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined} data-complete={step > index + 1}><i>{step > index + 1 ? <ShopIcon name="check" /> : index + 1}</i>{label}</li>)}</ol>
    </div>
    {children}
  </main>;
}

export function CheckoutSection({ number, title, description, children }: { number: string; title: string; description: string; children: ReactNode }) {
  return <section className={styles.section}><header className={styles.sectionHeading}><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></header><div className={styles.fields}>{children}</div></section>;
}
