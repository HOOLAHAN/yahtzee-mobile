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
  const invitePath = variant === 'development' ? '/play-dev' : variant === 'preview' ? '/play-preview' : '/play';

  return {
    ...config,
    name: current.name,
    slug: 'yahtzee-mobile',
    scheme: current.scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: `com.iainhoolahan.yahtzee${current.bundleSuffix}`,
      associatedDomains: ['applinks:yahtzee.ijrhservices.co.uk'],
      entitlements: {
        ...config.ios?.entitlements,
        'com.apple.developer.game-center': true,
      },
    },
    android: {
      ...config.android,
      package: `com.iainhoolahan.yahtzee${current.bundleSuffix}`,
      intentFilters: [{
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'yahtzee.ijrhservices.co.uk', pathPrefix: invitePath }],
        category: ['BROWSABLE', 'DEFAULT'],
      }],
    },
    extra: { ...config.extra, appVariant: variant },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-dev-client', { addGeneratedScheme: variant === 'development' }],
    ],
  };
};
