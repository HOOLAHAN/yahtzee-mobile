import { generateClient } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Category, DieFace, ScoreEntry } from '../lib/game';
import { graphqlWithDevLog } from '../lib/apiLogger';

export type LiveGameStatus = 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
export type LiveGameAction =
  | { type: 'ROLL' }
  | { type: 'TOGGLE_HOLD'; index: number }
  | { type: 'SELECT_CATEGORY'; category: Category }
  | { type: 'LOCK_CATEGORY'; category: Category }
  | { type: 'LEAVE' };

export interface LiveGame {
  id: string;
  code: string;
  status: LiveGameStatus;
  hostUserId: string;
  hostUsername: string;
  guestUserId?: string | null;
  guestUsername?: string | null;
  currentUserId: string;
  round: number;
  dice: DieFace[];
  held: number[];
  rollsLeft: number;
  hasRolled: boolean;
  selectedCategory?: Category | null;
  hostScores: ScoreEntry[];
  guestScores: ScoreEntry[];
  winnerUserId?: string | null;
  endedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

const client = generateClient();
const fields = 'id code status hostUserId hostUsername guestUserId guestUsername currentUserId round dice held rollsLeft hasRolled selectedCategory hostScores guestScores winnerUserId endedByUserId createdAt updatedAt';

async function request<T>(query: string, field: string, variables?: Record<string, unknown>): Promise<T> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Sign in to play a remote game.');
  const result = await graphqlWithDevLog(client, { query, variables, authMode: 'userPool', authToken: token }) as { data?: Record<string, T | null>; errors?: Array<{ message?: string }> };
  const value = result.data?.[field];
  if (value) return value;
  throw new Error(result.errors?.map((error) => error.message).filter(Boolean).join('\n') || 'Unable to update the remote game.');
}

const parseJsonArray = <T>(value: T[] | string | null | undefined): T[] => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};
const parseGame = (game: LiveGame): LiveGame => ({
  ...game,
  dice: parseJsonArray<DieFace>(game.dice),
  held: parseJsonArray<number>(game.held),
  hostScores: parseJsonArray<ScoreEntry>(game.hostScores),
  guestScores: parseJsonArray<ScoreEntry>(game.guestScores),
});

export async function createLiveGame() {
  return parseGame(await request<LiveGame>(`mutation CreateLiveGame { createLiveGame { ${fields} } }`, 'createLiveGame'));
}

export async function joinLiveGame(code: string) {
  return parseGame(await request<LiveGame>(`mutation JoinLiveGame($code:String!){joinLiveGame(code:$code){${fields}}}`, 'joinLiveGame', { code }));
}

export async function fetchLiveGame(gameId: string) {
  return parseGame(await request<LiveGame>(`query LiveGame($gameId:ID!){liveGame(gameId:$gameId){${fields}}}`, 'liveGame', { gameId }));
}

export async function fetchMyLiveGames() {
  return (await request<LiveGame[]>(`query MyLiveGames { myLiveGames { ${fields} } }`, 'myLiveGames')).map(parseGame);
}

export async function updateLiveGame(gameId: string, action: LiveGameAction) {
  return parseGame(await request<LiveGame>(`mutation UpdateLiveGame($gameId:ID!,$action:AWSJSON!){updateLiveGame(gameId:$gameId,action:$action){${fields}}}`, 'updateLiveGame', { gameId, action: JSON.stringify(action) }));
}

export async function subscribeToLiveGame(gameId: string, onGame: (game: LiveGame) => void, onError: (error: Error) => void) {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Sign in to watch a remote game.');
  const operation = client.graphql({
    query: `subscription LiveGameChanged($id:ID!){onLiveGameChanged(id:$id){${fields}}}`,
    variables: { id: gameId },
    authMode: 'userPool',
    authToken: token,
  }) as unknown as { subscribe?: (observer: { next: (event: { data?: { onLiveGameChanged?: LiveGame | null } }) => void; error: (error: unknown) => void }) => { unsubscribe: () => void } };
  if (typeof operation?.subscribe !== 'function') {
    onError(new Error('Live stream unavailable. Reconnecting with refresh…'));
    return { unsubscribe: () => undefined };
  }
  return operation.subscribe({
    next: (event) => { if (event.data?.onLiveGameChanged) onGame(parseGame(event.data.onLiveGameChanged)); },
    error: (error) => onError(error instanceof Error ? error : new Error('Live updates were interrupted. Reconnecting…')),
  });
}
