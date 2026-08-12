export type DiceAnimation = 'classic' | 'bounceSpin' | 'shake' | 'quickFlip';

export const defaultDiceAnimation: DiceAnimation = 'classic';
export const diceAnimationStorageKey = 'yahtzee.dice-animation.v1';
export const diceAnimationOptions: { value: DiceAnimation; label: string; description: string; icon: string }[] = [
  { value: 'classic', label: 'Classic', description: 'The original smooth throw', icon: 'sync-outline' },
  { value: 'bounceSpin', label: 'Bouncing Spin', description: 'A higher, springy landing', icon: 'trending-up-outline' },
  { value: 'shake', label: 'Hand Shake', description: 'A quick tabletop rattle', icon: 'swap-horizontal-outline' },
  { value: 'quickFlip', label: 'Quick Flip', description: 'Fast and snappy', icon: 'flash-outline' },
];
