import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
}

export function ScreenHeader({ title, subtitle }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 18, paddingBottom: 18, alignItems: 'center' },
  title: { color: colors.yellow, fontSize: 30, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.mint, textAlign: 'center', marginTop: 7, lineHeight: 20 },
});
