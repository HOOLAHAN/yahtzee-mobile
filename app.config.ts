import type { ConfigContext, ExpoConfig } from 'expo/config';

type AppVariant = 'development' | 'preview' | 'production';

const variant = (process.env.APP_VARIANT ?? 'production') as AppVariant;

const variantConfig: Record<AppVariant, { name: string; bundleSuffix: string; scheme: string }> = {
  development: { name: 'Yahtzee Dev', bundleSuffix: '.dev', scheme: 'yahtzee-dev' },
  preview: { name: 'Yahtzee Preview', bundleSuffix: '.preview', scheme: 'yahtzee-preview' },
  production: { name: 'Yahtzee!', bundleSuffix: '', scheme: 'yahtzee' },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const current = variantConfig[variant];

  return {
    ...config,
    name: current.name,
    slug: 'yahtzee-mobile',
    scheme: current.scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: `com.iainhoolahan.yahtzee${current.bundleSuffix}`,
    },
    android: {
      ...config.android,
      package: `com.iainhoolahan.yahtzee${current.bundleSuffix}`,
    },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-dev-client', { addGeneratedScheme: variant === 'development' }],
    ],
  };
};
