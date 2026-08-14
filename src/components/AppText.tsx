import { createContext, PropsWithChildren, useContext } from 'react';
import { Platform, Text as NativeText, TextProps } from 'react-native';

const ArcadeFontContext = createContext(false);

export function ArcadeFontProvider({ enabled, children }: PropsWithChildren<{ enabled: boolean }>) {
  return <ArcadeFontContext.Provider value={enabled}>{children}</ArcadeFontContext.Provider>;
}

export function AppText({ style, ...props }: TextProps) {
  const arcadeFontEnabled = useContext(ArcadeFontContext);
  return <NativeText {...props} style={[arcadeFontEnabled && { fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace' }) }, style]} />;
}
