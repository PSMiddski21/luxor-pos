import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import {
  fetchAuthSession,
  getCurrentUser,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
} from 'aws-amplify/auth';
import { loadConfig } from './config';
import { isMockConfig } from './mock';

export type Role = 'till' | 'admin';

interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in' | 'error';
  email?: string;
  role: Role;
  error?: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Real deployments put the logged-in user in Cognito's "admin" group (see
// AdminGroup in infra/lib/luxor-stack.ts) for the full admin view;
// everyone else gets the till-only view. No separate "till" group to manage.
async function roleFromSession(): Promise<Role> {
  const session = await fetchAuthSession();
  const groups = session.tokens?.idToken?.payload?.['cognito:groups'];
  return Array.isArray(groups) && groups.includes('admin') ? 'admin' : 'till';
}

// Local preview has no real Cognito groups to check, so the role is derived
// from the email typed at sign-in instead — "admin@..." (or any email
// containing "admin") signs in as admin, everything else as till. This
// lets you preview both views locally without a deployed stack.
function mockRoleFromEmail(email: string): Role {
  return email.toLowerCase().includes('admin') ? 'admin' : 'till';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [email, setEmail] = useState<string>();
  const [role, setRole] = useState<Role>('till');
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const config = await loadConfig();
        if (isMockConfig(config)) {
          if (!cancelled) setStatus('signed-out');
          return;
        }

        Amplify.configure({
          Auth: {
            Cognito: {
              userPoolId: config.userPoolId,
              userPoolClientId: config.userPoolClientId,
            },
          },
        });
        const user = await getCurrentUser();
        const userRole = await roleFromSession();
        if (!cancelled) {
          setEmail(user.signInDetails?.loginId ?? user.username);
          setRole(userRole);
          setStatus('signed-in');
        }
      } catch (err) {
        if (cancelled) return;
        // "not signed in" resolves the same way as any other auth error from
        // getCurrentUser — only surface a hard error if config itself failed.
        if (err instanceof Error && err.message.includes('config.json')) {
          setError(err.message);
          setStatus('error');
        } else {
          setStatus('signed-out');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (username: string, password: string) => {
    const config = await loadConfig();
    if (isMockConfig(config)) {
      setEmail(username);
      setRole(mockRoleFromEmail(username));
      setStatus('signed-in');
      return;
    }
    await amplifySignIn({ username, password });
    const userRole = await roleFromSession();
    setEmail(username);
    setRole(userRole);
    setStatus('signed-in');
  };

  const signOut = async () => {
    const config = await loadConfig();
    if (isMockConfig(config)) {
      setEmail(undefined);
      setRole('till');
      setStatus('signed-out');
      return;
    }
    await amplifySignOut();
    setEmail(undefined);
    setRole('till');
    setStatus('signed-out');
  };

  return (
    <AuthContext.Provider value={{ status, email, role, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export async function getAuthHeader(): Promise<Record<string, string>> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
