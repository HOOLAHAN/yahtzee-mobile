import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { fetchAuthSession } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/api';
import { graphqlWithDevLog } from '../lib/apiLogger';

const client = generateClient();
export const lifecycleConsentVersion = '2026-09-21';
export interface LifecycleEmailPreference { enabled: boolean; consentedAt?: string | null; consentVersion?: string | null; consentSource?: 'WEB' | 'IOS' | 'ANDROID' | null; unsubscribedAt?: string | null }
const fields = 'enabled consentedAt consentVersion consentSource unsubscribedAt firstWebSeenAt lastWebSeenAt firstMobileSeenAt lastMobileSeenAt';
const platform = Platform.OS === 'android' ? 'ANDROID' : 'IOS';

async function authenticatedGraphql(query: string, variables?: Record<string, unknown>) {
  const session = await fetchAuthSession();
  const authToken = session.tokens?.idToken?.toString();
  if (!authToken) throw new Error('Sign in required.');
  const result = await graphqlWithDevLog(client, { query, variables, authMode: 'userPool', authToken });
  const response = result as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> };
  if (response.errors?.length) throw new Error(response.errors.map((error) => error.message).filter(Boolean).join('\n') || 'Email preference request failed.');
  return response.data || {};
}

export async function getLifecycleEmailPreference(): Promise<LifecycleEmailPreference> {
  const data = await authenticatedGraphql(`query MyLifecycleEmailPreference { myLifecycleEmailPreference { ${fields} } }`);
  return data.myLifecycleEmailPreference as LifecycleEmailPreference;
}

export async function updateLifecycleEmailPreference(enabled: boolean): Promise<LifecycleEmailPreference> {
  const data = await authenticatedGraphql(`mutation LifecycleEmailPreference($enabled:Boolean!,$consentVersion:String!,$source:ClientPlatform!){updateMyLifecycleEmailPreference(enabled:$enabled,consentVersion:$consentVersion,source:$source){${fields}}}`, { enabled, consentVersion: lifecycleConsentVersion, source: platform });
  return data.updateMyLifecycleEmailPreference as LifecycleEmailPreference;
}

export async function recordMobileActivity() {
  const today = new Date().toISOString().slice(0, 10);
  const key = `yahtzee.lifecycle.mobile-activity-date.${platform}`;
  if (await AsyncStorage.getItem(key) === today) return;
  await authenticatedGraphql('mutation RecordClientActivity($platform:ClientPlatform!){recordClientActivity(platform:$platform){enabled}}', { platform });
  await AsyncStorage.setItem(key, today);
}

const pendingKey = (email: string) => `yahtzee.lifecycle.pending-consent.${email.trim().toLowerCase()}`;
export async function rememberPendingLifecycleConsent(email: string, enabled: boolean) {
  if (enabled) await AsyncStorage.setItem(pendingKey(email), lifecycleConsentVersion);
  else await AsyncStorage.removeItem(pendingKey(email));
}
export async function applyPendingLifecycleConsent(email: string) {
  const key = pendingKey(email);
  if (!await AsyncStorage.getItem(key)) return;
  await updateLifecycleEmailPreference(true);
  await AsyncStorage.removeItem(key);
}
export async function deleteLifecycleEmailData() {
  await authenticatedGraphql('mutation DeleteMyLifecycleEmailData { deleteMyLifecycleEmailData }');
}
