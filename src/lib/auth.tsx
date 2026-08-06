import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import {
  fetchAuthSession,
  getCurrentUser,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
} from 'aws-amplify/auth';
import { loadConfig } from './config';

interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in' | 'error';
  email?: string;
  error?: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [email, setEmail] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadConfig()
      .then((config) => {
        Amplify.configure({
          Auth: {
            Cognito: {
              userPoolId: config.userPoolId,
              userPoolClientId: config.userPoolClientId,
            },
          },
        });
        return getCurrentUser();
      })
      .then((user) => {
        setEmail(user.signInDetails?.loginId ?? user.username);
        setStatus('signed-in');
      })
      .catch((err) => {
        // "not signed in" resolves the same way as any other auth error from
        // getCurrentUser — only surface a hard error if config itself failed.
        if (err instanceof Error && err.message.includes('config.json')) {
          setError(err.message);
          setStatus('error');
        } else {
          setStatus('signed-out');
        }
      });
  }, []);

  const signIn = async (username: string, password: string) => {
    await amplifySignIn({ username, password });
    setEmail(username);
    setStatus('signed-in');
  };

  const signOut = async () => {
    await amplifySignOut();
    setEmail(undefined);
    setStatus('signed-out');
  };

  return (
    <AuthContext.Provider value={{ status, email, error, signIn, signOut }}>
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
