import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

// Gates admin-only routes (Stock, Rota, Reports) — a till user hitting the
// URL directly bounces back to POS, same as if the nav link weren't there.
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  if (role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
