import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { confirmResetPassword, confirmSignUp, fetchUserAttributes, getCurrentUser, resendSignUpCode, resetPassword, signIn, signOut, signUp } from 'aws-amplify/auth';

interface UserDetails {
  userId: string;
  username: string;
  email?: string;
}

interface AuthValue {
  user: UserDetails | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, username: string): Promise<string>;
  confirmRegistration(email: string, code: string): Promise<void>;
  resendRegistrationCode(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  finishPasswordReset(email: string, code: string, newPassword: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [current, attributes] = await Promise.all([getCurrentUser(), fetchUserAttributes()]);
      setUser({
        userId: current.username,
        username: attributes.preferred_username || attributes.email || current.username,
        email: attributes.email,
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    login: async (email, password) => {
      await signIn({ username: email.trim(), password });
      await refresh();
    },
    register: async (email, password, username) => {
      const result = await signUp({
        username: email.trim(),
        password,
        options: { userAttributes: { email: email.trim(), preferred_username: username.trim() } },
      });
      return result.nextStep.signUpStep;
    },
    confirmRegistration: async (email, code) => {
      await confirmSignUp({ username: email.trim(), confirmationCode: code.trim() });
    },
    resendRegistrationCode: async (email) => {
      await resendSignUpCode({ username: email.trim() });
    },
    requestPasswordReset: async (email) => {
      await resetPassword({ username: email.trim() });
    },
    finishPasswordReset: async (email, code, newPassword) => {
      await confirmResetPassword({ username: email.trim(), confirmationCode: code.trim(), newPassword });
    },
    logout: async () => {
      await signOut();
      setUser(null);
    },
  }), [loading, refresh, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
