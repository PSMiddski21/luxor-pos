import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { RequireAuth } from './components/RequireAuth';
import { usePosStore } from './lib/store';
import { Layout } from './components/Layout';
import { PosPage } from './pages/PosPage';
import { StockPage } from './pages/StockPage';
import { RotaPage } from './pages/RotaPage';
import { TimesheetsPage } from './pages/TimesheetsPage';
import { ReportsPage } from './pages/ReportsPage';

function AppData({ children }: { children: React.ReactNode }) {
  const dataStatus = usePosStore((s) => s.dataStatus);
  const dataError = usePosStore((s) => s.dataError);
  const init = usePosStore((s) => s.init);

  useEffect(() => {
    if (dataStatus === 'idle') init();
  }, [dataStatus, init]);

  if (dataStatus === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          Failed to load data: {dataError}
        </div>
      </div>
    );
  }

  if (dataStatus !== 'ready') {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <AppData>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<PosPage />} />
                <Route path="stock" element={<StockPage />} />
                <Route path="rota" element={<RotaPage />} />
                <Route path="timesheets" element={<TimesheetsPage />} />
                <Route path="reports" element={<ReportsPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AppData>
      </RequireAuth>
    </AuthProvider>
  );
}

export default App;
