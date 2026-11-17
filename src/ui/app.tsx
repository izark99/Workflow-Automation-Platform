import { BrowserRouter, Route, Routes } from 'react-router-dom';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<h1>Data Flow</h1>} />
      </Routes>
    </BrowserRouter>
  );
}
