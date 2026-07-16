import { Button, Picker, Switch, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cloudCall } from "../../cloud";

type NotificationEventGroup = "health" | "interaction" | "tasks" | "rituals" | "village";

type NotificationPreferences = {
  inApp: boolean;
  wechat: boolean;
  quietHours: { enabled: boolean; start: string; end: string };
  events: Record<NotificationEventGroup, boolean>;
};

type NotificationItem = {
  id: string;
  type: string;
  icon: string;
  title: string;
  body: string;
  actorNickname: string;
  targetTab: string;
  read: boolean;
  readAt: number | null;
  wechatStatus: string;
  createdAt: number;
};

type NotificationCenterData = {
  items: NotificationItem[];
  unreadCount: number;
  notification: {
    availableQuota: number;
    configured: boolean;
    templateId: string | null;
  };
  preferences: NotificationPreferences;
  serverTime: number;
};

const eventGroups: Array<{ key: NotificationEventGroup; icon: string; title: string; detail: string }> = [
  { key: "health", icon: "🌱", title: "健康打卡", detail: "称重与如厕记录" },
  { key: "interaction", icon: "💗", title: "点赞与催促", detail: "红心、抱抱和轻提醒" },
  { key: "tasks", icon: "✅", title: "共同事项", detail: "待办、日程和共同决定" },
  { key: "rituals", icon: "🌤️", title: "每日默契", detail: "心情打卡与默契题" },
  { key: "village", icon: "🌾", title: "村庄互动", detail: "村庄里的回应与留言" },
];

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return sameDay ? `今天 ${clock}` : `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
}

export default function NotificationsPanel({
  onSummaryChange,
  onNavigate,
}: {
  onSummaryChange: (summary: { unreadCount: number; availableQuota: number }) => void;
  onNavigate: (tab: string) => void;
}) {
  const [data, setData] = useState<NotificationCenterData | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    const result = await cloudCall("notification-center");
    if (result.status !== 200) {
      setError(String(result.data.error || "消息盒子暂时没有打开。"));
      setLoading(false);
      return;
    }
    const next = result.data as unknown as NotificationCenterData;
    setData(next);
    setPreferences(next.preferences);
    onSummaryChange({
      unreadCount: next.unreadCount,
      availableQuota: next.notification.availableQuota,
    });
    setLoading(false);
  }, [onSummaryChange]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const requestWechatReminder = async () => {
    const templateId = data?.notification.templateId;
    if (!templateId) {
      await Taro.showToast({ title: "微信提醒模板尚未配置", icon: "none" });
      return;
    }
    try {
      const result = await Taro.requestSubscribeMessage({ tmplIds: [templateId] } as never);
      const choice = String((result as unknown as Record<string, unknown>)[templateId] || "reject");
      if (choice !== "accept" && choice !== "acceptWithAudio") {
        await Taro.showToast({ title: "这次没有存入提醒次数", icon: "none" });
        return;
      }
      const saved = await cloudCall("save-subscription-consent", {
        templateKey: "partner_activity",
        templateId,
        result: choice,
      });
      if (saved.status !== 201) throw new Error(String(saved.data.error || "授权没有保存"));
      await load(true);
      await Taro.showToast({ title: "已存入 1 次微信提醒", icon: "none" });
    } catch (subscriptionError) {
      console.error("Partner activity subscription failed", subscriptionError);
      await Taro.showToast({ title: "微信提醒没有开启", icon: "none" });
    }
  };

  const savePreferences = async () => {
    if (!preferences) return;
    setBusy(true);
    const result = await cloudCall("update-notification-preferences", { preferences });
    setBusy(false);
    if (result.status !== 200) {
      await Taro.showToast({ title: String(result.data.error || "设置没有保存"), icon: "none" });
      return;
    }
    await Taro.showToast({ title: "消息偏好保存啦", icon: "none" });
    await load(true);
  };

  const markAllRead = async () => {
    if (!data?.unreadCount) return;
    setBusy(true);
    const result = await cloudCall("mark-notification-read", { all: true });
    setBusy(false);
    if (result.status === 200) await load(true);
  };

  const openItem = async (item: NotificationItem) => {
    if (!item.read) {
      const result = await cloudCall("mark-notification-read", { id: item.id });
      if (result.status === 200) await load(true);
    }
    onNavigate(item.targetTab || "farm");
  };

  const visibleItems = useMemo(() => (data?.items || []).filter((item) => (
    filter === "unread" ? !item.read : true
  )), [data?.items, filter]);

  if (loading && !data) return <View className="notification-loading">💌 正在打开情侣消息盒子…</View>;
  if (error && !data) return <View className="panel notification-error"><Text className="subtitle">消息盒子暂时打了个盹</Text><Text className="description">{error}</Text><Button className="primary" onClick={() => load()}>重新连接</Button></View>;

  return (
    <>
      <View className="page-heading notification-heading">
        <Text className="kicker">我们俩的小田地 · 0.7.0</Text>
        <Text className="title">情侣消息盒子</Text>
        <Text className="description">每一次打卡、回应和共同完成，都不会悄悄溜走。</Text>
      </View>

      <View className="panel notification-quota-card">
        <View className="notification-quota-copy"><Text className="kicker">微信伴侣动态提醒</Text><Text className="subtitle">已存 {data?.notification.availableQuota || 0} 次</Text><Text className="description small">微信规定每次授权只能发送一次。提前存入后，伴侣下一次打卡、点赞或催促就能在微信里提醒你；没有次数时仍会进入站内消息盒子。</Text></View>
        <Button className="primary" onClick={requestWechatReminder}>＋ 存 1 次提醒</Button>
      </View>

      {preferences && <View className="panel notification-settings">
        <Text className="kicker">提醒偏好</Text>
        <Text className="subtitle">想收到什么，由你决定</Text>
        <View className="setting-row"><View><Text className="activity-title">💌 站内消息</Text><Text className="role">保留在消息盒子里，打开小程序即可查看</Text></View><Switch checked={preferences.inApp} color="#7457ff" onChange={(event) => setPreferences((current) => current ? { ...current, inApp: event.detail.value } : current)} /></View>
        <View className="setting-row"><View><Text className="activity-title">🔔 微信提醒</Text><Text className="role">有可用授权次数时发送订阅消息</Text></View><Switch checked={preferences.wechat} color="#7457ff" onChange={(event) => setPreferences((current) => current ? { ...current, wechat: event.detail.value } : current)} /></View>
        <View className="setting-row"><View><Text className="activity-title">🌙 夜间免打扰</Text><Text className="role">免打扰结束后再发送仍有效的提醒</Text></View><Switch checked={preferences.quietHours.enabled} color="#7457ff" onChange={(event) => setPreferences((current) => current ? { ...current, quietHours: { ...current.quietHours, enabled: event.detail.value } } : current)} /></View>
        {preferences.quietHours.enabled && <View className="quiet-time-row"><Picker mode="time" value={preferences.quietHours.start} onChange={(event) => setPreferences((current) => current ? { ...current, quietHours: { ...current.quietHours, start: String(event.detail.value) } } : current)}><View className="picker-field">从 {preferences.quietHours.start}</View></Picker><Text>到</Text><Picker mode="time" value={preferences.quietHours.end} onChange={(event) => setPreferences((current) => current ? { ...current, quietHours: { ...current.quietHours, end: String(event.detail.value) } } : current)}><View className="picker-field">{preferences.quietHours.end}</View></Picker></View>}
        <View className="notification-event-list">{eventGroups.map((group) => <View className="setting-row compact-setting" key={group.key}><View><Text className="activity-title">{group.icon} {group.title}</Text><Text className="role">{group.detail}</Text></View><Switch checked={preferences.events[group.key]} color="#7457ff" onChange={(event) => setPreferences((current) => current ? { ...current, events: { ...current.events, [group.key]: event.detail.value } } : current)} /></View>)}</View>
        <Button className="secondary" loading={busy} onClick={savePreferences}>保存提醒偏好</Button>
      </View>}

      <View className="notification-list-heading"><View><Text className="kicker">最近消息</Text><Text className="subtitle">{data?.unreadCount || 0} 条未读</Text></View>{Boolean(data?.unreadCount) && <Button disabled={busy} onClick={markAllRead}>全部已读</Button>}</View>
      <View className="memo-list-tabs notification-tabs"><Button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</Button><Button className={filter === "unread" ? "active" : ""} onClick={() => setFilter("unread")}>只看未读</Button></View>
      <View className="notification-list">
        {visibleItems.map((item) => <View className={`notification-item ${item.read ? "read" : "unread"}`} key={item.id} onClick={() => openItem(item)}><Text className="notification-item-icon">{item.icon}</Text><View className="notification-item-copy"><View className="notification-title-row"><Text className="activity-title">{item.title}</Text>{!item.read && <Text className="unread-dot" />}</View><Text className="notification-body">{item.body}</Text><Text className="role">{formatTime(item.createdAt)} · 来自 {item.actorNickname}</Text></View><Text className="chevron">›</Text></View>)}
        {!visibleItems.length && <View className="panel empty">{filter === "unread" ? "✨ 消息都看完啦。" : "💌 伴侣的下一次打卡或回应会出现在这里。"}</View>}
      </View>
    </>
  );
}
