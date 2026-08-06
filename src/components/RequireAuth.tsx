import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { LoginPage } from '../pages/LoginPage';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, error } = useAuth();

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          {error}
        </div>
      </div>
    );
  }

  if (status === 'signed-out') {
    return <LoginPage />;
  }

  return <>{children}</>;
}
