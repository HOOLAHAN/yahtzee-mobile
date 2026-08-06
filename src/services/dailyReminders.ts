import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

export const reminderEnabledKey = 'yahtzee.daily-reminders.enabled.v1';
export const reminderHourKey = 'yahtzee.daily-reminders.hour.v1';
const reminderIdsKey = 'yahtzee.daily-reminders.ids.v1';
export const defaultReminderHour = 19;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

async function cancelScheduledReminders() {
  const rawIds = await AsyncStorage.getItem(reminderIdsKey);
  const ids = rawIds ? JSON.parse(rawIds) as string[] : [];
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  await AsyncStorage.removeItem(reminderIdsKey);
}

export async function loadReminderPreferences() {
  const [enabled, hour] = await Promise.all([AsyncStorage.getItem(reminderEnabledKey), AsyncStorage.getItem(reminderHourKey)]);
  return { enabled: enabled === 'true', hour: hour === null ? defaultReminderHour : Number(hour) };
}

export async function scheduleDailyReminders(hour: number) {
  await cancelScheduledReminders();
  const completionKeys = await AsyncStorage.getAllKeys();
  const ids: string[] = [];
  const now = new Date();
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    date.setHours(hour, 0, 0, 0);
    if (date.getTime() <= now.getTime()) continue;
    const challengeDate = dateKey(date);
    if (completionKeys.some((key) => key.startsWith(`yahtzee.daily.completed.${challengeDate}.`))) continue;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Today’s dice are waiting 🎲',
        body: 'Complete your Daily Challenge and protect your streak.',
        data: { destination: 'daily', challengeDate },
        sound: 'default',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
    ids.push(id);
  }
  await AsyncStorage.setItem(reminderIdsKey, JSON.stringify(ids));
}

export async function enableDailyReminders(hour = defaultReminderHour) {
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } });
  if (permission.status !== 'granted') return false;
  await AsyncStorage.multiSet([[reminderEnabledKey, 'true'], [reminderHourKey, String(hour)]]);
  await scheduleDailyReminders(hour);
  return true;
}

export async function disableDailyReminders() {
  await AsyncStorage.setItem(reminderEnabledKey, 'false');
  await cancelScheduledReminders();
}

export async function updateReminderHour(hour: number) {
  await AsyncStorage.setItem(reminderHourKey, String(hour));
  const { enabled } = await loadReminderPreferences();
  if (enabled) await scheduleDailyReminders(hour);
}

export async function refreshDailyReminders() {
  const preferences = await loadReminderPreferences();
  if (preferences.enabled) await scheduleDailyReminders(preferences.hour);
  return preferences;
}

export async function dailyChallengeCompleted() {
  const preferences = await loadReminderPreferences();
  if (preferences.enabled) await scheduleDailyReminders(preferences.hour);
}
