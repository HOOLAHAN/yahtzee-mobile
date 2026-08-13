import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { updateMyPushNotifications } from './profiles';

export async function enableAppPushNotifications() {
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === 'granted' ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Enable notifications for Yahtzee Hub in your device settings, then try again.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('The Expo project ID is missing from this build.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await updateMyPushNotifications(true, token);
  return true;
}

export async function disableAppPushNotifications() {
  await updateMyPushNotifications(false);
  return false;
}
