import { Icon } from './icons';
import styles from './quiet-warning.module.css';

/**
 * A quiet warning: the note colours and the alert icon, not an error box (DESIGN, "Reference table step"). It tells the
 * person something that does not block them, so it is a status and never takes the focus.
 */
export function QuietWarning({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className={styles.warning} role="status">
      <Icon name="circle-alert" size={16} />
      <ul className={styles.lines}>
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
