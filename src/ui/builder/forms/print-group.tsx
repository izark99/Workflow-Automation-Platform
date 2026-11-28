import { ALIGNS, MARGINS, ORIENTATIONS, PAPERS, SIZES } from '../../../engine/output/print/settings';
import type { Align, PrintSettings } from '../../../engine/output/print/settings';
import { Button, Dropdown, Field, Icon, InfoTip, Switch } from '../../components';
import type { IconName } from '../../components';
import { useT } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { MAX_HEADER_LINES, MAX_SIGNERS, addHeaderLine, addSigner, hasPrintErrors, patchLine, patchSigner, printErrors, switchPrint, tokenList } from './print-logic';
import type { PrintValue } from './print-logic';
import styles from './column-pickers.module.css';
import own from './print-group.module.css';

export interface PrintGroupProps {
  value: PrintValue;
  /** The keys of the parameters of the flow, for the `{param:key}` tokens. */
  parameterKeys: readonly string[];
  readOnly: boolean;
  onChange: (next: PrintValue) => void;
}

const ALIGN_ICONS: Record<Align, IconName> = { left: 'align-left', center: 'align-center-h', right: 'align-right' };

/** One labelled dropdown of a fixed list. */
function Choice<T extends string>({ label, prefix, list, value, onChange, disabled, min }: { label: string; prefix: string; list: readonly T[]; value: T; onChange: (v: T) => void; disabled: boolean; min?: number }) {
  const t = useT();
  return (
    <div className={styles.cell} style={min ? { minWidth: min, flex: `1 1 ${min}px` } : undefined}>
      <span className={styles.label}>{label}</span>
      <Dropdown label={label} options={list.map((x) => ({ value: x, label: t(`${prefix}.${x}` as MessageKey) }))} value={value} disabled={disabled} width="100%" onChange={(v) => onChange(v as T)} />
    </div>
  );
}

/**
 * The group "Print layout" of an Output step (xlsx): the switch, and when it is on the page, the header lines and the signatures
 * (DESIGN "Print layout"). Every change gives the whole layout back; the form decides whether it is valid enough to be saved.
 */
