import { DieFace } from './game';

export const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const hashSeed = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const nextRandom = (seed: number) => {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

/**
 * Produces the five candidate dice for a numbered throw. Held dice are applied
 * by the game afterwards, so every player consumes the same five values.
 */
export const dailyDiceForThrow = (dateKey: string, throwIndex: number): DieFace[] =>
  Array.from({ length: 5 }, (_, dieIndex) => {
    const seed = hashSeed(`yahtzee-hub:${dateKey}:${throwIndex}:${dieIndex}`);
    return (Math.floor(nextRandom(seed) * 6) + 1) as DieFace;
  });
