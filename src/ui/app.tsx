import { useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { createLocalStore } from '../store';
import type { DataStore } from '../store/types';
import { Placeholder } from './screens/placeholder';
import { DevComponents } from './screens/dev-components';
import { Shell } from './shell';
import { strings } from './strings';
import { StoreProvider } from './store-context';

// The components page is development only: it is built in when VITE_DEV_ROUTES=true (the dev server, the UI-rules and e2e builds).
const DEV_ROUTES = import.meta.env.DEV || import.meta.env.VITE_DEV_ROUTES === 'true';

// The builder has no sidebar. T2.9 replaces this placeholder.
function BuilderPlaceholder() {
  return (
    <main style={{ padding: '32px 40px' }}>
      <h1>{strings.screens.builder.title}</h1>
      <p>{strings.screens.notBuilt}</p>
    </main>
  );
}

export function App({ store }: { store?: DataStore }) {
  const active = useMemo(() => store ?? createLocalStore(), [store]);
  return (
    <StoreProvider store={active}>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/flows" element={<Placeholder screen="flows" />} />
            <Route path="/flows/:id/run" element={<Placeholder screen="run" />} />
            <Route path="/flows/:id/versions" element={<Placeholder screen="versions" />} />
            <Route path="/reference-tables" element={<Placeholder screen="refTables" />} />
            <Route path="/admin" element={<Placeholder screen="admin" />} />
          </Route>
          <Route path="/flows/:id/versions/:versionNo" element={<BuilderPlaceholder />} />
          {DEV_ROUTES ? <Route path="/dev/components" element={<DevComponents />} /> : null}
          <Route path="*" element={<Navigate to="/flows" replace />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
