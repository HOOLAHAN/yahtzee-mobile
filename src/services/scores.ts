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

const submitScoreMutation = `
  mutation SubmitScore($score: Int!) {
    submitScore(score: $score) { id userId username score timestamp }
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

export async function fetchUserScores(userId: string) {
  const result = await client.graphql({
    query: `query UserScores($userId: String!, $limit: Int) {
      listScores(filter: { userId: { eq: $userId } }, limit: $limit) {
        items { id userId username score timestamp }
      }
    }`,
    authMode: 'apiKey',
    variables: { userId, limit: 100 },
  });
  if (!('data' in result)) throw new Error('Unable to load your scores.');
  return (result.data.listScores.items.filter(Boolean) as LeaderboardScore[])
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export async function submitScore(score: number) {
  const result = await client.graphql({
    query: submitScoreMutation,
    authMode: 'userPool',
    variables: { score },
  });
  if (!('data' in result)) throw new Error('Unable to submit score.');
  return result.data.submitScore;
}
