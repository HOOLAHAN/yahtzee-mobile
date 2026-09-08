export const categories = [
  'Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes',
  'Three of a Kind', 'Four of a Kind', 'Full House',
  'Small Straight', 'Large Straight', 'Yahtzee', 'Chance',
] as const;

export type Category = typeof categories[number];
export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;
export const upperCategories = categories.slice(0, 6) as readonly Category[];
export const upperBonusThreshold = 63;
export const upperBonusPoints = 35;
export const repeatYahtzeeBonusPoints = 100;

export interface ScoreEntry {
  category: Category;
  score: number;
  dice: DieFace[];
  yahtzeeBonus?: number;
}

export const isYahtzeeRoll = (dice: DieFace[]) => dice.length === 5 && dice.every((die) => die === dice[0]);

export const repeatYahtzeeBonus = (entries: ScoreEntry[], dice: DieFace[]) =>
  isYahtzeeRoll(dice) && entries.some((entry) => entry.category === 'Yahtzee' && entry.score === 50)
    ? repeatYahtzeeBonusPoints
    : 0;

export type JokerTurn = {
  active: boolean;
  bonus: number;
  phase?: 'matching-upper' | 'open-lower' | 'remaining-upper';
  matchingUpper?: Category;
};

export const jokerTurn = (entries: ScoreEntry[], dice: DieFace[]): JokerTurn => {
  const yahtzeeEntry = entries.find((entry) => entry.category === 'Yahtzee');
  if (!yahtzeeEntry || !isYahtzeeRoll(dice)) return { active: false, bonus: 0 };
  const used = new Set(entries.map((entry) => entry.category));
  const matchingUpper = upperCategories[dice[0] - 1];
  const bonus = yahtzeeEntry.score === 50 ? repeatYahtzeeBonusPoints : 0;
  if (!used.has(matchingUpper)) return { active: true, bonus, phase: 'matching-upper', matchingUpper };
  if (categories.slice(6).some((category) => !used.has(category))) return { active: true, bonus, phase: 'open-lower', matchingUpper };
  return { active: true, bonus, phase: 'remaining-upper', matchingUpper };
};

export const rollDie = (): DieFace => (Math.floor(Math.random() * 6) + 1) as DieFace;

const countsFor = (dice: DieFace[]) => {
  const counts = new Map<number, number>();
  dice.forEach((die) => counts.set(die, (counts.get(die) ?? 0) + 1));
  return [...counts.values()];
};

const hasStraight = (dice: DieFace[], length: number) => {
  const values = [...new Set(dice)].sort((a, b) => a - b);
  let run = 1;
  for (let index = 1; index < values.length; index += 1) {
    run = values[index] === values[index - 1] + 1 ? run + 1 : 1;
    if (run >= length) return true;
  }
  return false;
};

export const scoreCategory = (category: Category, dice: DieFace[]) => {
  const sum = dice.reduce<number>((total, die) => total + die, 0);
  const counts = countsFor(dice);
  const numberIndex = categories.indexOf(category);

  if (numberIndex >= 0 && numberIndex <= 5) {
    const face = numberIndex + 1;
    return dice.filter((die) => die === face).reduce<number>((total, die) => total + die, 0);
  }

  switch (category) {
    case 'Three of a Kind': return counts.some((count) => count >= 3) ? sum : 0;
    case 'Four of a Kind': return counts.some((count) => count >= 4) ? sum : 0;
    case 'Full House': return counts.includes(3) && counts.includes(2) ? 25 : 0;
    case 'Small Straight': return hasStraight(dice, 4) ? 30 : 0;
    case 'Large Straight': return hasStraight(dice, 5) ? 40 : 0;
    case 'Yahtzee': return counts.includes(5) ? 50 : 0;
    case 'Chance': return sum;
    default: return 0;
  }
};

const jokerFixedScores: Partial<Record<Category, number>> = {
  'Full House': 25,
  'Small Straight': 30,
  'Large Straight': 40,
};

export const isCategoryEligibleForRoll = (category: Category, dice: DieFace[], entries: ScoreEntry[]) => {
  const used = new Set(entries.map((entry) => entry.category));
  if (used.has(category)) return false;
  const yahtzeeEntry = entries.find((entry) => entry.category === 'Yahtzee');
  if (!isYahtzeeRoll(dice) || !yahtzeeEntry) return true;
  const matchingUpper = upperCategories[dice[0] - 1];
  if (!used.has(matchingUpper)) return category === matchingUpper;
  const openLower = categories.slice(6).some((lower) => !used.has(lower));
  return openLower ? !upperCategories.includes(category) : upperCategories.includes(category);
};

export const scoreCategoryForTurn = (category: Category, dice: DieFace[], entries: ScoreEntry[]) => {
  if (!isCategoryEligibleForRoll(category, dice, entries)) return 0;
  const yahtzeeBoxUsed = entries.some((entry) => entry.category === 'Yahtzee');
  if (yahtzeeBoxUsed && isYahtzeeRoll(dice) && jokerFixedScores[category] !== undefined) return jokerFixedScores[category] ?? 0;
  return scoreCategory(category, dice);
};

export const maximumAvailableScore = (dice: DieFace[], used: Set<Category>) =>
  Math.max(...categories.filter((category) => !used.has(category)).map((category) => scoreCategory(category, dice)), 0);

const categoryMaximums: Record<Category, number> = {
  Ones: 5,
  Twos: 10,
  Threes: 15,
  Fours: 20,
  Fives: 25,
  Sixes: 30,
  'Three of a Kind': 30,
  'Four of a Kind': 30,
  'Full House': 25,
  'Small Straight': 30,
  'Large Straight': 40,
  Yahtzee: 50,
  Chance: 30,
};

export const categoryRecommendationValue = (category: Category, dice: DieFace[]) => {
  const score = scoreCategory(category, dice);
  if (score === 0) return -1;

  // Completed fixed combinations are excellent locks. Number categories are
  // measured by how many matching dice were secured, not just raw points.
  if (category === 'Yahtzee') return 4;
  if (category === 'Large Straight') return 3;
  if (category === 'Full House') return 2.25;
  if (category === 'Small Straight') return 2;
  if (upperCategories.includes(category)) return score / categoryMaximums[category];

  // Preserve flexible lower-section categories unless the roll fills them well.
  const opportunityCost = category === 'Chance' ? 0.5 : category === 'Four of a Kind' ? 0.8 : 0.72;
  return (score / categoryMaximums[category]) * opportunityCost;
};

export const upperSectionSubtotal = (entries: ScoreEntry[]) => entries
  .filter((entry) => upperCategories.includes(entry.category))
  .reduce((total, entry) => total + entry.score, 0);

export const upperSectionBonus = (entries: ScoreEntry[]) =>
  upperSectionSubtotal(entries) >= upperBonusThreshold ? upperBonusPoints : 0;

export const totalScore = (entries: ScoreEntry[]) =>
  entries.reduce((total, entry) => total + entry.score + (entry.yahtzeeBonus ?? 0), 0) + upperSectionBonus(entries);
