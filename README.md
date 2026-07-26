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

## Environment setup

From a terminal, enter the mobile project and install its dependencies:

```bash
cd /Users/iainhoolahan/Projects/yahtzee-mobile
npm install
```

Copy `.env.example` to `.env.local` and fill in the existing AWS resource values. `.env.local` is used by the local Metro development server; EAS cloud builds load the corresponding values from the EAS `development`, `preview`, or `production` environment selected by `eas.json`.

All `EXPO_PUBLIC_*` variables are embedded into the application bundle. The AppSync API key is therefore public, just as it is on the website, and is restricted to leaderboard reads. Never put AWS IAM access keys, Cognito client secrets, or other private credentials in these variables.

Sign in to Expo before creating your first cloud build:

```bash
npx eas-cli@latest login
```

## Development

Run the validation check:

```bash
cd /Users/iainhoolahan/Projects/yahtzee-mobile
npm run typecheck
npx expo-doctor
```

### First installation on a physical iPhone

Create an installable development client:

```bash
cd /Users/iainhoolahan/Projects/yahtzee-mobile
npm run build:ios:development
```

Open the EAS build link on the phone and install the development build. A new native build is only required after changing native dependencies, plugins, entitlements, or native app configuration.

### Normal development

Start Metro and connect the installed development client:

```bash
cd /Users/iainhoolahan/Projects/yahtzee-mobile
npm run start:dev-client
```

If Metro has cached old code or environment values, restart it with a cleared cache:

```bash
npm run start:dev-client -- --clear
```

The phone and computer should normally be on the same network. If local network discovery is unavailable, start Metro through an Expo tunnel:

```bash
npm run start:dev-client -- --tunnel
```

Other local targets:

```bash
npm run ios
npm run android
npm run web
```

## Production and TestFlight

Production builds use the EAS `production` environment and automatically increment the iOS build number.

Check the project and confirm the production variables before building:

```bash
cd /Users/iainhoolahan/Projects/yahtzee-mobile
npm run typecheck
npx expo-doctor
npx eas-cli@latest env:list --environment production
```

Build the production IPA:

```bash
npm run build:ios:production
```

Upload the latest successful production build to App Store Connect and TestFlight:

```bash
npm run submit:ios
```

The submit profile is linked to App Store Connect app `6794910138`. The App Store Connect API key is managed by EAS and must not be downloaded into or committed to this repository. After submission, wait for Apple to process the build, then manage internal or external testers under App Store Connect → TestFlight.

For each subsequent TestFlight release, run:

```bash
cd /Users/iainhoolahan/Projects/yahtzee-mobile
npm run typecheck
npm run build:ios:production
npm run submit:ios
```

## Backend

No Lambda function is required for the current feature set: AppSync resolves score operations directly against DynamoDB. Leaderboard reads use the public AppSync API key, while score submission requires a valid Cognito user-pool session. The resolver derives the user ID and display name from the signed-in user's token; clients only send the score and cannot submit on another user's behalf.
