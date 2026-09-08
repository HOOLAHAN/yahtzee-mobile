import AsyncStorage from '@react-native-async-storage/async-storage';
import { submitScore } from './scores';

const storageKey = 'yahtzee.pending-scores.v1';

export interface PendingScore {
  id: string;
  score: number;
  // Scores completed while signed out stay unclaimed until the next account
  // signs in on this device.
  userId?: string;
  queuedAt: string;
}

export interface PendingScoreFlushResult {
  submitted: PendingScore[];
  remaining: PendingScore[];
}

const listeners = new Set<() => void>();
let flushPromise: Promise<PendingScoreFlushResult> | null = null;

const notify = () => listeners.forEach((listener) => listener());

async function readQueue() {
  try {
    const value = await AsyncStorage.getItem(storageKey);
    if (!value) return [];
    const parsed = JSON.parse(value) as PendingScore[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.id && Number.isInteger(item.score) && (!item.userId || typeof item.userId === 'string'))
      : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: PendingScore[]) {
  if (items.length) await AsyncStorage.setItem(storageKey, JSON.stringify(items));
  else await AsyncStorage.removeItem(storageKey);
  notify();
}

export async function queueScore(score: Omit<PendingScore, 'queuedAt'>) {
  const current = await readQueue();
  const item = { ...score, queuedAt: new Date().toISOString() };
  const existing = current.findIndex((pending) => pending.id === score.id);
  if (existing >= 0) current[existing] = item;
  else current.push(item);
  await writeQueue(current);
  return item;
}

export async function isScorePending(id: string) {
  return (await readQueue()).some((item) => item.id === id);
}

export function subscribeToPendingScores(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function isRetryableScoreError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return ![
    'validation', 'score must',
  ].some((text) => message.includes(text));
}

export async function flushPendingScores(userId: string): Promise<PendingScoreFlushResult> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    const current = await readQueue();
    const claimed = current.map((item) => item.userId ? item : { ...item, userId });
    // Claim guest scores before attempting the network call. If the app closes
    // during submission, the score remains durably tied to this account.
    if (claimed.some((item, index) => item !== current[index])) await writeQueue(claimed);
    const submitted: PendingScore[] = [];
    const remaining: PendingScore[] = [];

    for (const item of claimed) {
      if (item.userId !== userId) {
        remaining.push(item);
        continue;
      }
      try {
        await submitScore(item.id, item.score, item.userId);
        submitted.push(item);
      } catch {
        remaining.push(item);
      }
    }

    if (submitted.length) await writeQueue(remaining);
    return { submitted, remaining };
  })().finally(() => { flushPromise = null; });
  return flushPromise;
}
