import { fetchAuthSession } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/api';
import { graphqlWithDevLog } from '../lib/apiLogger';

const client = generateClient();
export interface AdminUser { userId: string; email: string; emailVerified: boolean; username: string; firstName: string; lastName: string; status: string; enabled: boolean; profileComplete: boolean; signedUpAt: string | null; accountUpdatedAt: string | null; lastPlayedAt: string | null; gamesPlayed: number; soloGames: number; dailyGames: number; remoteGames: number; remoteWins: number; bestScore: number | null; averageScore: number | null; pushNotificationsEnabled: boolean; isAdmin: boolean }
export interface AdminSubmission { id: string; userId: string; username: string; mode: string; score: number; completedAt: string }
export interface DailyAdminActivity { date: string; games: number; players: number }
export interface AdminNotificationHistory { id: string; title: string; body: string; sentAt: string; audience: 'all' | 'selected'; selectedCount: number; audienceCount: number; sentCount: number; failedCount: number; requestedBy: string }
export interface AdminDashboardData { totalUsers: number; completedGames: number; soloGames: number; dailyGames: number; remoteGames: number; remoteMatches: number; remoteWins: number; remoteDraws: number; gamesToday: number; gamesLast7Days: number; gamesLast30Days: number; activeUsersLast7Days: number; activeUsersLast30Days: number; averageScore: number; yahtzeesRolled: number; upperBonusesEarned: number; generatedAt: string; dailyActivity: DailyAdminActivity[]; users: AdminUser[]; recentSubmissions: AdminSubmission[]; notificationHistory: AdminNotificationHistory[] }

const parse = <T,>(value: unknown, fallback: T): T => { let result = value; for (let i = 0; i < 2 && typeof result === 'string'; i += 1) { try { result = JSON.parse(result); } catch { return fallback; } } return result as T; };
async function request(query: string, variables?: Record<string, unknown>) {
  const session = await fetchAuthSession(); const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Sign in required.');
  return graphqlWithDevLog(client, { query, variables, authMode: 'userPool', authToken: token });
}
export async function fetchAdminDashboard(): Promise<AdminDashboardData> {
  const result = await request('query AdminDashboard { adminDashboard { totalUsers completedGames soloGames dailyGames remoteGames remoteMatches remoteWins remoteDraws gamesToday gamesLast7Days gamesLast30Days activeUsersLast7Days activeUsersLast30Days averageScore yahtzeesRolled upperBonusesEarned generatedAt dailyActivity users recentSubmissions } }') as { data?: { adminDashboard?: Omit<AdminDashboardData, 'dailyActivity' | 'users' | 'recentSubmissions' | 'notificationHistory'> & { dailyActivity: unknown; users: unknown; recentSubmissions: unknown } }; errors?: Array<{ message?: string }> };
  const data = result.data?.adminDashboard; if (!data) throw new Error(result.errors?.[0]?.message || 'Unable to load the admin dashboard.');
  const activity = parse<{ scores?: AdminSubmission[]; notifications?: AdminNotificationHistory[] } | AdminSubmission[]>(data.recentSubmissions, []);
  return { ...data, dailyActivity: parse<DailyAdminActivity[]>(data.dailyActivity, []), users: parse<AdminUser[]>(data.users, []), recentSubmissions: Array.isArray(activity) ? activity : activity.scores ?? [], notificationHistory: Array.isArray(activity) ? [] : activity.notifications ?? [] };
}
export async function sendAdminNotification(title: string, body: string, userIds?: string[]) {
  const result = await request('mutation SendAdminNotification($title:String!,$body:String!,$userIds:[ID!]){sendAdminNotification(title:$title,body:$body,userIds:$userIds){audienceCount sentCount failedCount}}', { title, body, userIds: userIds?.length ? userIds : null }) as { data?: { sendAdminNotification?: { audienceCount: number; sentCount: number; failedCount: number } }; errors?: Array<{ message?: string }> };
  const data = result.data?.sendAdminNotification; if (!data) throw new Error(result.errors?.[0]?.message || 'Unable to send notification.'); return data;
}
