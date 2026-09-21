import { generateClient } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { graphqlWithDevLog } from '../lib/apiLogger';

export type LifecycleMode = 'SOLO' | 'DAILY' | 'COMPUTER' | 'PASS' | 'REAL' | 'REMOTE';
export type LifecycleAction = 'STARTED' | 'RESET' | 'MODE_SWITCH' | 'REMOTE_EXIT' | 'COMPLETED';

const client = generateClient();

export async function recordGameLifecycleEvent(input: {
  gameId: string;
  mode: LifecycleMode;
  action: LifecycleAction;
  round: number;
  score: number;
  categoriesFilled: number;
}) {
  const session = await fetchAuthSession();
  const authToken = session.tokens?.idToken?.toString();
  if (!authToken) return false;
  const result = await graphqlWithDevLog(client, {
    query: `mutation RecordGameLifecycleEvent($gameId:ID!,$mode:GameMode!,$action:GameLifecycleAction!,$round:Int!,$score:Int!,$categoriesFilled:Int!,$platform:ClientPlatform!){recordGameLifecycleEvent(gameId:$gameId,mode:$mode,action:$action,round:$round,score:$score,categoriesFilled:$categoriesFilled,platform:$platform)}`,
    authMode: 'userPool', authToken, variables: { ...input, platform: 'IOS' },
  });
  if (!('data' in result) || result.data.recordGameLifecycleEvent !== true) throw new Error('Unable to record game activity.');
  return true;
}
