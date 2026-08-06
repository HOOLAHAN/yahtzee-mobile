import { DieFace } from './game';

export const utcDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

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
