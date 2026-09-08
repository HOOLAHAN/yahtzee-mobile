import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { confirmResetPassword, confirmSignUp, deleteUser, fetchAuthSession, fetchUserAttributes, getCurrentUser, resendSignUpCode, resetPassword, signIn, signOut, signUp, updatePassword } from 'aws-amplify/auth';
import { deleteMyProfile, updateMyProfile } from '../services/profiles';
import { disableAppPushNotifications } from '../services/pushNotifications';

interface UserDetails {
  userId: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: 'ADMIN' | 'PLAYER';
}

interface AuthValue {
  user: UserDetails | null;
  loading: boolean;
  login(email: string, password: string): Promise<string>;
  register(email: string, password: string, username: string, firstName: string, lastName: string): Promise<string>;
  refreshUser(): Promise<void>;
  confirmRegistration(email: string, code: string): Promise<void>;
  resendRegistrationCode(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  finishPasswordReset(email: string, code: string, newPassword: string): Promise<void>;
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
  deleteAccount(): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [current, attributes, session] = await Promise.all([getCurrentUser(), fetchUserAttributes(), fetchAuthSession()]);
      const groups = session.tokens?.idToken?.payload['cognito:groups'];
      setUser({
        userId: current.username,
        username: attributes.preferred_username || attributes.email || current.username,
        email: attributes.email,
        firstName: attributes.given_name,
        lastName: attributes.family_name,
        role: Array.isArray(groups) && groups.includes('Admin') ? 'ADMIN' : 'PLAYER',
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
      const result = await signIn({ username: email.trim(), password });
      if (!result.isSignedIn) return result.nextStep.signInStep;
      const attributes = await fetchUserAttributes();
      if (attributes.preferred_username && attributes.given_name && attributes.family_name) {
        try {
          await updateMyProfile(attributes.preferred_username, attributes.given_name, attributes.family_name);
        } catch {
          // Cognito sign-in succeeded, but another account may have claimed the
          // requested public username while this account awaited verification.
          await refresh();
          return 'PROFILE_REQUIRED';
        }
        await fetchAuthSession({ forceRefresh: true });
      }
      await refresh();
      return 'DONE';
    },
    register: async (email, password, username, firstName, lastName) => {
      const result = await signUp({
        username: email.trim(),
        password,
        options: { userAttributes: { email: email.trim(), preferred_username: username.trim(), given_name: firstName.trim(), family_name: lastName.trim() } },
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
    changePassword: async (oldPassword, newPassword) => {
      await updatePassword({ oldPassword, newPassword });
    },
    deleteAccount: async () => {
      await deleteMyProfile().catch(() => undefined);
      await deleteUser();
      setUser(null);
    },
    refreshUser: async () => { await fetchAuthSession({ forceRefresh: true }); await refresh(); },
    logout: async () => {
      await disableAppPushNotifications().catch(() => undefined);
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
