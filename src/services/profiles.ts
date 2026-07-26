import { fetchAuthSession } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/api';

const client = generateClient();
export interface UserProfile { userId: string; username: string; firstName: string; lastName: string }
const fields = 'userId username firstName lastName';

export async function usernameAvailable(username: string) {
  const result = await client.graphql({ query: `query Available($username:String!){usernameAvailable(username:$username)}`, authMode: 'apiKey', variables: { username } });
  return 'data' in result && result.data.usernameAvailable;
}

async function authenticatedGraphql(query: string, variables?: Record<string, string>) {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Sign in required.');
  return client.graphql({ query, variables, authMode: 'userPool', authToken: token });
}

export async function getMyProfile(): Promise<UserProfile> {
  const result = await authenticatedGraphql(`query MyProfile { myProfile { ${fields} } }`);
  if (!('data' in result) || !result.data.myProfile) throw new Error('Unable to load profile.');
  return result.data.myProfile as UserProfile;
}

export async function updateMyProfile(username: string, firstName: string, lastName: string): Promise<UserProfile> {
  const result = await authenticatedGraphql(`mutation Update($username:String!,$firstName:String!,$lastName:String!){updateMyProfile(username:$username,firstName:$firstName,lastName:$lastName){${fields}}}`, { username, firstName, lastName });
  if (!('data' in result) || !result.data.updateMyProfile) throw new Error('Unable to update profile.');
  return result.data.updateMyProfile as UserProfile;
}

export async function deleteMyProfile() { await authenticatedGraphql('mutation DeleteProfile { deleteMyProfile }'); }
