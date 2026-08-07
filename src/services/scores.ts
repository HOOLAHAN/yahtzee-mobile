import { generateClient } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { graphqlWithDevLog } from '../lib/apiLogger';

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
  mutation SubmitScore($id: ID!, $score: Int!) {
    submitScore(id: $id, score: $score) { id userId username score timestamp }
  }
`;

const verifySubmittedScore = `
  query VerifySubmittedScore($id: ID!) {
    getScore(id: $id) { id userId username score timestamp }
  }
`;

export async function fetchLeaderboard() {
  const result = await graphqlWithDevLog(client, {
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
  const result = await graphqlWithDevLog(client, {
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

const describeError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { errors?: { message?: string }[]; message?: string };
    return candidate.errors?.map((item) => item.message).filter(Boolean).join(', ') || candidate.message || JSON.stringify(error);
  }
  return String(error);
};

export async function submitScore(id: string, score: number, userId: string) {
  try {
    const session = await fetchAuthSession({ forceRefresh: true });
    if (!session.tokens?.idToken) throw new Error('Your sign-in session has expired. Please sign out and sign in again.');

    console.info('[scores.submit] Sending authenticated score', { score, userId, tokenExpiresAt: session.tokens.idToken.payload.exp });
    const result = await graphqlWithDevLog(client, { query: submitScoreMutation, authMode: 'userPool', authToken: session.tokens.idToken.toString(), variables: { id, score } });
    if (!('data' in result) || !result.data.submitScore) throw new Error('AppSync returned no score after submission.');
    console.info('[scores.submit] Score accepted', { id: result.data.submitScore.id, score: result.data.submitScore.score });
    return result.data.submitScore;
  } catch (error) {
    const message = describeError(error);
    console.error('[scores.submit] Authenticated mutation failed', { message, score, userId, error });

    // A mobile connection can drop after DynamoDB commits but before AppSync's
    // response reaches the client. Verify that ambiguous outcome before showing
    // a failure or allowing a retry that could create a duplicate score.
    try {
      const verification = await graphqlWithDevLog(client, { query: verifySubmittedScore, authMode: 'apiKey', variables: { id } });
      const committed = 'data' in verification ? verification.data.getScore as LeaderboardScore | null : null;
      // A game ID is generated once and persisted with its scorecard. Matching
      // the same user and score makes retries idempotent, even from a queue.
      const verified = committed?.userId === userId && committed.score === score;
      if (committed && verified) {
        console.warn('[scores.submit] Response failed, but the committed score was verified', { id: committed.id, score });
        return committed;
      }
    } catch (verificationError) {
      console.error('[scores.submit] Commit verification failed', { message: describeError(verificationError), verificationError });
    }

    throw new Error(message || 'Unable to submit score.');
  }
}
