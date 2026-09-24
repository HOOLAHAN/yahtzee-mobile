import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Line, Polyline, Rect } from "react-native-svg";
import { AppText as Text } from "../components/AppText";
import {
  AdminDashboardData,
  AdminUser,
  fetchAdminDashboard,
  sendAdminNotification,
} from "../services/admin";
import { colors } from "../theme";

type Section = "overview" | "users" | "engagement" | "notifications";
type ChartPeriod = "week" | "month" | "quarter" | "year" | "all";
type DateBucket = {
  key: string;
  label: string;
  title: string;
  start: Date;
  end: Date;
};
type UserFilter =
  | "all"
  | "admin"
  | "new"
  | "pending"
  | "incomplete"
  | "neverPlayed"
  | "inactive30";
const sections: Array<{ key: Section; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "engagement", label: "Games" },
  { key: "notifications", label: "Notify" },
];
const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : "Never";
const daysSince = (value: string | null) =>
  value
    ? Math.floor((Date.now() - new Date(value).getTime()) / 86400000)
    : null;
const filters: Array<{ key: UserFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "admin", label: "Admins" },
  { key: "new", label: "New · 30d" },
  { key: "pending", label: "Pending" },
  { key: "incomplete", label: "Incomplete" },
  { key: "neverPlayed", label: "Never played" },
  { key: "inactive30", label: "Inactive · 30d" },
];
const periods: Array<{ key: ChartPeriod; label: string }> = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
  { key: "all", label: "All time" },
];

function dateBuckets(period: ChartPeriod, earliest?: Date): DateBucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endToday = new Date(today);
  endToday.setHours(23, 59, 59, 999);
  if (period === "year" || period === "all") {
    const first =
      earliest && !Number.isNaN(earliest.getTime()) ? earliest : today;
    const count =
      period === "year"
        ? 12
        : Math.max(
            1,
            (today.getFullYear() - first.getFullYear()) * 12 +
              today.getMonth() -
              first.getMonth() +
              1,
          );
    return Array.from({ length: count }, (_, index) => {
      const start = new Date(
        today.getFullYear(),
        today.getMonth() - (count - 1 - index),
        1,
      );
      const end = new Date(
        start.getFullYear(),
        start.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      return {
        key: `${start.getFullYear()}-${start.getMonth()}`,
        label: start.toLocaleDateString([], { month: "short" }),
        title: start.toLocaleDateString([], { month: "long", year: "numeric" }),
        start,
        end,
      };
    });
  }
  const bucketDays = period === "quarter" ? 7 : 1;
  const count = period === "week" ? 7 : period === "month" ? 30 : 13;
  return Array.from({ length: count }, (_, index) => {
    const end = new Date(endToday);
    end.setDate(end.getDate() - (count - 1 - index) * bucketDays);
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (bucketDays - 1));
    const label = start.toLocaleDateString([], {
      day: "numeric",
      month: "short",
    });
    return {
      key: start.toISOString(),
      label,
      title:
        bucketDays === 1
          ? start.toLocaleDateString([], {
              weekday: "short",
              day: "numeric",
              month: "short",
            })
          : `${label}–${end.toLocaleDateString([], { day: "numeric", month: "short" })}`,
      start,
      end,
    };
  });
}

function PeriodSelector({
  value,
  onChange,
}: {
  value: ChartPeriod;
  onChange: (value: ChartPeriod) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.periods}
    >
      {periods.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => onChange(item.key)}
          style={[styles.period, value === item.key && styles.periodActive]}
        >
          <Text
            style={[
              styles.periodText,
              value === item.key && styles.periodTextActive,
            ]}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function NativeChart({
  bars,
  line,
  labels,
  startLabel,
  endLabel,
  barLabel = "Games",
  lineLabel = "Value",
  barColor = colors.cyan,
  lineColor = colors.pink,
}: {
  bars: number[];
  line?: number[];
  labels: string[];
  startLabel: string;
  endLabel: string;
  barLabel?: string;
  lineLabel?: string;
  barColor?: string;
  lineColor?: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  useEffect(() => setSelectedIndex(null), [labels.join("|")]);
  const maxBar = Math.max(1, ...bars);
  const maxLine = Math.max(1, ...(line ?? []));
  const count = Math.max(1, bars.length);
  const cell = 96 / count;
  const barWidth = Math.max(0.8, cell * 0.62);
  const points = line
    ?.map(
      (value, index) =>
        `${2 + cell * index + cell / 2},${96 - (value / maxLine) * 86}`,
    )
    .join(" ");
  return (
    <>
      <View style={styles.nativeChart}>
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <Line
            x1="2"
            y1="96"
            x2="98"
            y2="96"
            stroke="#315057"
            strokeWidth=".5"
          />
          {bars.map((value, index) => {
            const height = value ? Math.max(2, (value / maxBar) * 86) : 0.6;
            return (
              <Rect
                key={index}
                x={2 + cell * index + (cell - barWidth) / 2}
                y={96 - height}
                width={barWidth}
                height={height}
                rx={Math.min(1, barWidth / 3)}
                fill={barColor}
                opacity={value ? 1 : 0.18}
              />
            );
          })}
          {line && (
            <>
              <Polyline
                points={points}
                fill="none"
                stroke={lineColor}
                strokeWidth="1.2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {line.map((value, index) => (
                <Circle
                  key={index}
                  cx={2 + cell * index + cell / 2}
                  cy={96 - (value / maxLine) * 86}
                  r="1.25"
                  fill={lineColor}
                  stroke={colors.background}
                  strokeWidth=".6"
                />
              ))}
            </>
          )}
        </Svg>
        <View style={styles.chartTouchLayer} pointerEvents="box-none">
          {bars.map((value, index) => (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`${labels[index] ?? "Period"}: ${value} ${barLabel}${line ? `, ${line[index]} ${lineLabel}` : ""}`}
              onPress={() => setSelectedIndex(index)}
              style={[
                styles.chartTouch,
                selectedIndex === index && styles.chartTouchSelected,
              ]}
            />
          ))}
        </View>
      </View>
      <View style={styles.chartAxis}>
        <Text style={styles.chartAxisText}>{startLabel}</Text>
        <Text style={styles.chartAxisText}>{endLabel}</Text>
      </View>
      {selectedIndex !== null && (
        <View style={styles.chartSelection}>
          <Text style={styles.chartSelectionDate}>
            {labels[selectedIndex] ?? "Selected period"}
          </Text>
          <Text style={styles.chartSelectionValue}>
            {bars[selectedIndex]} {barLabel}
            {line ? ` · ${line[selectedIndex]} ${lineLabel}` : ""}
          </Text>
        </View>
      )}
    </>
  );
}

