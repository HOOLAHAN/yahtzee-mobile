import { generateClient } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Category, DieFace, ScoreEntry } from '../lib/game';
import { graphqlWithDevLog } from '../lib/apiLogger';

export type LiveGameStatus = 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
export type LiveGameAction =
  | { type: 'ROLL'; actionId?: string }
  | { type: 'TOGGLE_HOLD'; index: number; actionId?: string }
  | { type: 'SELECT_CATEGORY'; category: Category; actionId?: string }
  | { type: 'LOCK_CATEGORY'; category: Category; actionId?: string }
  | { type: 'LEAVE'; actionId?: string }
  | { type: 'REMATCH'; actionId?: string };

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
  let parsed: unknown = value;
  try {
    for (let pass = 0; pass < 2 && typeof parsed === 'string'; pass += 1) parsed = JSON.parse(parsed);
    return Array.isArray(parsed) ? parsed as T[] : [];
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
  const stableAction = { ...action, actionId: action.actionId || `${Date.now()}-${Math.random().toString(36).slice(2)}` };
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return parseGame(await request<LiveGame>(`mutation UpdateLiveGame($gameId:ID!,$action:AWSJSON!){updateLiveGame(gameId:$gameId,action:$action){${fields}}}`, 'updateLiveGame', { gameId, action: JSON.stringify(stableAction) })); }
    catch (error) { lastError = error; if (!attempt) await new Promise((resolve) => setTimeout(resolve, 450)); }
  }
  throw lastError;
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
