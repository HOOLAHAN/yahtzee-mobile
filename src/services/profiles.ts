import { fetchAuthSession } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/api';
import { graphqlWithDevLog } from '../lib/apiLogger';

const client = generateClient();
export interface UserProfile { userId: string; username: string; firstName: string; lastName: string; scoreSuggestionsEnabled: boolean; dailyReminderEnabled: boolean; dailyReminderHour: number }
const fields = 'userId username firstName lastName scoreSuggestionsEnabled dailyReminderEnabled dailyReminderHour';

export async function usernameAvailable(username: string) {
  const result = await graphqlWithDevLog(client, { query: `query Available($username:String!){usernameAvailable(username:$username)}`, authMode: 'apiKey', variables: { username } });
  return 'data' in result && result.data.usernameAvailable;
}

async function authenticatedGraphql(query: string, variables?: Record<string, unknown>) {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Sign in required.');
  return graphqlWithDevLog(client, { query, variables, authMode: 'userPool', authToken: token });
}

function profileResult<T>(result: unknown, field: string, fallback: string): T {
  const response = result as { data?: Record<string, T | null>; errors?: Array<{ message?: string }> };
  const value = response.data?.[field];
  if (value) return value;
  const message = response.errors?.map((error) => error.message).filter(Boolean).join('\n');
  if (message?.includes('username is already taken')) throw new Error('That username is already taken.');
  if (message) console.error(`[profiles.${field}]`, response.errors);
  throw new Error(fallback);
}

export async function getMyProfile(): Promise<UserProfile> {
  const result = await authenticatedGraphql(`query MyProfile { myProfile { ${fields} } }`);
  return profileResult<UserProfile>(result, 'myProfile', 'Unable to load profile. Please try again.');
}

export async function updateMyProfile(username: string, firstName: string, lastName: string): Promise<UserProfile> {
  const result = await authenticatedGraphql(`mutation Update($username:String!,$firstName:String!,$lastName:String!){updateMyProfile(username:$username,firstName:$firstName,lastName:$lastName){${fields}}}`, { username, firstName, lastName });
  return profileResult<UserProfile>(result, 'updateMyProfile', 'Unable to update profile. Please try again.');
}

export async function updateMyPreferences(scoreSuggestionsEnabled: boolean, dailyReminderEnabled: boolean, dailyReminderHour: number): Promise<UserProfile> {
  const query = `mutation Preferences($scoreSuggestionsEnabled:Boolean!,$dailyReminderEnabled:Boolean!,$dailyReminderHour:Int!){updateMyPreferences(scoreSuggestionsEnabled:$scoreSuggestionsEnabled,dailyReminderEnabled:$dailyReminderEnabled,dailyReminderHour:$dailyReminderHour){${fields}}}`;
  const result = await authenticatedGraphql(query, { scoreSuggestionsEnabled, dailyReminderEnabled, dailyReminderHour });
  return profileResult<UserProfile>(result, 'updateMyPreferences', 'Unable to save preferences. Please try again.');
}

export async function deleteMyProfile() { await authenticatedGraphql('mutation DeleteProfile { deleteMyProfile }'); }