function SignupChart({ users }: { users: AdminUser[] }) {
  const [period, setPeriod] = useState<ChartPeriod>("month");
  const first = useMemo(() => {
    const values = users
      .map((user) => (user.signedUpAt ? Date.parse(user.signedUpAt) : NaN))
      .filter(Number.isFinite);
    return values.length ? new Date(Math.min(...values)) : undefined;
  }, [users]);
  const buckets = useMemo(() => dateBuckets(period, first), [period, first]);
  const values = buckets.map(
    (bucket) =>
      users.filter((user) => {
        const joined = user.signedUpAt ? new Date(user.signedUpAt) : null;
        return joined && joined >= bucket.start && joined <= bucket.end;
      }).length,
  );
  return (
    <View style={styles.panel}>
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.headingNoMargin}>New accounts</Text>
          <Text style={styles.chartHelp}>
            {values.reduce((sum, value) => sum + value, 0)} registrations
          </Text>
        </View>
      </View>
      <PeriodSelector value={period} onChange={setPeriod} />
      <NativeChart
        bars={values}
        labels={buckets.map((bucket) => bucket.title)}
        startLabel={buckets[0]?.label ?? "Earlier"}
        endLabel={buckets.at(-1)?.label ?? "Today"}
        barLabel="accounts"
        barColor={colors.pink}
      />
    </View>
  );
}

function OverallActivityChart({ data }: { data: AdminDashboardData }) {
  const [period, setPeriod] = useState<ChartPeriod>("month");
  const firstKey = data.dailyActivity[0]?.date;
  const buckets = useMemo(
    () =>
      dateBuckets(
        period,
        firstKey ? new Date(`${firstKey}T12:00:00`) : undefined,
      ),
    [period, firstKey],
  );
  const points = buckets.map((bucket) => {
    const days = data.dailyActivity.filter((day) => {
      const value = new Date(`${day.date}T12:00:00`);
      return value >= bucket.start && value <= bucket.end;
    });
    return {
      games: days.reduce((sum, day) => sum + day.games, 0),
      players: days.length
        ? Math.round(
            days.reduce((sum, day) => sum + day.players, 0) / days.length,
          )
        : 0,
    };
  });
  return (
    <View style={styles.panel}>
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.headingNoMargin}>Game activity</Text>
          <Text style={styles.chartHelp}>Games and average daily players</Text>
        </View>
        <View style={styles.legend}>
          <Text style={styles.legendGames}>■ Games</Text>
          <Text style={styles.legendLine}>━ Players</Text>
        </View>
      </View>
      <PeriodSelector value={period} onChange={setPeriod} />
      <NativeChart
        bars={points.map((point) => point.games)}
        line={points.map((point) => point.players)}
        labels={buckets.map((bucket) => bucket.title)}
        startLabel={buckets[0]?.label ?? "Earlier"}
        endLabel={buckets.at(-1)?.label ?? "Today"}
        barLabel="games"
        lineLabel="players"
      />
    </View>
  );
}

function UserActivityChart({ user }: { user: AdminUser }) {
  const [period, setPeriod] = useState<ChartPeriod>("month");
  const history = user.gameHistory?.length
    ? user.gameHistory
    : (user.recentGames ?? []);
  const oldest = history.length
    ? new Date(
        Math.min(
          ...history
            .map((game) => Date.parse(game.completedAt))
            .filter(Number.isFinite),
        ),
      )
    : user.signedUpAt
      ? new Date(user.signedUpAt)
      : undefined;
  const buckets = useMemo(
    () => dateBuckets(period, oldest),
    [period, oldest?.getTime()],
  );
  const points = buckets.map((bucket) => {
    const games = history.filter((game) => {
      const completed = new Date(game.completedAt);
      return completed >= bucket.start && completed <= bucket.end;
    });
    return {
      games: games.length,
      score: games.length
        ? Math.round(
            games.reduce((sum, game) => sum + game.score, 0) / games.length,
          )
        : 0,
    };
  });
  return (
    <View style={styles.panel}>
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.headingNoMargin}>Player engagement</Text>
          <Text style={styles.chartHelp}>
            {points.reduce((sum, point) => sum + point.games, 0)} games in
            period
          </Text>
        </View>
        <View style={styles.legend}>
          <Text style={styles.legendGames}>■ Games</Text>
          <Text style={styles.legendLine}>━ Score</Text>
        </View>
      </View>
      <PeriodSelector value={period} onChange={setPeriod} />
      <NativeChart
        bars={points.map((point) => point.games)}
        line={points.map((point) => point.score)}
        labels={buckets.map((bucket) => bucket.title)}
        startLabel={buckets[0]?.label ?? "Earlier"}
        endLabel={buckets.at(-1)?.label ?? "Today"}
        barLabel="games"
        lineLabel="average score"
      />
    </View>
  );
}

