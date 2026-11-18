import { useEffect, useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { createBackend } from '../store';
import type { AuthService } from '../store/auth';
import type { DataStore } from '../store/types';
import { BuilderScreen } from './builder/builder-screen';
import { FlowsScreen } from './screens/flows';
import { AdminScreen } from './screens/admin';
import { ReferenceTablesScreen } from './screens/reference-tables';
import { RunScreen } from './screens/run';
import { VersionsScreen } from './screens/versions';
import { DevComponents } from './screens/dev-components';
import { AuthGate } from './auth-gate';
import { Shell } from './shell';
import { StoreProvider } from './store-context';
import { applyUiTexts, useT } from './i18n';
import { ThemeProvider } from './theme-context';

// The components page is development only: it is built in when VITE_DEV_ROUTES=true (the dev server, the UI-rules and e2e builds).
const DEV_ROUTES = import.meta.env.DEV || import.meta.env.VITE_DEV_ROUTES === 'true';

export function App({ store, auth }: { store?: DataStore; auth?: AuthService | null }) {
  useT(); // re-renders the whole tree when the language or an edited text changes, also parts that read texts outside React
  const backend = useMemo(() => (store ? { store, auth: auth ?? null } : createBackend()), [store, auth]);
  // The edited texts are applied over the catalog when the app starts. They are readable before sign-in, so the sign-in
  // screen shows them too. If they cannot be read, the defaults stay.
  useEffect(() => {
    let live = true;
    backend.store.listUiTexts().then(
      (texts) => live && applyUiTexts(texts),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [backend.store]);
  const routes = (
    <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/flows" element={<FlowsScreen />} />
            <Route path="/flows/:id/run" element={<RunScreen />} />
            <Route path="/flows/:id/versions" element={<VersionsScreen />} />
            <Route path="/reference-tables" element={<ReferenceTablesScreen />} />
            <Route path="/admin" element={<AdminScreen />} />
          </Route>
          <Route path="/flows/:id/versions/:versionNo" element={<BuilderScreen />} />
          {DEV_ROUTES ? <Route path="/dev/components" element={<DevComponents />} /> : null}
          <Route path="*" element={<Navigate to="/flows" replace />} />
        </Routes>
    </BrowserRouter>
  );
  return (
    <ThemeProvider>
      <StoreProvider store={backend.store}>{backend.auth ? <AuthGate auth={backend.auth}>{routes}</AuthGate> : routes}</StoreProvider>
    </ThemeProvider>
  );
}
