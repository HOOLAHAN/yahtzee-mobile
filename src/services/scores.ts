import { generateClient } from 'aws-amplify/api';

export interface LeaderboardScore {
  id: string;
  userId: string;
  username: string;
  score: number;
  timestamp: string;
}

const client = generateClient();

const listScores = `
  query ListScores($limit: Int) {
    listScores(limit: $limit) {
      items { id userId username score timestamp }
    }
  }
`;

const createScore = `
  mutation CreateScore($input: CreateScoreInput!) {
    createScore(input: $input) { id userId username score timestamp }
  }
`;

export async function fetchLeaderboard() {
  const result = await client.graphql({
    query: listScores,
    authMode: 'apiKey',
    variables: { limit: 100 },
  });
  if (!('data' in result)) throw new Error('Unable to load scores.');
  return (result.data.listScores.items.filter(Boolean) as LeaderboardScore[])
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export async function submitScore(input: Omit<LeaderboardScore, 'id'>) {
  const id = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const result = await client.graphql({
    query: createScore,
    authMode: 'apiKey',
    variables: { input: { id, ...input } },
  });
  if (!('data' in result)) throw new Error('Unable to submit score.');
  return result.data.createScore;
}
