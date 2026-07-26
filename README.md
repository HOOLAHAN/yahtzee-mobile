# Yahtzee Mobile

Expo and React Native companion to the Yahtzee website. The two apps use the same AWS Cognito users, AppSync GraphQL API, and DynamoDB leaderboard.

## Included

- Native single-player and pass-and-play two-player modes
- Held dice, scoring previews, current-score hints, and haptic feedback
- All 13 scoring categories
- Dice-score breakdown and round-by-round scorecards
- Native scorecard sharing and reset controls
- Shared global and personal leaderboards with pull-to-refresh
- Existing Cognito sign-in, registration, email confirmation, and password reset
- Score submission for signed-in users
- Built-in rules and scoring guide
- Expo configuration for iOS and Android

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the existing AWS resource values.
2. Install dependencies with `npm install`.
3. Start Expo with `npm start`.
4. Scan the QR code using Expo Go, or press `i` for the iOS simulator / `a` for Android.

All `EXPO_PUBLIC_*` variables are embedded into the application bundle. The current AppSync API key is therefore public, just as it is in the website. Do not put AWS IAM access keys or other private credentials in these variables.

## Commands

```bash
npm start
npm run ios
npm run android
npm run typecheck
```

## Backend

No Lambda function is required for the current feature set: AppSync resolves score operations directly against DynamoDB. Leaderboard reads use the public AppSync API key, while score submission requires a valid Cognito user-pool session. The resolver derives the user ID and display name from the signed-in user's token; clients only send the score and cannot submit on another user's behalf.

## Next releases

- EAS Build profiles, icons, splash screen, and store metadata
