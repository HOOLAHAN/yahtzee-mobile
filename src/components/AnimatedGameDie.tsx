import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text, useArcadeMode } from './AppText';
import { defaultDiceAnimation, DiceAnimation } from '../lib/diceAnimation';
import { DieFace } from '../lib/game';
import { colors } from '../theme';

const pipCells: Record<DieFace, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

export function AnimatedGameDie({ value, index, held, rollToken, canHold, reduceMotion, resetPosition = false, animation = defaultDiceAnimation, compact = false, accentColor, heldColor, softColor, onPress }: {
  value: DieFace; index: number; held: boolean; rollToken: number; canHold: boolean; reduceMotion: boolean; resetPosition?: boolean; animation?: DiceAnimation; compact?: boolean; accentColor: string; heldColor: string; softColor: string; onPress: () => void;
}) {
  const arcadeMode = useArcadeMode();
  const spin = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const lastRollToken = useRef(0);

  useEffect(() => {
    if (!resetPosition) return;
    spin.stopAnimation(); lift.stopAnimation(); scale.stopAnimation(); sway.stopAnimation();
    spin.setValue(0); lift.setValue(0); scale.setValue(1); sway.setValue(0);
  }, [lift, resetPosition, scale, spin, sway]);

  useEffect(() => {
    if (!held) return;
    spin.stopAnimation(); lift.stopAnimation(); scale.stopAnimation(); sway.stopAnimation();
    spin.setValue(0); lift.setValue(0); scale.setValue(1); sway.setValue(0);
  }, [held, lift, scale, spin, sway]);

  useEffect(() => {
    if (rollToken === 0 || lastRollToken.current === rollToken) return;
    lastRollToken.current = rollToken;
    if (held || reduceMotion) return;
    spin.setValue(0); lift.setValue(0); scale.setValue(animation === 'classic' ? 0.78 : 1); sway.setValue(0);
    const classic = Animated.parallel([
      Animated.timing(spin, { toValue: 1, duration: 620 + index * 45, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([Animated.timing(lift, { toValue: -22 - (index % 2) * 8, duration: 210, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.spring(lift, { toValue: 0, speed: 16, bounciness: 11, useNativeDriver: true })]),
      Animated.sequence([Animated.timing(scale, { toValue: 1.16, duration: 230, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.spring(scale, { toValue: 1, speed: 18, bounciness: 12, useNativeDriver: true })]),
    ]);
    const bounceSpin = Animated.parallel([Animated.timing(spin, { toValue: 1, duration: 820 + index * 35, easing: Easing.out(Easing.cubic), useNativeDriver: true }), Animated.sequence([Animated.timing(lift, { toValue: -42 - index * 3, duration: 250, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.spring(lift, { toValue: 0, speed: 13, bounciness: 18, useNativeDriver: true })]), Animated.sequence([Animated.timing(scale, { toValue: 1.12, duration: 250, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 16, useNativeDriver: true })])]);
    const shake = Animated.sequence([-1, 1, -.85, .85, -.55, .55, 0].map((position) => Animated.timing(sway, { toValue: position, duration: 55, easing: Easing.linear, useNativeDriver: true })));
    const quickFlip = Animated.parallel([Animated.timing(spin, { toValue: 1, duration: 320 + index * 20, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }), Animated.sequence([Animated.timing(scale, { toValue: .82, duration: 110, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, speed: 24, bounciness: 8, useNativeDriver: true })])]);
    (animation === 'bounceSpin' ? bounceSpin : animation === 'shake' ? shake : animation === 'quickFlip' ? quickFlip : classic).start(({ finished }) => {
      if (!finished) return;
      spin.setValue(0); lift.setValue(0); scale.setValue(1); sway.setValue(0);
    });
  }, [animation, held, index, lift, reduceMotion, rollToken, scale, spin, sway]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', index % 2 === 0 ? '720deg' : '-720deg'] });
  const translateX = sway.interpolate({ inputRange: [-1, 1], outputRange: [-11, 11] });
  return <Animated.View style={[styles.slot, compact && styles.compactSlot, { transform: [{ translateX }, { translateY: lift }, { rotate }, { scale }] }, held && styles.heldSlot]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Die ${index + 1}, ${value}${held ? ', held' : ''}`} accessibilityHint={canHold ? `Double tap to ${held ? 'release' : 'hold'} this die` : 'Roll before holding dice'} accessibilityState={{ disabled: !canHold, selected: held }} disabled={!canHold} onPress={onPress} style={({ pressed }) => [styles.die, compact && styles.compactDie, { backgroundColor: accentColor, borderColor: accentColor, shadowColor: accentColor }, arcadeMode && styles.arcadeDie, held && styles.heldDie, held && { backgroundColor: heldColor, borderColor: accentColor, shadowColor: heldColor }, pressed && styles.pressed]}>
      <View style={compact ? styles.compactPipGrid : styles.pipGrid}>{Array.from({ length: 9 }, (_, cell) => <View key={cell} style={compact ? styles.compactPipCell : styles.pipCell}>{pipCells[value].includes(cell) && <View style={compact ? styles.compactPip : styles.pip} />}</View>)}</View>
      {held && <View style={[styles.holdBadge, { backgroundColor: accentColor, borderColor: heldColor }]}><Text style={[styles.holdBadgeText, { color: softColor }]}>HELD</Text></View>}
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  slot: { width: 50, height: 50 }, heldSlot: { transform: [{ translateY: -4 }] },
  die: { flex: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, shadowOpacity: .35, shadowRadius: 6 },
  heldDie: { shadowOpacity: .85, shadowRadius: 10 }, pressed: { opacity: .78, transform: [{ scale: .94 }] },
  pipGrid: { width: 33, height: 33, flexDirection: 'row', flexWrap: 'wrap' }, pipCell: { width: 11, height: 11, alignItems: 'center', justifyContent: 'center' }, pip: { width: 6.5, height: 6.5, borderRadius: 3.25, backgroundColor: colors.background },
  compactSlot: { width: 40, height: 40 }, compactDie: { borderRadius: 8, borderWidth: 1.5 }, compactPipGrid: { width: 26, height: 26, flexDirection: 'row', flexWrap: 'wrap' }, compactPipCell: { width: 26 / 3, height: 26 / 3, alignItems: 'center', justifyContent: 'center' }, compactPip: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.background },
  holdBadge: { position: 'absolute', bottom: -6, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 }, holdBadgeText: { fontSize: 7, fontWeight: '900' },
  arcadeDie: { borderRadius: 2, borderWidth: 3, shadowRadius: 0, shadowOffset: { width: 3, height: 3 } },
});