export function PrintGroup({ value, parameterKeys, readOnly, onChange }: PrintGroupProps) {
  const t = useT();
  const on = value?.enabled === true;
  const p: PrintSettings | null = on ? value : null;
  const change = (next: PrintSettings): void => onChange(next);
  const errors = p ? printErrors(p, parameterKeys) : null;
  const numbered = (label: string, n: number): string => t('common.numbered', { label, n });

  return (
    <div role="group" aria-label={t('builder.print.title')} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span className={styles.labelRow} style={{ marginBottom: 0 }}>
        <Switch checked={on} disabled={readOnly} onChange={(next) => onChange(switchPrint(value, next))}>
          {t('builder.print.title')}
        </Switch>
        <InfoTip label={t('builder.print.title')}>{t('builder.print.hint')}</InfoTip>
      </span>
      {p && errors ? (
        <>
          <section aria-label={t('builder.print.page')} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <strong>{t('builder.print.page')}</strong>
            <div className={styles.line}>
              <Choice label={t('builder.print.paper')} prefix="builder.print.papers" list={PAPERS} value={p.paper} disabled={readOnly} onChange={(paper) => change({ ...p, paper })} />
              <Choice label={t('builder.print.orientation')} prefix="builder.print.orientations" list={ORIENTATIONS} value={p.orientation} disabled={readOnly} onChange={(orientation) => change({ ...p, orientation })} />
            </div>
            <Choice label={t('builder.print.margins')} prefix="builder.print.marginsList" list={MARGINS} value={p.margins} disabled={readOnly} onChange={(margins) => change({ ...p, margins })} />
            <Switch checked={p.fitWidth} disabled={readOnly} onChange={(fitWidth) => change({ ...p, fitWidth })}>{t('builder.print.fitWidth')}</Switch>
            <Switch checked={p.repeatHeader} disabled={readOnly} onChange={(repeatHeader) => change({ ...p, repeatHeader })}>{t('builder.print.repeatHeader')}</Switch>
            <Switch checked={p.pageNumbers} disabled={readOnly} onChange={(pageNumbers) => change({ ...p, pageNumbers })}>{t('builder.print.pageNumbers')}</Switch>
          </section>

          <section aria-label={t('builder.print.headerLines')} style={{ display: 'flex', flexDirection: 'column' }}>
            <span className={styles.labelRow}>
              <strong>{t('builder.print.headerLines')}</strong>
              <InfoTip label={t('builder.print.headerLines')}>{t('builder.print.tokensHint', { tokens: tokenList(), paramToken: '{param:key}' })}</InfoTip>
            </span>
            {p.header.map((line, i) => (
              <div key={i} className={styles.rowCard}>
                <div className={styles.line}>
                  <div className={styles.grow}>
                    <Field label={numbered(t('builder.print.lineText'), i + 1)} value={line.text} disabled={readOnly} error={errors.header[i]} onChange={(e) => change(patchLine(p, i, { text: e.target.value }))} />
                  </div>
                  <Button icon size="sm" disabled={readOnly} aria-label={numbered(t('builder.print.removeLine'), i + 1)} onClick={() => change({ ...p, header: p.header.filter((_, j) => j !== i) })}>
                    <Icon name="x" />
                  </Button>
                </div>
                <div className={styles.line} style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  <div role="group" aria-label={numbered(t('builder.print.align'), i + 1)} className={own.aligns}>
                    {ALIGNS.map((a) => (
                      <Button key={a} icon size="sm" aria-pressed={line.align === a} disabled={readOnly} aria-label={t(`builder.print.aligns.${a}` as MessageKey, { n: i + 1 })} onClick={() => change(patchLine(p, i, { align: a }))}>
                        <Icon name={ALIGN_ICONS[a]} />
                      </Button>
                    ))}
                  </div>
                  <Switch checked={line.bold} disabled={readOnly} onChange={(bold) => change(patchLine(p, i, { bold }))}>{numbered(t('builder.print.bold'), i + 1)}</Switch>
                  <Choice label={numbered(t('builder.print.size'), i + 1)} prefix="builder.print.sizes" list={SIZES} value={line.size} disabled={readOnly} min={120} onChange={(size) => change(patchLine(p, i, { size }))} />
                </div>
              </div>
            ))}
            <div style={{ paddingTop: 8 }}>
              <Button size="sm" disabled={readOnly || p.header.length >= MAX_HEADER_LINES} onClick={() => change(addHeaderLine(p))}>{t('builder.print.addLine')}</Button>
              {p.header.length >= MAX_HEADER_LINES ? <p className={styles.note} role="status">{t('builder.print.limitLines', { n: MAX_HEADER_LINES })}</p> : null}
            </div>
          </section>

          <section aria-label={t('builder.print.signatures')} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <strong>{t('builder.print.signatures')}</strong>
            <Field label={t('builder.print.dateLine')} hint={t('builder.print.dateLineHint', { example: 'Hà Nội, ngày {day} tháng {month} năm {year}' })} value={p.dateLine} disabled={readOnly} error={errors.dateLine} onChange={(e) => change({ ...p, dateLine: e.target.value })} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {p.signers.map((s, i) => (
                <div key={i} className={styles.rowCard}>
                  <div className={styles.line}>
                    <div className={styles.grow}>
                      <Field label={numbered(t('builder.print.signerTitle'), i + 1)} value={s.title} disabled={readOnly} error={errors.signers[i]?.title} onChange={(e) => change(patchSigner(p, i, { title: e.target.value }))} />
                    </div>
                    <Button icon size="sm" disabled={readOnly} aria-label={numbered(t('builder.print.removeSigner'), i + 1)} onClick={() => change({ ...p, signers: p.signers.filter((_, j) => j !== i) })}>
                      <Icon name="x" />
                    </Button>
                  </div>
                  <Field label={numbered(t('builder.print.signerLine'), i + 1)} value={s.line} disabled={readOnly} error={errors.signers[i]?.line} onChange={(e) => change(patchSigner(p, i, { line: e.target.value }))} />
                  <Field label={numbered(t('builder.print.signerName'), i + 1)} value={s.name} disabled={readOnly} error={errors.signers[i]?.name} onChange={(e) => change(patchSigner(p, i, { name: e.target.value }))} />
                </div>
              ))}
              <div style={{ paddingTop: 8 }}>
                <Button size="sm" disabled={readOnly || p.signers.length >= MAX_SIGNERS} onClick={() => change(addSigner(p))}>{t('builder.print.addSigner')}</Button>
                {p.signers.length >= MAX_SIGNERS ? <p className={styles.note} role="status">{t('builder.print.limitSigners', { n: MAX_SIGNERS })}</p> : null}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export { hasPrintErrors, printErrors };
