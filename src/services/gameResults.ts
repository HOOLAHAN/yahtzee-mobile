import { generateClient } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { GameResultMetrics } from '../lib/engagement';
import { graphqlWithDevLog } from '../lib/apiLogger';

export type ResultMode = 'SOLO' | 'DAILY' | 'COMPUTER' | 'PASS' | 'REAL' | 'REMOTE';
export interface GameResult extends GameResultMetrics {
  id: string; userId: string; username: string; mode: ResultMode; modeDate: string;
  challengeDate?: string; completedAt: string; yahtzeeOnFinalRoll: boolean;
  scorecard?: string;
  session?: string;
}

export interface DailyRoundStanding {
  challengeDate: string;
  round: number;
  score: number;
  rank: number;
  playerCount: number;
  percentile: number;
}

const client = generateClient();
const fields = 'id userId username mode modeDate challengeDate score completedAt yahtzeeCount earnedUpperBonus completedSmallStraight completedLargeStraight noZeroScores yahtzeeOnFinalRoll scorecard session';

async function authToken() {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Sign in to save progress and join the leaderboard.');
  return { token, userId: String(session.tokens?.idToken?.payload.sub), username: String(session.tokens?.idToken?.payload.preferred_username ?? session.tokens?.idToken?.payload.email ?? 'Player') };
}

export async function createGameResult(input: Omit<GameResult, 'userId' | 'username'>) {
  const auth = await authToken();
  const { modeDate: _modeDate, completedAt: _completedAt, challengeDate, ...metrics } = input;
  const result = await graphqlWithDevLog(client, {
    query: `mutation SubmitGameResult($input:SubmitGameResultInput!){submitGameResult(input:$input){${fields}}}`,
    authMode: 'userPool', authToken: auth.token, variables: { input: { ...metrics, challengeDate } },
  });
  if (!('data' in result) || !result.data.submitGameResult) throw new Error('Unable to save this completed game.');
  return result.data.submitGameResult as GameResult;
}

export async function submitDailyRoundProgress(challengeDate: string, round: number, score: number) {
  const auth = await authToken();
  const result = await graphqlWithDevLog(client, {
    query: `mutation DailyRoundProgress($challengeDate:AWSDate!,$round:Int!,$score:Int!){submitDailyRoundProgress(challengeDate:$challengeDate,round:$round,score:$score){challengeDate round score rank playerCount percentile}}`,
    authMode: 'userPool', authToken: auth.token, variables: { challengeDate, round, score },
  });
  if (!('data' in result) || !result.data.submitDailyRoundProgress) throw new Error('Unable to load your live Daily Challenge standing.');
  return result.data.submitDailyRoundProgress as DailyRoundStanding;
}

export async function fetchMyGameResults(userId: string, limit = 500) {
  const result = await graphqlWithDevLog(client, {
    query: `query MyGameResults($userId:String!,$limit:Int){gameResultsByUser(userId:$userId,sortDirection:DESC,limit:$limit){items{${fields}}}}`,
    authMode: 'apiKey', variables: { userId, limit },
  });
  if (!('data' in result)) throw new Error('Unable to load progress.');
  return result.data.gameResultsByUser.items.filter(Boolean) as GameResult[];
}

export async function fetchDailyResults(dateKey: string, limit = 100) {
  const result = await graphqlWithDevLog(client, {
    query: `query DailyResults($modeDate:String!,$limit:Int){gameResultsByModeDate(modeDate:$modeDate,sortDirection:DESC,limit:$limit){items{${fields}}}}`,
    authMode: 'apiKey', variables: { modeDate: `DAILY#${dateKey}`, limit },
  });
  if (!('data' in result)) throw new Error('Unable to load the Daily leaderboard.');
  return result.data.gameResultsByModeDate.items.filter(Boolean) as GameResult[];
}

export async function fetchSoloResults(limit = 500) {
  const result = await graphqlWithDevLog(client, {
    query: `query SoloResults($modeDate:String!,$limit:Int){gameResultsByModeDate(modeDate:$modeDate,sortDirection:DESC,limit:$limit){items{${fields}}}}`,
    authMode: 'apiKey', variables: { modeDate: 'SOLO#ALL', limit },
  });
  if (!('data' in result)) throw new Error('Unable to load Solo game details.');
  return result.data.gameResultsByModeDate.items.filter(Boolean) as GameResult[];
}

export async function fetchAllDailyResults(limit = 500) {
  const result = await graphqlWithDevLog(client, {
    query: `query AllDailyResults($mode:GameMode!,$limit:Int){gameResultsByMode(mode:$mode,sortDirection:DESC,limit:$limit){items{${fields}}}}`,
    authMode: 'apiKey', variables: { mode: 'DAILY', limit },
  });
  if (!('data' in result)) throw new Error('Unable to load Daily Challenge results.');
  return result.data.gameResultsByMode.items.filter(Boolean) as GameResult[];
}

export async function fetchResultsByMode(mode: ResultMode, limit = 1000) {
  const result = await graphqlWithDevLog(client, {
    query: `query ResultsByMode($mode:GameMode!,$limit:Int){gameResultsByMode(mode:$mode,sortDirection:DESC,limit:$limit){items{${fields}}}}`,
    authMode: 'apiKey', variables: { mode, limit },
  });
  if (!('data' in result)) throw new Error('Unable to load game results.');
  return result.data.gameResultsByMode.items.filter(Boolean) as GameResult[];
}

export type ResultPeriod = 'today' | 'week' | 'month' | 'all';
export const periodStart = (period: ResultPeriod, now = new Date()) => {
  if (period === 'all') return null;
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (period === 'today') return start;
  if (period === 'week') { const day = start.getDay() || 7; start.setDate(start.getDate() - day + 1); return start; }
  start.setDate(1); return start;
};
export const filterResultsByPeriod = <T extends { completedAt?: string; timestamp?: string }>(results: T[], period: ResultPeriod) => {
  const start = periodStart(period); if (!start) return results;
  return results.filter((result) => new Date(result.completedAt ?? result.timestamp ?? 0) >= start);
};
export interface PeriodLeaderboardEntry {
  id: string; userId: string; username: string; score: number; timestamp: string;
}

export const utcWeekDateKeys = (date = new Date()) => {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - day + 1);
  return Array.from({ length: 7 }, (_, offset) => {
    const value = new Date(monday); value.setUTCDate(monday.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  });
};

export async function fetchWeeklyResults(date = new Date()): Promise<PeriodLeaderboardEntry[]> {
  const results = (await Promise.all(utcWeekDateKeys(date).map((key) => fetchDailyResults(key)))).flat();
  const players = new Map<string, { username: string; scores: number[]; timestamp: string }>();
  results.forEach((result) => {
    const player = players.get(result.userId) ?? { username: result.username, scores: [], timestamp: result.completedAt };
    player.scores.push(result.score); player.username = result.username;
    if (result.completedAt > player.timestamp) player.timestamp = result.completedAt;
    players.set(result.userId, player);
  });
  return [...players.entries()].map(([userId, player]) => ({
    id: `week:${utcWeekDateKeys(date)[0]}:${userId}`, userId, username: player.username,
    score: player.scores.sort((a, b) => b - a).slice(0, 5).reduce((sum, score) => sum + score, 0), timestamp: player.timestamp,
  })).sort((a, b) => b.score - a.score).slice(0, 100);
}