export function AdminScreen({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("overview");
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [submissionMode, setSubmissionMode] = useState<
    "all" | "solo" | "daily"
  >("all");
  const load = () => {
    setLoading(true);
    setError("");
    void fetchAdminDashboard()
      .then(setData)
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load dashboard.",
        ),
      )
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const users = useMemo(
    () =>
      (data?.users ?? []).filter((user) => {
        const confirmed = user.status === "CONFIRMED" && user.emailVerified;
        const inactive = daysSince(user.lastPlayedAt);
        if (filter === "admin" && !user.isAdmin) return false;
        if (
          filter === "new" &&
          !(user.signedUpAt && (daysSince(user.signedUpAt) ?? 999) < 30)
        )
          return false;
        if (
          filter === "pending" &&
          !(user.status === "UNCONFIRMED" || !user.emailVerified)
        )
          return false;
        if (filter === "incomplete" && !(confirmed && !user.profileComplete))
          return false;
        if (filter === "neverPlayed" && !(confirmed && user.gamesPlayed === 0))
          return false;
        if (
          filter === "inactive30" &&
          !(confirmed && (!user.lastPlayedAt || (inactive ?? 0) >= 30))
        )
          return false;
        return `${user.username} ${user.email} ${user.firstName} ${user.lastName}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [data, filter, query],
  );
  const optedIn =
    data?.users.filter((user) => user.pushNotificationsEnabled) ?? [];
  const confirmed =
    data?.users.filter(
      (user) => user.status === "CONFIRMED" && user.emailVerified,
    ) ?? [];
  const profileCount = confirmed.filter((user) => user.profileComplete).length;
  const playerCount = confirmed.filter((user) => user.gamesPlayed > 0).length;
  const newUsers7 = confirmed.filter(
    (user) => user.signedUpAt && (daysSince(user.signedUpAt) ?? 999) < 7,
  ).length;
  const newUsers30 = confirmed.filter(
    (user) => user.signedUpAt && (daysSince(user.signedUpAt) ?? 999) < 30,
  ).length;
  const repeatPlayers = confirmed.filter(
    (user) => user.gamesPlayed >= 2,
  ).length;
  const remotePlayers = confirmed.filter((user) => user.remoteGames > 0).length;
  const submissions = (data?.recentSubmissions ?? []).filter(
    (item) =>
      submissionMode === "all" ||
      item.mode.toLowerCase().includes(submissionMode),
  );
  const send = () => {
    if (
      !title.trim() ||
      !body.trim() ||
      (audience === "selected" && !selected.length)
    )
      return;
    const userIds = audience === "selected" ? selected : undefined;
    const count = audience === "selected" ? selected.length : optedIn.length;
    Alert.alert(
      `Send to ${count} eligible ${count === 1 ? "device" : "devices"}?`,
      `${title.trim()}\n\n${body.trim()}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: () => {
            setSending(true);
            void sendAdminNotification(title.trim(), body.trim(), userIds)
              .then((result) => {
                Alert.alert(
                  "Notification sent",
                  `${result.sentCount} of ${result.audienceCount} sent${result.failedCount ? ` · ${result.failedCount} failed` : ""}`,
                );
                setTitle("");
                setBody("");
                load();
              })
              .catch((caught) =>
                Alert.alert(
                  "Unable to send",
                  caught instanceof Error
                    ? caught.message
                    : "Please try again.",
                ),
              )
              .finally(() => setSending(false));
          },
        },
      ],
    );
  };
  const stat = (
    label: string,
    value: number | string,
    icon: keyof typeof Ionicons.glyphMap,
    onPress?: () => void,
  ) => {
    const content = (
      <>
        <Ionicons name={icon} size={17} color={colors.pink} />
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        {onPress && (
          <View style={styles.statLink}>
            <Text style={styles.statLinkText}>View details</Text>
            <Ionicons name="chevron-forward" size={11} color={colors.cyan} />
          </View>
        )}
      </>
    );
    return onPress ? (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.stat,
          styles.statButton,
          pressed && styles.statPressed,
        ]}
      >
        {content}
      </Pressable>
    ) : (
      <View style={styles.stat}>{content}</View>
    );
  };
  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Pressable
          accessibilityLabel="Back to account"
          onPress={onClose}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={21} color={colors.cyan} />
        </Pressable>
        <View>
          <Text style={styles.eyebrow}>PRIVATE WORKSPACE</Text>
          <Text style={styles.title}>Admin dashboard</Text>
        </View>
      </View>
      <View style={styles.tabs}>
        {sections.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setSection(item.key)}
            style={[styles.tab, section === item.key && styles.activeTab]}
          >
            <Text
              style={[
                styles.tabText,
                section === item.key && styles.activeTabText,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {loading && !data ? (
        <ActivityIndicator
          style={styles.loader}
          color={colors.cyan}
          size="large"
        />
      ) : error ? (
        <View style={styles.message}>
          <Ionicons
            name="alert-circle-outline"
            size={28}
            color={colors.danger}
          />
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={load}
              tintColor={colors.cyan}
            />
          }
          contentContainerStyle={styles.content}
        >
          {section === "overview" && data && (
            <>
              <Text style={styles.heading}>Today at a glance</Text>
              <Text style={styles.sectionHint}>
                Tap a metric to investigate it.
              </Text>
              <View style={styles.grid}>
                {stat(
                  "Registered users",
                  data.totalUsers,
                  "people-outline",
                  () => {
                    setFilter("all");
                    setSection("users");
                  },
                )}
                {stat(
                  "Active · 7 days",
                  data.activeUsersLast7Days,
                  "pulse-outline",
                  () => setSection("engagement"),
                )}
                {stat("Games today", data.gamesToday, "dice-outline", () =>
                  setSection("engagement"),
                )}
                {stat(
                  "Notification opt-in",
                  `${data.totalUsers ? Math.round((optedIn.length / data.totalUsers) * 100) : 0}%`,
                  "notifications-outline",
                  () => setSection("notifications"),
                )}
              </View>
              <Text style={styles.heading}>Sign-up funnel</Text>
              <Pressable
                onPress={() => setSection("users")}
                style={({ pressed }) => [
                  styles.panel,
                  pressed && styles.statPressed,
                ]}
              >
                {[
                  ["Accounts created", data.totalUsers],
                  ["Email verified", confirmed.length],
                  ["Profile completed", profileCount],
                  ["Played a game", playerCount],
                ].map(([label, value]) => (
                  <View key={String(label)} style={styles.funnelRow}>
                    <View style={styles.metricRow}>
                      <Text style={styles.metricLabel}>{label}</Text>
                      <Text style={styles.metric}>
                        {value} ·{" "}
                        {data.totalUsers
                          ? Math.round((Number(value) / data.totalUsers) * 100)
                          : 0}
                        %
                      </Text>
                    </View>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.fill,
                          {
                            width: `${data.totalUsers ? (Number(value) / data.totalUsers) * 100 : 0}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
                <View style={styles.panelLink}>
                  <Text style={styles.statLinkText}>Open user cohorts</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={12}
                    color={colors.cyan}
                  />
                </View>
              </Pressable>
              <Text style={styles.heading}>Account growth</Text>
              <SignupChart users={data.users} />
              <Text style={styles.heading}>30-day performance</Text>
              <View style={styles.grid}>
                {stat(
                  "Completed games",
                  data.gamesLast30Days,
                  "dice-outline",
                  () => setSection("engagement"),
                )}
                {stat(
                  "Active players",
                  data.activeUsersLast30Days,
                  "people-outline",
                  () => setSection("engagement"),
                )}
                {stat(
                  "Average score",
                  data.averageScore,
                  "speedometer-outline",
                  () => setSection("engagement"),
                )}
                {stat(
                  "Yahtzees rolled",
                  data.yahtzeesRolled,
                  "sparkles-outline",
                  () => setSection("engagement"),
                )}
              </View>
            </>
          )}
          {section === "overview" && data && (
            <>
              <Text style={styles.heading}>Growth & retention</Text>
              <View style={styles.grid}>
                {stat("New accounts · 7d", newUsers7, "person-add-outline")}
                {stat("New accounts · 30d", newUsers30, "people-outline")}
                {stat("Repeat players", repeatPlayers, "repeat-outline")}
                {stat(
                  "Remote adopters",
                  remotePlayers,
                  "game-controller-outline",
                )}
              </View>
              <View style={[styles.panel, { marginTop: 10 }]}>
                <Text style={styles.help}>
                  Account creation is measurable here, but it is not the same as
                  an App Store download. Anonymous installs and Apple download
                  totals require separate install telemetry or App Store Connect
                  analytics.
                </Text>
              </View>
            </>
          )}
          {section === "users" && data && (
            <>
              <View style={styles.grid}>
                {stat("Confirmed", confirmed.length, "person-add-outline")}
                {stat(
                  "Pending",
                  data.users.length - confirmed.length,
                  "time-outline",
                )}
                {stat(
                  "Incomplete",
                  confirmed.filter((user) => !user.profileComplete).length,
                  "alert-circle-outline",
                )}
                {stat(
                  "Never played",
                  confirmed.filter((user) => user.gamesPlayed === 0).length,
                  "dice-outline",
                )}
              </View>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search username or email"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.search]}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filters}
              >
                {filters.map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => setFilter(item.key)}
                    style={[
                      styles.filter,
                      filter === item.key && styles.filterActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        filter === item.key && styles.filterTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.heading}>Players · {users.length}</Text>
              {users.map((user) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View details for ${user.username || user.email}`}
                  onPress={() => setSelectedUser(user)}
                  key={user.userId}
                  style={({ pressed }) => [
                    styles.user,
                    pressed && styles.userPressed,
                  ]}
                >
                  <View style={styles.userTop}>
                    <View style={styles.nameRow}>
                      <Text style={styles.userName}>
                        {user.username || "No username"}
                      </Text>
                      {user.isAdmin && (
                        <View style={styles.adminBadge}>
                          <Ionicons
                            name="shield-checkmark"
                            size={10}
                            color={colors.yellow}
                          />
                          <Text style={styles.adminBadgeText}>ADMIN</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.userScoreRow}>
                      <Text style={styles.userScore}>
                        {user.bestScore ?? "—"}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={colors.cyan}
                      />
                    </View>
                  </View>
                  <Text numberOfLines={1} style={styles.userEmail}>
                    {user.email}
                  </Text>
                  <Text
                    style={[
                      styles.userMeta,
                      {
                        color: user.emailVerified ? colors.cyan : colors.yellow,
                      },
                    ]}
                  >
                    {user.status} ·{" "}
                    {user.profileComplete
                      ? "Profile complete"
                      : "Onboarding incomplete"}{" "}
                    · {user.enabled ? "Enabled" : "Disabled"}
                  </Text>
                  <Text style={styles.userMeta}>
                    {user.firstName} {user.lastName} · {user.gamesPlayed} games
                    · {user.soloGames} solo / {user.dailyGames} daily
                  </Text>
                  <Text style={styles.userMeta}>
                    Remote {user.remoteGames} · {user.remoteWins}W{" "}
                    {user.remoteDraws ?? 0}D {user.remoteLosses ?? 0}L
                  </Text>
                  <Text style={styles.userMeta}>
                    Abandoned {user.abandonedGames ?? 0} · Resets{" "}
                    {user.resetGames ?? 0} · Average {user.averageScore ?? "—"}
                  </Text>
                </Pressable>
              ))}
            </>
          )}
          {section === "engagement" && data && (
            <>
              <View style={styles.grid}>
                {stat(
                  "All result records",
                  data.completedGames,
                  "dice-outline",
                )}
                {stat("Solo", data.soloGames, "person-outline")}
                {stat("Daily", data.dailyGames, "sunny-outline")}
                {stat("Remote matches", data.remoteMatches, "people-outline")}
              </View>
              <Text style={styles.heading}>Starts & abandonment</Text>
              <View style={styles.grid}>
                {stat("Tracked starts", data.gameStarts, "play-outline")}
                {stat(
                  "Completion rate",
                  `${data.gameCompletionRate}%`,
                  "checkmark-circle-outline",
                )}
                {stat("Abandoned", data.abandonedGames, "exit-outline")}
                {stat("Stale · 24h", data.staleGames, "time-outline")}
                {stat("Resets", data.resetGames, "refresh-outline")}
                {stat(
                  "Mode switches",
                  data.modeSwitchAbandons,
                  "swap-horizontal-outline",
                )}
                {stat("Remote exits", data.remoteExits, "log-out-outline")}
                {stat(
                  "Avg abandon round",
                  data.averageAbandonRound,
                  "analytics-outline",
                )}
              </View>
              <Text style={styles.heading}>By mode</Text>
              <View style={styles.panel}>
                {data.abandonmentByMode.map((item) => (
                  <View key={item.mode} style={styles.metricRow}>
                    <Text style={styles.metricLabel}>{item.mode}</Text>
                    <Text style={styles.metric}>
                      {item.starts} starts · {item.abandons} left
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.heading}>Remote games</Text>
              <View style={styles.grid}>
                {stat(
                  "Player results",
                  data.remoteGames,
                  "phone-portrait-outline",
                )}
                {stat("Wins recorded", data.remoteWins, "trophy-outline")}
                {stat(
                  "Drawn matches",
                  data.remoteDraws,
                  "remove-circle-outline",
                )}
                {stat(
                  "Decisive matches",
                  Math.max(0, data.remoteMatches - data.remoteDraws),
                  "analytics-outline",
                )}
              </View>
              <Text style={styles.heading}>Activity trends</Text>
              <OverallActivityChart data={data} />
              <Text style={styles.heading}>Recent submissions</Text>
              <View style={styles.submissionFilters}>
                {(["all", "solo", "daily"] as const).map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setSubmissionMode(value)}
                    style={[
                      styles.filter,
                      submissionMode === value && styles.filterActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        submissionMode === value && styles.filterTextActive,
                      ]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {submissions.map((item) => (
                <View key={item.id} style={styles.submission}>
                  <View>
                    <Text style={styles.userName}>
                      {item.username || item.userId}
                    </Text>
                    <Text style={styles.userMeta}>
                      {item.mode} ·{" "}
                      {new Date(item.completedAt).toLocaleString()}
                    </Text>
                  </View>
                  <Text style={styles.score}>{item.score}</Text>
                </View>
              ))}
            </>
          )}
          {section === "notifications" && data && (
            <>
              <View style={styles.panel}>
                <View style={styles.composeHeading}>
                  <Text style={styles.headingNoMargin}>
                    Compose notification
                  </Text>
                  <Text style={styles.optedIn}>{optedIn.length} opted in</Text>
                </View>
                <Text style={styles.help}>
                  Send to all opted-in players or choose individual recipients.
                </Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  maxLength={60}
                  placeholder="Notification title"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
                <TextInput
                  value={body}
                  onChangeText={setBody}
                  maxLength={220}
                  multiline
                  placeholder="Write a short message…"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, styles.body]}
                />
                <Text style={styles.counter}>{body.length}/220</Text>
                <View style={styles.audienceRow}>
                  {(["all", "selected"] as const).map((value) => (
                    <Pressable
                      key={value}
                      onPress={() => setAudience(value)}
                      style={[
                        styles.audienceButton,
                        audience === value && styles.filterActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterText,
                          audience === value && styles.filterTextActive,
                        ]}
                      >
                        {value === "all" ? "All opted-in" : "Selected users"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {audience === "selected" && (
                  <View style={styles.audienceList}>
                    {optedIn.map((user) => {
                      const checked = selected.includes(user.userId);
                      return (
                        <Pressable
                          key={user.userId}
                          onPress={() =>
                            setSelected((current) =>
                              checked
                                ? current.filter((id) => id !== user.userId)
                                : [...current, user.userId],
                            )
                          }
                          style={styles.audienceUser}
                        >
                          <Ionicons
                            name={checked ? "checkbox" : "square-outline"}
                            size={20}
                            color={checked ? colors.cyan : colors.muted}
                          />
                          <View>
                            <Text style={styles.userName}>
                              {user.username || user.email}
                            </Text>
                            <Text style={styles.userMeta}>{user.email}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                <Pressable
                  disabled={
                    sending ||
                    !title.trim() ||
                    !body.trim() ||
                    !optedIn.length ||
                    (audience === "selected" && !selected.length)
                  }
                  onPress={send}
                  style={[
                    styles.send,
                    (sending ||
                      !title.trim() ||
                      !body.trim() ||
                      !optedIn.length ||
                      (audience === "selected" && !selected.length)) &&
                      styles.disabled,
                  ]}
                >
                  <Ionicons
                    name="paper-plane-outline"
                    size={18}
                    color={colors.background}
                  />
                  <Text style={styles.sendText}>
                    {sending ? "Sending…" : "Review and send"}
                  </Text>
                </Pressable>
              </View>
              <View style={[styles.panel, styles.automation]}>
                <View>
                  <Text style={styles.eyebrow}>AUTOMATION</Text>
                  <Text style={styles.automationTitle}>
                    Daily Challenge result
                  </Text>
                  <Text style={styles.help}>
                    Top-three finishers are notified at 10:00 the following day.
                  </Text>
                </View>
                <Text style={styles.activeBadge}>ACTIVE</Text>
              </View>
              <Text style={styles.heading}>Custom notification history</Text>
              {data.notificationHistory.length ? (
                data.notificationHistory.map((item) => (
                  <View key={item.id} style={styles.history}>
                    <View style={styles.userTop}>
                      <Text style={styles.historyTitle}>{item.title}</Text>
                      <Text style={styles.historyAudience}>
                        {item.audience === "selected"
                          ? `${item.selectedCount} selected`
                          : "All users"}
                      </Text>
                    </View>
                    <Text style={styles.historyDate}>
                      {new Date(item.sentAt).toLocaleString()}
                    </Text>
                    <Text style={styles.historyBody}>{item.body}</Text>
                    <Text style={styles.userMeta}>
                      {item.audienceCount} eligible · {item.sentCount} sent ·{" "}
                      {item.failedCount} failed
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.empty}>
                  No custom notifications have been recorded yet.
                </Text>
              )}
              <Text style={styles.heading}>Lifecycle email history</Text>
              <Text style={styles.help}>
                Recent account and marketing emails. Delivery updates can take a
                moment to arrive.
              </Text>
              {data.emailHistory.length ? (
                data.emailHistory.map((item) => (
                  <View key={item.id} style={styles.history}>
                    <View style={styles.userTop}>
                      <Text style={styles.historyTitle}>
                        {item.campaign.toLowerCase().replaceAll("_", " ")}
                      </Text>
                      <Text
                        style={[
                          styles.historyAudience,
                          ["BOUNCED", "COMPLAINT", "FAILED"].includes(
                            item.status,
                          ) && styles.emailIssue,
                        ]}
                      >
                        {item.status}
                      </Text>
                    </View>
                    <Text style={styles.historyDate}>
                      {item.sentAt
                        ? new Date(item.sentAt).toLocaleString()
                        : "Unknown send time"}
                    </Text>
                    <Text style={styles.historyBody}>
                      {item.username || item.recipient || "Unknown user"}
                    </Text>
                    {item.username && (
                      <Text numberOfLines={1} style={styles.userMeta}>
                        {item.recipient}
                      </Text>
                    )}
                    <Text style={styles.userMeta}>
                      {item.clickedAt
                        ? `Clicked ${new Date(item.clickedAt).toLocaleString()}`
                        : item.deliveredAt
                          ? `Delivered ${new Date(item.deliveredAt).toLocaleString()}`
                          : item.lastEventType
                              ?.toLowerCase()
                              .replaceAll("_", " ") ||
                            "Awaiting delivery event"}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.empty}>
                  No lifecycle emails have been recorded yet.
                </Text>
              )}
            </>
          )}
          {data && (
            <Text style={styles.updated}>
              Updated {new Date(data.generatedAt).toLocaleString()}
            </Text>
          )}
        </ScrollView>
      )}
      <Modal
        visible={Boolean(selectedUser)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedUser(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismiss}
            onPress={() => setSelectedUser(null)}
          />
          <View style={styles.userSheet}>
            {selectedUser && (
              <>
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.eyebrow}>PLAYER DETAIL</Text>
                    <Text style={styles.sheetTitle}>
                      {selectedUser.username || "No username"}
                    </Text>
                    <Text style={styles.userEmail}>{selectedUser.email}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Close player details"
                    onPress={() => setSelectedUser(null)}
                    style={styles.sheetClose}
                  >
                    <Ionicons name="close" size={21} color={colors.cyan} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.sheetContent}>
                  <Text style={styles.heading}>Account</Text>
                  <View style={styles.panel}>
                    <Text style={styles.userMeta}>
                      User ID · {selectedUser.userId}
                    </Text>
                    <Text style={styles.userMeta}>
                      Name · {selectedUser.firstName} {selectedUser.lastName}
                    </Text>
                    <Text style={styles.userMeta}>
                      Status · {selectedUser.status} · email{" "}
                      {selectedUser.emailVerified ? "verified" : "not verified"}
                    </Text>
                    <Text style={styles.userMeta}>
                      Joined · {date(selectedUser.signedUpAt)} · updated{" "}
                      {date(selectedUser.accountUpdatedAt)}
                    </Text>
                    <Text style={styles.userMeta}>
                      Push notifications ·{" "}
                      {selectedUser.pushNotificationsEnabled
                        ? "enabled"
                        : "disabled"}
                    </Text>
                    <Text style={styles.userMeta}>
                      Observed platforms ·{" "}
                      {selectedUser.lifecyclePlatforms?.join(", ") ||
                        "None yet"}
                    </Text>
                  </View>
                  <Text style={styles.heading}>Performance</Text>
                  <View style={styles.grid}>
                    {stat("Games", selectedUser.gamesPlayed, "dice-outline")}
                    {stat(
                      "Average",
                      selectedUser.averageScore ?? "—",
                      "speedometer-outline",
                    )}
                    {stat(
                      "Best",
                      selectedUser.bestScore ?? "—",
                      "trophy-outline",
                    )}
                    {stat(
                      "Last played",
                      date(selectedUser.lastPlayedAt),
                      "calendar-outline",
                    )}
                    {stat("Solo", selectedUser.soloGames, "person-outline")}
                    {stat("Daily", selectedUser.dailyGames, "sunny-outline")}
                    {stat(
                      "Remote W–D–L",
                      `${selectedUser.remoteWins}–${selectedUser.remoteDraws ?? 0}–${selectedUser.remoteLosses ?? 0}`,
                      "people-outline",
                    )}
                    {stat(
                      "Tracked starts",
                      selectedUser.gameStarts ?? 0,
                      "play-outline",
                    )}
                  </View>
                  <Text style={styles.heading}>Engagement trend</Text>
                  <UserActivityChart user={selectedUser} />
                  <Text style={styles.heading}>Abandonment</Text>
                  <View style={styles.grid}>
                    {stat(
                      "Total left",
                      selectedUser.abandonedGames ?? 0,
                      "exit-outline",
                    )}
                    {stat(
                      "Resets",
                      selectedUser.resetGames ?? 0,
                      "refresh-outline",
                    )}
                    {stat(
                      "Mode switches",
                      selectedUser.modeSwitchAbandons ?? 0,
                      "swap-horizontal-outline",
                    )}
                    {stat(
                      "Remote exits",
                      selectedUser.remoteExits ?? 0,
                      "log-out-outline",
                    )}
                    {stat(
                      "Avg round",
                      selectedUser.averageAbandonRound ?? 0,
                      "analytics-outline",
                    )}
                    {stat(
                      "Last left",
                      date(selectedUser.lastAbandonedAt),
                      "time-outline",
                    )}
                  </View>
                  {selectedUser.lifecycleModeBreakdown?.length ? (
                    <>
                      <Text style={styles.heading}>Mode behaviour</Text>
                      <View style={styles.panel}>
                        {selectedUser.lifecycleModeBreakdown.map((item) => (
                          <View key={item.mode} style={styles.metricRow}>
                            <Text style={styles.metricLabel}>{item.mode}</Text>
                            <Text style={styles.metric}>
                              {item.starts} starts · {item.completions} done ·{" "}
                              {item.abandons} left
                            </Text>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : null}
                  {selectedUser.recentGames?.length ? (
                    <>
                      <Text style={styles.heading}>Recent games</Text>
                      {selectedUser.recentGames.map((game) => (
                        <View key={game.id} style={styles.submission}>
                          <View>
                            <Text style={styles.userName}>
                              {game.mode}
                              {game.opponent ? ` vs ${game.opponent}` : ""}
                            </Text>
                            <Text style={styles.userMeta}>
                              {new Date(game.completedAt).toLocaleString()} ·{" "}
                              {game.yahtzeeCount} Yahtzees
                              {game.earnedUpperBonus ? " · Upper bonus" : ""}
                            </Text>
                          </View>
                          <Text style={styles.score}>{game.score}</Text>
                        </View>
                      ))}
                    </>
                  ) : null}
                  {selectedUser.recentAbandonments?.length ? (
                    <>
                      <Text style={styles.heading}>Recent abandoned games</Text>
                      {selectedUser.recentAbandonments.map((event) => (
                        <View
                          key={`${event.gameId}-${event.action}`}
                          style={styles.submission}
                        >
                          <View>
                            <Text style={styles.userName}>
                              {event.mode} · {event.action.replace("_", " ")}
                            </Text>
                            <Text style={styles.userMeta}>
                              {new Date(event.occurredAt).toLocaleString()} ·{" "}
                              {event.platform} · {event.categoriesFilled}{" "}
                              categories
                            </Text>
                          </View>
                          <Text style={styles.score}>R{event.round}</Text>
                        </View>
                      ))}
                    </>
                  ) : null}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#315a5e",
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: { color: colors.yellow, fontSize: 21, fontWeight: "900" },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    padding: 3,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9 },
  activeTab: { backgroundColor: "#20383b" },
  tabText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  activeTabText: { color: colors.cyan },
  loader: { flex: 1 },
  content: { padding: 16, paddingBottom: 30 },
  heading: {
    color: colors.cyan,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12,
    marginBottom: 9,
  },
  headingNoMargin: { color: colors.cyan, fontSize: 18, fontWeight: "900" },
  sectionHint: {
    color: colors.muted,
    fontSize: 9,
    marginTop: -6,
    marginBottom: 9,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: {
    width: "48.7%",
    minHeight: 105,
    padding: 13,
    borderWidth: 1,
    borderColor: "#2d3c40",
    borderRadius: 13,
    backgroundColor: colors.surface,
  },
  statButton: { minHeight: 124 },
  statPressed: { borderColor: colors.cyan, transform: [{ scale: 0.985 }] },
  statValue: {
    color: colors.yellow,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 7,
  },
  statLabel: { color: colors.muted, fontSize: 10, marginTop: 2 },
  statLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 8,
  },
  statLinkText: {
    color: colors.cyan,
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  panelLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
    marginTop: 5,
  },
  chart: {
    height: 132,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2d3c40",
    backgroundColor: colors.surface,
  },
  chartColumn: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  chartBar: {
    width: "100%",
    minHeight: 4,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: colors.pink,
  },
  chartValue: {
    color: colors.yellow,
    fontSize: 7,
    fontWeight: "900",
    marginBottom: 3,
  },
  chartAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  chartAxisText: { color: colors.muted, fontSize: 8 },
  chartHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  chartHelp: { color: colors.muted, fontSize: 9, marginTop: 3 },
  periods: { gap: 5, paddingVertical: 11 },
  period: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#315057",
    backgroundColor: colors.background,
  },
  periodActive: {
    borderColor: colors.cyan,
    backgroundColor: colors.cyan,
    shadowColor: colors.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  periodText: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  periodTextActive: { color: colors.background },
  nativeChart: { height: 180, overflow: "visible", position: "relative" },
  chartTouchLayer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "2%",
    right: "2%",
    flexDirection: "row",
  },
  chartTouch: { flex: 1, borderRadius: 3 },
  chartTouchSelected: {
    backgroundColor: "rgba(250,255,0,.10)",
    borderWidth: 1,
    borderColor: "rgba(250,255,0,.42)",
  },
  chartSelection: {
    marginTop: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(250,255,0,.42)",
    backgroundColor: colors.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  chartSelectionDate: {
    flex: 1,
    color: colors.mint,
    fontSize: 9,
    fontWeight: "800",
  },
  chartSelectionValue: {
    color: colors.yellow,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "right",
  },
  legend: { flexDirection: "row", gap: 8, alignItems: "center" },
  legendGames: {
    color: colors.cyan,
    fontSize: 7,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  legendLine: {
    color: colors.pink,
    fontSize: 7,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  submissionFilters: { flexDirection: "row", gap: 6, marginBottom: 8 },
  panel: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#2d3c40",
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  metricRow: {
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricLabel: { color: colors.mint, fontSize: 11 },
  metric: { color: colors.yellow, fontWeight: "900", fontSize: 11 },
  funnelRow: { marginBottom: 8 },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "#263337",
  },
  fill: { height: "100%", borderRadius: 3, backgroundColor: colors.cyan },
  input: {
    color: colors.white,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#315a5e",
    borderRadius: 11,
    padding: 12,
    marginBottom: 10,
  },
  search: { marginTop: 14 },
  filters: { gap: 6, paddingBottom: 2 },
  filter: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#315057",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterActive: { borderColor: colors.cyan, backgroundColor: "#20383b" },
  filterText: { color: colors.muted, fontSize: 9, fontWeight: "900" },
  filterTextActive: { color: colors.cyan },
  user: {
    padding: 13,
    marginBottom: 8,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#2d3c40",
    backgroundColor: colors.surface,
  },
  userPressed: { borderColor: colors.cyan, opacity: 0.8 },
  userTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  userScoreRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  nameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  userName: { color: colors.mint, fontWeight: "900" },
  userScore: { color: colors.yellow, fontSize: 18, fontWeight: "900" },
  userEmail: { color: colors.white, fontSize: 11, marginTop: 3 },
  userMeta: { color: colors.muted, fontSize: 9, marginTop: 4 },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: colors.yellow,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  adminBadgeText: { color: colors.yellow, fontSize: 7, fontWeight: "900" },
  submission: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#263337",
  },
  score: { color: colors.yellow, fontSize: 20, fontWeight: "900" },
  activityRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  activityDate: { width: 43, color: colors.muted, fontSize: 9 },
  activityTrack: {
    flex: 1,
    height: 8,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: "#263337",
  },
  activityFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: colors.cyan,
  },
  activityCount: {
    width: 43,
    color: colors.yellow,
    fontSize: 8,
    fontWeight: "900",
    textAlign: "right",
  },
  composeHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optedIn: {
    color: colors.cyan,
    fontSize: 9,
    borderWidth: 1,
    borderColor: "#315057",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  help: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 13,
  },
  body: { minHeight: 105, textAlignVertical: "top" },
  counter: {
    color: colors.muted,
    fontSize: 8,
    textAlign: "right",
    marginTop: -6,
    marginBottom: 9,
  },
  audienceRow: { flexDirection: "row", gap: 7, marginBottom: 10 },
  audienceButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#315057",
    padding: 9,
  },
  audienceList: {
    maxHeight: 230,
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    padding: 5,
  },
  audienceUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
  },
  send: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    padding: 13,
    borderRadius: 11,
    backgroundColor: colors.yellow,
  },
  sendText: { color: colors.background, fontWeight: "900" },
  disabled: { opacity: 0.4 },
  automation: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  automationTitle: { color: colors.yellow, fontWeight: "900", marginTop: 3 },
  activeBadge: {
    color: "#6ee7a5",
    fontSize: 8,
    fontWeight: "900",
    borderWidth: 1,
    borderColor: "#397559",
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  history: {
    padding: 13,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2d3c40",
    borderRadius: 13,
    backgroundColor: colors.surface,
  },
  historyTitle: {
    flex: 1,
    color: colors.yellow,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  historyAudience: {
    color: colors.cyan,
    fontSize: 8,
    textTransform: "uppercase",
  },
  emailIssue: { color: colors.danger },
  historyDate: { color: colors.muted, fontSize: 8, marginTop: 3 },
  historyBody: {
    color: colors.mint,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 9,
  },
  empty: { color: colors.muted, textAlign: "center", padding: 18 },
  updated: {
    color: colors.muted,
    fontSize: 9,
    textAlign: "center",
    marginTop: 16,
  },
  message: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  error: { color: colors.danger, textAlign: "center", marginTop: 9 },
  retry: {
    marginTop: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: colors.cyan,
    borderRadius: 10,
  },
  retryText: { color: colors.cyan, fontWeight: "900" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,.72)",
  },
  modalDismiss: { flex: 1 },
  userSheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "#315a5e",
    backgroundColor: colors.background,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#263337",
  },
  sheetTitle: {
    color: colors.yellow,
    fontSize: 23,
    fontWeight: "900",
    marginTop: 2,
  },
  sheetClose: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: colors.surface,
  },
  sheetContent: { padding: 16, paddingBottom: 38 },
});
