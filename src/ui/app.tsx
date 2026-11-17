import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { DevComponents } from './screens/dev-components';

// The components page is development only: it is built in when VITE_DEV_ROUTES=true (the dev server, the UI-rules and e2e builds).
const DEV_ROUTES = import.meta.env.DEV || import.meta.env.VITE_DEV_ROUTES === 'true';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {DEV_ROUTES ? <Route path="/dev/components" element={<DevComponents />} /> : null}
        <Route path="*" element={<h1>Data Flow</h1>} />
      </Routes>
    </BrowserRouter>
  );
}
