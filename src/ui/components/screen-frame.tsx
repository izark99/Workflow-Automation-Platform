import type { ReactNode } from 'react';
import { PageHeader } from './page-header';

/** Header plus the first block. The first block is what the UI rules measure (y 123 on every screen with the sidebar). */
export function ScreenFrame({ breadcrumb, title, subtitle, action, children }: { breadcrumb: ReactNode; title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  return (
    <>
      <PageHeader breadcrumb={breadcrumb} title={title} subtitle={subtitle} action={action} />
      <div data-first-block style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {children}
      </div>
    </>
  );
}
