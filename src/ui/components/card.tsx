import type { ReactNode } from 'react';
import styles from './card.module.css';

/** `flush` removes the padding, for a card that holds a table. */
export function Card({ flush = false, title, children, firstBlock = false }: { flush?: boolean; title?: string; children: ReactNode; firstBlock?: boolean }) {
  return (
    <section className={`${styles.card} ${flush ? styles.flush : ''}`} data-first-block={firstBlock ? '' : undefined} aria-label={flush ? title : undefined}>
      {title && !flush ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}
