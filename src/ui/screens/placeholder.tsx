import { Card, ScreenFrame } from '../components';
import { strings } from '../strings';

type Key = 'refTables' | 'admin' | 'run' | 'versions';

/** A screen that a later task builds. It already has the real header and the first block, so the layout rules run on it. */
export function Placeholder({ screen }: { screen: Key }) {
  const s = strings.screens[screen];
  return (
    <ScreenFrame breadcrumb={<span>{s.crumb}</span>} title={s.title} subtitle={s.subtitle}>
      <Card title={s.title}>
        <span>{strings.screens.notBuilt}</span>
      </Card>
    </ScreenFrame>
  );
}
