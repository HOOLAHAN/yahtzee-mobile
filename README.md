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

Copy `.env.example` to `.env.local` and fill in the development AWS resource values. `.env.local` is used by the local Metro development server and should point at the isolated `sandbox` Amplify environment. EAS cloud builds load the corresponding values from the EAS `development`, `preview`, or `production` environment selected by `eas.json`.

Development and production are deliberately separate. Local Metro and EAS
development builds use the sandbox Cognito users and empty development
leaderboards. TestFlight/App Store builds use the live backend and retain the
existing production scores. Never copy production AWS values into `.env.local`
for ordinary feature development.

All `EXPO_PUBLIC_*` variables are embedded into the application bundle. The AppSync API key is therefore public, just as it is on the website, and is restricted to leaderboard reads. Never put AWS IAM access keys, Cognito client secrets, or other private credentials in these variables.

Sign in to Expo before creating your first cloud build:

```bash
npx eas-cli@latest login
```

## Development

### Command reference

| Task | Command | Uses an EAS cloud build? |
| --- | --- | --- |
| Start Metro for an installed development client | `npm run start:dev-client` | No |
| Build and install on an iOS Simulator locally | `APP_VARIANT=development npx expo run:ios --device` | No |
| Create an installable development build for a physical iPhone | `npm run build:ios:development` | Yes |
| Create a production App Store build | `npm run build:ios:production` | Yes |
| Submit the latest production build to TestFlight | `npm run submit:ios` | No new build |

`npx expo run:ios` compiles with Xcode on this Mac and does not consume an EAS build credit. Commands containing `eas build` upload the project to Expo's build service and may consume the account's build allowance.

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

The development build installs as **Yahtzee Dev** with bundle identifier `com.iainhoolahan.yahtzee.dev`. It can remain installed beside the TestFlight **Yahtzee!** production app, which keeps `com.iainhoolahan.yahtzee`. After adding this variant configuration, create and install one fresh development build; the older development binary used the production identifier and cannot coexist with TestFlight.

### iOS Simulator

Xcode and at least one iOS Simulator runtime must be installed. Build and install the native development client locally with:

```bash
cd /Users/iainhoolahan/Projects/yahtzee-mobile
APP_VARIANT=development npx expo run:ios --device
```

Select the required iPhone or iPad Simulator when prompted. This command runs Expo prebuild automatically when the generated `ios` directory is absent, compiles the app with Xcode, and installs `com.iainhoolahan.yahtzee.dev` on that simulator.

Each simulator acts as a separate device. To switch models, run the same command again and choose another simulator. You can also open one manually from Simulator → File → Open Simulator. Once Yahtzee Dev is installed on the selected simulator, normal JavaScript and styling changes only require Metro:

```bash
npm run start:dev-client
```

Press `i` in Metro to open the app on iOS. If Metro reports `No development build (com.iainhoolahan.yahtzee.dev)`, the selected simulator does not have Yahtzee Dev installed yet; run `APP_VARIANT=development npx expo run:ios --device` for that simulator.

For App Store screenshots, open the required simulator model and use Simulator → File → Save Screenshot. Upload screenshots only at one of the pixel sizes accepted by the relevant App Store Connect screenshot slot.

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

Expo Go is not the primary development target for this project because the app includes native modules and configuration. Use the Yahtzee Dev client for representative testing.

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

### GitHub production workflow

The manually triggered workflow at `.github/workflows/deploy-ios.yml` performs the production build and submits it to TestFlight. It requires the repository's `EXPO_TOKEN` secret and the production environment variables and Apple credentials configured in EAS.

To run it:

1. Push the intended release commit to GitHub.
2. Open the `yahtzee-mobile` repository on GitHub.
3. Select Actions → Deploy iOS to TestFlight.
4. Choose Run workflow for the intended branch.
5. Follow the EAS build link in the workflow output, then wait for Apple to process the submitted build.

Running the GitHub workflow creates a new EAS cloud build. Do not also run `npm run build:ios:production` unless a second build is intentionally required. The production profile uses EAS remote versioning and automatically increments the iOS build number.

### Apple credentials and native capability changes

EAS manages the App Store Connect API key, distribution certificate, and provisioning profile. Inspect or repair them with:

```bash
npx eas-cli@latest credentials --platform ios
```

After enabling a new Apple capability or adding an Expo plugin that introduces an entitlement, the existing provisioning profile may be stale. In the production build credentials menu, delete only the App Store provisioning profile, keep the valid distribution certificate, and choose **All: Set up all the required credentials to build your project**. EAS will generate a profile containing the current entitlements.

The current Daily Challenge reminders are scheduled locally on the device. They require the notification entitlement and provisioning support, but they do not require an APNs key or APNs SSL certificate for server-sent notifications.

### Release checklist

1. Confirm the intended changes are committed and pushed.
2. Run `npm run typecheck`.
3. Run `npx expo-doctor`.
4. Check `app.json` contains the intended public version.
5. Check the EAS production environment with `npx eas-cli@latest env:list --environment production`.
6. Use either the GitHub production workflow or `npm run build:ios:production` followed by `npm run submit:ios`.
7. Wait for App Store Connect processing and add the build to TestFlight or the App Store version.

### Troubleshooting

- **Metro shows stale code or configuration:** stop it and run `npm run start:dev-client -- --clear`.
- **A physical phone cannot discover Metro:** ensure both devices share a network or use `npm run start:dev-client -- --tunnel`.
- **No development build is installed:** create a cloud development build for a physical phone, or use `APP_VARIANT=development npx expo run:ios --device` for a simulator.
- **A native module or plugin was added:** rebuild the development client; restarting Metro alone cannot add native code to an installed binary.
- **Provisioning profile does not support an entitlement:** enable the capability for `com.iainhoolahan.yahtzee` in Apple Developer, remove the App Store provisioning profile from the EAS project, and let EAS recreate it. Do not revoke a valid distribution certificate.
- **The build succeeds but is not in TestFlight:** submission is a separate step unless the build used auto-submit. Run `npm run submit:ios` or inspect the submit job in the GitHub workflow.
- **App Store Connect rejects screenshot dimensions:** capture from a supported simulator or resize with aspect ratio preserved to one of the dimensions listed for that screenshot slot.

## Backend

Within each environment, the mobile app shares the website's AWS Cognito,
AppSync, DynamoDB, and profile-service Lambda resources. The `sandbox`
environment is used for development; the historical Amplify environment named
`dev` is production. Deploying a new mobile binary does not deploy backend
schema, resolver, table, or Lambda changes.

Backend infrastructure and deployment files live in `/Users/iainhoolahan/Projects/yahtzee`. Before releasing a mobile feature that changes GraphQL operations, deploy and verify the corresponding backend change first, then confirm the production EAS environment still points at the live AppSync endpoint.

Leaderboard reads use the public AppSync API key. Authenticated profile operations, preference syncing, score submission, achievements, and personal statistics use the signed-in user's Cognito session. Never replace those authenticated calls with client-supplied user IDs.

For a development backend push, use `npm run backend:push:sandbox` from the
website repository. The wrapper selects the sandbox and handles the legacy
Gen 1 environment-specific Cognito parameter safely. Treat any raw push while
`dev` is active as a production infrastructure operation. Do not assume that
pushing the mobile or website `main` branch deploys AppSync changes; verify the
hosting and infrastructure workflows separately.
