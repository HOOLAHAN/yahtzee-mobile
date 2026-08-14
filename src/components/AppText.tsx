import { createContext, PropsWithChildren, useContext } from 'react';
import { Platform, Text as NativeText, TextProps } from 'react-native';

const ArcadeModeContext = createContext(false);

export function ArcadeModeProvider({ enabled, children }: PropsWithChildren<{ enabled: boolean }>) {
  return <ArcadeModeContext.Provider value={enabled}>{children}</ArcadeModeContext.Provider>;
}

export const useArcadeMode = () => useContext(ArcadeModeContext);

export function AppText({ style, ...props }: TextProps) {
  const arcadeModeEnabled = useArcadeMode();
  return <NativeText {...props} style={[arcadeModeEnabled && styles.arcadeText, style]} />;
}

const styles = {
  arcadeText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    letterSpacing: 0.35,
  },
};
