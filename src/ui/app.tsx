import { useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { createLocalStore } from '../store';
import type { DataStore } from '../store/types';
import { BuilderScreen } from './builder/builder-screen';
import { FlowsScreen } from './screens/flows';
import { Placeholder } from './screens/placeholder';
import { RunScreen } from './screens/run';
import { DevComponents } from './screens/dev-components';
import { Shell } from './shell';
import { StoreProvider } from './store-context';

// The components page is development only: it is built in when VITE_DEV_ROUTES=true (the dev server, the UI-rules and e2e builds).
const DEV_ROUTES = import.meta.env.DEV || import.meta.env.VITE_DEV_ROUTES === 'true';

export function App({ store }: { store?: DataStore }) {
  const active = useMemo(() => store ?? createLocalStore(), [store]);
  return (
    <StoreProvider store={active}>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/flows" element={<FlowsScreen />} />
            <Route path="/flows/:id/run" element={<RunScreen />} />
            <Route path="/flows/:id/versions" element={<Placeholder screen="versions" />} />
            <Route path="/reference-tables" element={<Placeholder screen="refTables" />} />
            <Route path="/admin" element={<Placeholder screen="admin" />} />
          </Route>
          <Route path="/flows/:id/versions/:versionNo" element={<BuilderScreen />} />
          {DEV_ROUTES ? <Route path="/dev/components" element={<DevComponents />} /> : null}
          <Route path="*" element={<Navigate to="/flows" replace />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
