import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { useArcadeMode } from './AppText';

interface AppToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

export function AppToggle({ value, onValueChange, accessibilityLabel, disabled = false }: AppToggleProps) {
  const arcadeMode = useArcadeMode();
  return <Pressable
    accessibilityRole="switch"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ checked: value, disabled }}
    disabled={disabled}
    onPress={() => onValueChange(!value)}
    style={({ pressed }) => [styles.track, value && styles.trackOn, arcadeMode && styles.arcadeTrack, pressed && styles.pressed, disabled && styles.disabled]}
  >
    <View style={[styles.thumb, value && styles.thumbOn, arcadeMode && styles.arcadeThumb]} />
  </Pressable>;
}

const styles = StyleSheet.create({
  track: { width: 52, height: 31, flexShrink: 0, padding: 3, justifyContent: 'center', borderRadius: 16, backgroundColor: '#344247', borderColor: '#526267', borderWidth: 1 },
  trackOn: { alignItems: 'flex-end', backgroundColor: '#315a5e', borderColor: '#4c7b80' },
  thumb: { width: 23, height: 23, borderRadius: 12, backgroundColor: colors.muted },
  thumbOn: { backgroundColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: .45, shadowRadius: 4, elevation: 3 },
  arcadeTrack: { height: 30, borderRadius: 2, borderWidth: 2, padding: 2, shadowColor: colors.cyan, shadowOpacity: .28, shadowRadius: 0, shadowOffset: { width: 2, height: 2 } },
  arcadeThumb: { width: 22, height: 22, borderRadius: 1, shadowRadius: 0, shadowOffset: { width: 2, height: 2 } },
  pressed: { opacity: .72 },
  disabled: { opacity: .45 },
});
