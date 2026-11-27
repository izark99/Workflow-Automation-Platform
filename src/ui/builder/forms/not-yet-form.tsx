import { useT } from '../../i18n';
import type { FormProps } from './types';
import styles from '../settings-panel.module.css';

/** The Configure tab of a step whose form is not built yet (the steps of Phase 8 get theirs one by one). */
export function NotYetForm(props: FormProps) {
  void props;
  const t = useT();
  return <p className={styles.note}>{t('builder.form.notYet')}</p>;
}
