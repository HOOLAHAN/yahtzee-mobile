import { Category, ScoreEntry, totalScore, upperSectionBonus } from './game';

export interface GameResultMetrics {
  score: number;
  yahtzeeCount: number;
  earnedUpperBonus: boolean;
  completedSmallStraight: boolean;
  completedLargeStraight: boolean;
  noZeroScores: boolean;
  scorecard?: string;
}

export const resultMetrics = (entries: ScoreEntry[]): GameResultMetrics => ({
  score: totalScore(entries),
  yahtzeeCount: entries.filter((entry) => entry.category === 'Yahtzee' && entry.score === 50).length,
  earnedUpperBonus: upperSectionBonus(entries) > 0,
  completedSmallStraight: entries.some((entry) => entry.category === 'Small Straight' && entry.score === 30),
  completedLargeStraight: entries.some((entry) => entry.category === 'Large Straight' && entry.score === 40),
  noZeroScores: entries.length === 13 && entries.every((entry) => entry.score > 0),
  scorecard: JSON.stringify(Object.fromEntries(entries.map((entry) => [entry.category, entry.score]))),
});

export const currentDailyStreak = (dateKeys: string[], today: string) => {
  const completed = new Set(dateKeys);
  const cursor = new Date(`${today}T00:00:00.000Z`);
  if (!completed.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (completed.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
};

export const hasScoredCategory = (entries: ScoreEntry[], category: Category) =>
  entries.some((entry) => entry.category === category && entry.score > 0);
