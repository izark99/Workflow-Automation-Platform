import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { nextTab } from './tab-keys';
import styles from './tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  label: string;
  tabs: TabItem[];
  selected: string;
  onSelect: (id: string) => void;
  /** The content of the selected tab. */
  children: ReactNode;
}

/** Tab buttons with an accent underline on the selected one. Left and right arrows, Home and End move between tabs. */
export function Tabs({ label, tabs, selected, onSelect, children }: TabsProps) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, index: number): void => {
    const next = nextTab(index, tabs.length, e.key);
    if (next === null) return;
    e.preventDefault();
    const tab = tabs[next];
    if (tab) onSelect(tab.id);
    refs.current[next]?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className={styles.list}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={t.id === selected}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={t.id === selected ? 0 : -1}
            className={styles.tab}
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel-${selected}`} aria-labelledby={`${base}-tab-${selected}`}>
        {children}
      </div>
    </div>
  );
}

/** A filter chip: a compact button with a pressed state. */
export function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} className={styles.chip} onClick={onClick}>
      {children}
    </button>
  );
}

export function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={styles.chips}>
      {children}
    </div>
  );
}
