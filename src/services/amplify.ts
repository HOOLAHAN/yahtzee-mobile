import 'react-native-get-random-values';
import { Amplify } from 'aws-amplify';

const required = (value: string | undefined, name: string) => {
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env.local.`);
  return value;
};

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: required(process.env.EXPO_PUBLIC_USER_POOL_ID, 'EXPO_PUBLIC_USER_POOL_ID'),
      userPoolClientId: required(process.env.EXPO_PUBLIC_USER_POOL_CLIENT_ID, 'EXPO_PUBLIC_USER_POOL_CLIENT_ID'),
    },
  },
  API: {
    GraphQL: {
      endpoint: required(process.env.EXPO_PUBLIC_APPSYNC_ENDPOINT, 'EXPO_PUBLIC_APPSYNC_ENDPOINT'),
      region: required(process.env.EXPO_PUBLIC_AWS_REGION, 'EXPO_PUBLIC_AWS_REGION'),
      defaultAuthMode: 'apiKey',
      apiKey: required(process.env.EXPO_PUBLIC_APPSYNC_API_KEY, 'EXPO_PUBLIC_APPSYNC_API_KEY'),
    },
  },
});
