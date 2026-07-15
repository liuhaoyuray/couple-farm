import { Button, Canvas, Input, Picker, ScrollView, Switch, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./index.scss";

type ReminderRule = {
  enabled: boolean;
  time: string;
  days: number[];
};

type ReminderSettings = {
  weight: ReminderRule;
  poop: ReminderRule;
  anniversary: { enabled: boolean; advanceDays: number[] };
};

type UserProfile = {
  uid: string;
  nickname: string;
  avatar: string;
  color: string;
  profileComplete: boolean;
  coupleId: string | null;
  reminders?: ReminderSettings;
};

type CoupleInfo = {
  id: string;
  farmName: string;
  togetherSince: string | null;
  createdAt: number;
  updatedAt: number;
  updatedBy: string | null;
};

type WeightEntry = {
  id: string;
  ownerUid: string;
  weightKg: number;
  recordedAt: number;
};

type PoopEntry = {
  id: string;
  ownerUid: string;
  occurredAt: number;
};

type Reaction = {
  id: string;
  fromUserUid: string;
  toUserUid: string;
  kind: "like" | "tease";
  message: string;
  createdAt: number;
};

type Anniversary = {
  id: string;
  coupleId: string;
  title: string;
  date: string;
  icon: string;
  note: string;
  repeatsYearly: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

type FarmData = {
  viewer: UserProfile;
  partner: UserProfile | null;
  couple: CoupleInfo | null;
  weights?: WeightEntry[];
  poops?: PoopEntry[];
  reactions?: Reaction[];
  anniversaries?: Anniversary[];
  serverTime: number;
};

type CloudResult = {
  status: number;
  data: Record<string, unknown>;
};

type TabKey = "farm" | "trends" | "anniversaries" | "us";
type RecordItem = {
  id: string;
  type: "weight" | "poop";
  ownerUid: string;
  occurredAt: number;
  weightKg?: number;
};

const DAY = 24 * 60 * 60 * 1000;
const avatars = ["🐣", "🐰", "🐻", "🐼", "🐱", "🐶", "🦊", "🐸"];
const colors = ["#7457ff", "#ef5b8f", "#148bc8", "#2f9e62", "#d97706", "#b453c6"];
const anniversaryIcons = ["💞", "🎂", "🌱", "✨", "🏠", "🎉"];
const defaultReminders: ReminderSettings = {
  weight: { enabled: false, time: "08:00", days: [0, 1, 2, 3, 4, 5, 6] },
  poop: { enabled: false, time: "20:30", days: [0, 1, 2, 3, 4, 5, 6] },
  anniversary: { enabled: true, advanceDays: [7, 1, 0] },
};

function cloneReminders(value?: ReminderSettings): ReminderSettings {
  return {
    weight: {
      enabled: Boolean(value?.weight?.enabled),
      time: value?.weight?.time || defaultReminders.weight.time,
      days: value?.weight?.days?.length ? [...value.weight.days] : [...defaultReminders.weight.days],
    },
    poop: {
      enabled: Boolean(value?.poop?.enabled),
      time: value?.poop?.time || defaultReminders.poop.time,
      days: value?.poop?.days?.length ? [...value.poop.days] : [...defaultReminders.poop.days],
    },
    anniversary: {
      enabled: value?.anniversary?.enabled !== false,
      advanceDays: value?.anniversary?.advanceDays?.length
        ? [...value.anniversary.advanceDays]
        : [...defaultReminders.anniversary.advanceDays],
    },
  };
}

function dateValue(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeValue(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function timestampFrom(date: string, time: string) {
  return new Date(`${date}T${time}:00`).getTime();
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}

function dayKey(timestamp: number) {
  return dateValue(timestamp);
}

function formatDateTime(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${timeValue(timestamp)}`;
}

function formatDateLabel(value: string) {
  const date = parseLocalDate(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function latestWeight(entries: WeightEntry[], uid: string) {
  return [...entries].filter((item) => item.ownerUid === uid).sort((left, right) => right.recordedAt - left.recordedAt)[0];
}

function todayPoops(entries: PoopEntry[], uid: string) {
  const today = dayKey(Date.now());
  return entries.filter((item) => item.ownerUid === uid && dayKey(item.occurredAt) === today).length;
}

function todayWeights(entries: WeightEntry[], uid: string) {
  const today = dayKey(Date.now());
  return entries.filter((item) => item.ownerUid === uid && dayKey(item.recordedAt) === today).length;
}

function nextOccurrence(anniversary: Anniversary) {
  const source = parseLocalDate(anniversary.date);
  if (!anniversary.repeatsYearly) return source;
  const today = new Date(startOfToday());
  let next = new Date(today.getFullYear(), source.getMonth(), source.getDate(), 12);
  if (next.getTime() < today.getTime()) next = new Date(today.getFullYear() + 1, source.getMonth(), source.getDate(), 12);
  return next;
}

function daysUntil(timestamp: number) {
  return Math.ceil((timestamp - startOfToday()) / DAY);
}

function togetherDayCount(value: string | null) {
  if (!value) return null;
  return Math.max(1, Math.floor((startOfToday() - parseLocalDate(value).getTime()) / DAY) + 1);
}

function nextReminderTimestamp(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return Math.floor(next.getTime() / 1000);
}

async function cloudCall(action: string, payload: Record<string, unknown> = {}): Promise<CloudResult> {
  try {
    const response = await Taro.cloud.callFunction({
      name: "couple-tracker",
      data: { action, payload, channel: "mini" },
    });
    const result = response.result as CloudResult | undefined;
    if (!result || typeof result.status !== "number") {
      return { status: 500, data: { error: "云端没有返回有效数据。" } };
    }
    return result;
  } catch (error) {
    console.error("Cloud function request failed", error);
    return { status: 503, data: { error: "没有连上情侣小农场，请稍后重试。" } };
  }
}

function Loading({ error, retry }: { error?: string | null; retry?: () => void }) {
  return (
    <View className="full-page">
      <View className="message-card">
        <Text className="pixel-heart">♥</Text>
        <Text className="kicker">情侣小农场 · 0.2.0</Text>
        <Text className="title">{error ? "小农场打了个盹" : "正在打开情侣小农场"}</Text>
        <Text className="description">{error || "第一次打开会自动领取微信身份，不需要注册密码。"}</Text>
        {retry && <Button className="primary" onClick={retry}>重新连接</Button>}
      </View>
    </View>
  );
}

export default function IndexPage() {
  const [data, setData] = useState<FarmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("farm");
  const [createdInvite, setCreatedInvite] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");

  const [profileNickname, setProfileNickname] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("🐣");
  const [profileColor, setProfileColor] = useState(colors[0]);
  const [farmName, setFarmName] = useState("");
  const [togetherSince, setTogetherSince] = useState("");
  const [reminders, setReminders] = useState<ReminderSettings>(() => cloneReminders());

  const [weight, setWeight] = useState("");
  const [recordDate, setRecordDate] = useState(() => dateValue());
  const [recordTime, setRecordTime] = useState(() => timeValue());
  const [editingWeightId, setEditingWeightId] = useState<string | null>(null);
  const [editingPoopId, setEditingPoopId] = useState<string | null>(null);
  const [trendRange, setTrendRange] = useState<7 | 30 | 90>(30);

  const [anniversaryTitle, setAnniversaryTitle] = useState("");
  const [anniversaryDate, setAnniversaryDate] = useState(() => dateValue());
  const [anniversaryIcon, setAnniversaryIcon] = useState("💞");
  const [anniversaryNote, setAnniversaryNote] = useState("");
  const [anniversaryRepeats, setAnniversaryRepeats] = useState(true);
  const [editingAnniversaryId, setEditingAnniversaryId] = useState<string | null>(null);

  const hydrateForms = useCallback((next: FarmData) => {
    setProfileNickname(next.viewer.nickname === "农场新朋友" ? "" : next.viewer.nickname);
    setProfileAvatar(next.viewer.avatar || "🐣");
    setProfileColor(next.viewer.color || colors[0]);
    setFarmName(next.couple?.farmName || "");
    setTogetherSince(next.couple?.togetherSince || "");
    setReminders(cloneReminders(next.viewer.reminders));
  }, []);

  const bootstrap = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    const result = await cloudCall("bootstrap");
    if (result.status !== 200) {
      setError(typeof result.data.error === "string" ? result.data.error : "云端连接失败。");
      setLoading(false);
      return;
    }
    const next = result.data as unknown as FarmData;
    setData(next);
    hydrateForms(next);
    setLoading(false);
  }, [hydrateForms]);

  useDidShow(() => {
    void bootstrap(Boolean(data));
  });

  usePullDownRefresh(() => {
    void bootstrap(true).finally(() => Taro.stopPullDownRefresh());
  });

  const runAction = async (
    action: string,
    payload: Record<string, unknown>,
    success: string,
    refresh = true,
  ) => {
    setBusy(true);
    setError(null);
    const result = await cloudCall(action, payload);
    setBusy(false);
    if (result.status < 200 || result.status >= 300) {
      const message = typeof result.data.error === "string" ? result.data.error : "操作失败，请重试。";
      setError(message);
      await Taro.showToast({ title: message, icon: "none", duration: 2600 });
      return null;
    }
    await Taro.showToast({ title: success, icon: "none" });
    if (refresh) await bootstrap(true);
    return result;
  };

  const saveProfile = async () => {
    if (!profileNickname.trim()) return Taro.showToast({ title: "先取个昵称吧", icon: "none" });
    await runAction("update-profile", {
      nickname: profileNickname.trim(),
      avatar: profileAvatar,
      color: profileColor,
    }, "资料保存啦");
  };

  const createInvite = async () => {
    setBusy(true);
    const result = await cloudCall("create-invite");
    setBusy(false);
    if (result.status !== 201) {
      setError(typeof result.data.error === "string" ? result.data.error : "配对码生成失败。");
      return;
    }
    const code = String(result.data.code);
    setCreatedInvite(code);
    await Taro.setClipboardData({ data: code });
  };

  const acceptInvite = async () => {
    const ok = await runAction("accept-invite", { code: inviteCode }, "绑定成功啦");
    if (ok) setInviteCode("");
  };

  const resetRecordForm = () => {
    setWeight("");
    setRecordDate(dateValue());
    setRecordTime(timeValue());
    setEditingWeightId(null);
    setEditingPoopId(null);
  };

  const saveWeight = async () => {
    const action = editingWeightId ? "update-weight" : "add-weight";
    const ok = await runAction(action, {
      id: editingWeightId || undefined,
      weightKg: Number(weight),
      occurredAt: timestampFrom(recordDate, recordTime),
    }, editingWeightId ? "体重修改啦" : "体重记下啦");
    if (ok) resetRecordForm();
  };

  const savePoop = async () => {
    const action = editingPoopId ? "update-poop" : "add-poop";
    const ok = await runAction(action, {
      id: editingPoopId || undefined,
      occurredAt: timestampFrom(recordDate, recordTime),
    }, editingPoopId ? "时间修改啦" : "如厕记下啦");
    if (ok) resetRecordForm();
  };

  const saveFarmSettings = async () => {
    await runAction("update-couple-settings", {
      farmName: farmName.trim(),
      togetherSince: togetherSince || null,
    }, "农场更新啦");
  };

  const saveReminderSettings = async () => {
    await runAction("update-reminders", { reminders }, "提醒保存啦");
  };

  const addDailyCalendarReminder = async (kind: "weight" | "poop") => {
    const rule = reminders[kind];
    const title = kind === "weight" ? "情侣小农场 · 记体重" : "情侣小农场 · 记如厕";
    const description = kind === "weight" ? "打开情侣小农场，记录今天的体重。" : "打开情侣小农场，记录今天的如厕情况。";
    try {
      await Taro.addPhoneRepeatCalendar({
        title,
        startTime: nextReminderTimestamp(rule.time),
        description,
        alarm: true,
        alarmOffset: 0,
        repeatInterval: "day",
      });
      await Taro.showToast({ title: "已加入手机日历", icon: "none" });
    } catch (calendarError) {
      console.error("Unable to add calendar reminder", calendarError);
      await Taro.showToast({ title: "没有加入日历，请检查日历权限", icon: "none", duration: 2800 });
    }
  };

  const resetAnniversaryForm = () => {
    setAnniversaryTitle("");
    setAnniversaryDate(dateValue());
    setAnniversaryIcon("💞");
    setAnniversaryNote("");
    setAnniversaryRepeats(true);
    setEditingAnniversaryId(null);
  };

  const saveAnniversary = async () => {
    const action = editingAnniversaryId ? "update-anniversary" : "add-anniversary";
    const ok = await runAction(action, {
      id: editingAnniversaryId || undefined,
      title: anniversaryTitle.trim(),
      date: anniversaryDate,
      icon: anniversaryIcon,
      note: anniversaryNote.trim(),
      repeatsYearly: anniversaryRepeats,
    }, editingAnniversaryId ? "纪念日更新啦" : "纪念日种下啦");
    if (ok) resetAnniversaryForm();
  };

  const addAnniversaryToCalendar = async (anniversary: Anniversary) => {
    const occurrence = nextOccurrence(anniversary);
    try {
      const options = {
        title: `情侣小农场 · ${anniversary.title}`,
        startTime: Math.floor(occurrence.getTime() / 1000),
        allDay: true,
        description: anniversary.note || `${anniversary.title}纪念日`,
        alarm: true,
        alarmOffset: 24 * 60 * 60,
      };
      if (anniversary.repeatsYearly) {
        await Taro.addPhoneRepeatCalendar({ ...options, repeatInterval: "year" });
      } else {
        await Taro.addPhoneCalendar(options);
      }
      await Taro.showToast({ title: "已加入手机日历", icon: "none" });
    } catch (calendarError) {
      console.error("Unable to add anniversary to calendar", calendarError);
      await Taro.showToast({ title: "没有加入日历，请检查权限", icon: "none" });
    }
  };

  const confirmDeleteAnniversary = async (anniversary: Anniversary) => {
    const confirm = await Taro.showModal({ title: "删除这个纪念日？", content: anniversary.title, confirmColor: "#b32a50" });
    if (confirm.confirm) await runAction("delete-anniversary", { id: anniversary.id }, "纪念日删除啦");
  };

  const confirmDeleteRecord = async (record: RecordItem) => {
    const confirm = await Taro.showModal({ title: "删除这条记录？", content: formatDateTime(record.occurredAt), confirmColor: "#b32a50" });
    if (!confirm.confirm) return;
    await runAction(record.type === "weight" ? "delete-weight" : "delete-poop", { id: record.id }, "记录删除啦");
  };

  const beginEditRecord = (record: RecordItem) => {
    setRecordDate(dateValue(record.occurredAt));
    setRecordTime(timeValue(record.occurredAt));
    if (record.type === "weight") {
      setEditingWeightId(record.id);
      setEditingPoopId(null);
      setWeight(String(record.weightKg || ""));
    } else {
      setEditingPoopId(record.id);
      setEditingWeightId(null);
      setWeight("");
    }
    setActiveTab("farm");
  };

  const beginEditAnniversary = (anniversary: Anniversary) => {
    setAnniversaryTitle(anniversary.title);
    setAnniversaryDate(anniversary.date);
    setAnniversaryIcon(anniversary.icon);
    setAnniversaryNote(anniversary.note || "");
    setAnniversaryRepeats(anniversary.repeatsYearly);
    setEditingAnniversaryId(anniversary.id);
    setActiveTab("anniversaries");
  };

  const unbind = async () => {
    const confirm = await Taro.showModal({
      title: "解除绑定？",
      content: "历史记录会封存，双方会立即看不到。",
      confirmColor: "#b32a50",
    });
    if (confirm.confirm) await runAction("unbind", {}, "已解除绑定");
  };

  const clearMyRecords = async () => {
    const confirm = await Taro.showModal({
      title: "清空我的记录？",
      content: "会永久删除你的体重、如厕和互动记录，无法恢复。",
      confirmColor: "#b32a50",
    });
    if (confirm.confirm) await runAction("clear-my-records", {}, "本人记录已清空");
  };

  const deleteIdentity = async () => {
    const confirm = await Taro.showModal({
      title: "注销我的农场身份？",
      content: "会清空本人记录、解除伴侣绑定并删除当前微信身份数据，无法恢复。",
      confirmText: "确认注销",
      confirmColor: "#b32a50",
    });
    if (!confirm.confirm) return;
    const result = await runAction("delete-identity", {}, "身份已注销", false);
    if (result) {
      setData(null);
      await bootstrap();
    }
  };

  const weights = useMemo(() => data?.weights || [], [data?.weights]);
  const poops = useMemo(() => data?.poops || [], [data?.poops]);
  const reactions = useMemo(() => data?.reactions || [], [data?.reactions]);
  const anniversaries = useMemo(() => data?.anniversaries || [], [data?.anniversaries]);
  const people = useMemo(
    () => data?.partner ? [data.viewer, data.partner] : data ? [data.viewer] : [],
    [data],
  );
  const coupleDays = togetherDayCount(data?.couple?.togetherSince || null);

  const sortedAnniversaries = useMemo(() => [...anniversaries].sort((left, right) => {
    return nextOccurrence(left).getTime() - nextOccurrence(right).getTime();
  }), [anniversaries]);

  const recordItems = useMemo<RecordItem[]>(() => [
    ...weights.map((item) => ({ id: item.id, type: "weight" as const, ownerUid: item.ownerUid, occurredAt: item.recordedAt, weightKg: item.weightKg })),
    ...poops.map((item) => ({ id: item.id, type: "poop" as const, ownerUid: item.ownerUid, occurredAt: item.occurredAt })),
  ].sort((left, right) => right.occurredAt - left.occurredAt), [weights, poops]);

  const timeline = useMemo(() => recordItems.slice(0, 8), [recordItems]);

  const reminderCards = useMemo(() => {
    if (!data) return [] as Array<{ key: string; icon: string; title: string; detail: string; tab: TabKey }>;
    const cards: Array<{ key: string; icon: string; title: string; detail: string; tab: TabKey }> = [];
    const now = new Date();
    const currentTime = timeValue(now.getTime());
    const weekday = now.getDay();
    const viewer = data.viewer;
    const settings = cloneReminders(viewer.reminders);
    if (settings.weight.enabled && settings.weight.days.includes(weekday) && currentTime >= settings.weight.time && todayWeights(weights, viewer.uid) === 0) {
      cards.push({ key: "weight", icon: "⚖️", title: "今天还没称重", detail: `计划时间 ${settings.weight.time}`, tab: "farm" });
    }
    if (settings.poop.enabled && settings.poop.days.includes(weekday) && currentTime >= settings.poop.time && todayPoops(poops, viewer.uid) === 0) {
      cards.push({ key: "poop", icon: "🚽", title: "今天还没记如厕", detail: `计划时间 ${settings.poop.time}`, tab: "farm" });
    }
    if (settings.anniversary.enabled) {
      for (const anniversary of sortedAnniversaries) {
        const remaining = daysUntil(nextOccurrence(anniversary).getTime());
        if (settings.anniversary.advanceDays.includes(remaining)) {
          cards.push({
            key: `anniversary-${anniversary.id}`,
            icon: anniversary.icon,
            title: remaining === 0 ? `今天是${anniversary.title}` : `${anniversary.title}还有 ${remaining} 天`,
            detail: anniversary.note || "准备一点小惊喜吧",
            tab: "anniversaries",
          });
        }
      }
    }
    return cards;
  }, [data, poops, sortedAnniversaries, weights]);

  const nextMilestone = useMemo(() => {
    if (!coupleDays) return null;
    const milestones = [30, 100, 365, 520, 730, 1000, 1314, 1825, 2000, 3000];
    const day = milestones.find((item) => item >= coupleDays) || Math.ceil(coupleDays / 365) * 365;
    return { day, remaining: Math.max(0, day - coupleDays) };
  }, [coupleDays]);

  const weekPoopStats = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const timestamp = startOfToday() - (6 - index) * DAY;
    const key = dayKey(timestamp);
    return {
      key,
      label: `${new Date(timestamp).getMonth() + 1}/${new Date(timestamp).getDate()}`,
      values: people.map((person) => poops.filter((entry) => entry.ownerUid === person.uid && dayKey(entry.occurredAt) === key).length),
    };
  }), [people, poops]);

  useEffect(() => {
    if (activeTab !== "trends" || !data?.couple) return undefined;
    const timer = setTimeout(() => {
      const context = Taro.createCanvasContext("weightChart");
      const width = Math.max(280, Taro.getSystemInfoSync().windowWidth - 52);
      const height = 190;
      const padding = { left: 34, right: 12, top: 18, bottom: 28 };
      const since = Date.now() - trendRange * DAY;
      const visible = weights.filter((entry) => entry.recordedAt >= since);
      context.setFillStyle("#fffaf0");
      context.fillRect(0, 0, width, height);
      context.setStrokeStyle("#e6ddce");
      context.setLineWidth(1);
      for (let index = 0; index < 4; index += 1) {
        const y = padding.top + ((height - padding.top - padding.bottom) * index) / 3;
        context.beginPath();
        context.moveTo(padding.left, y);
        context.lineTo(width - padding.right, y);
        context.stroke();
      }
      if (!visible.length) {
        context.setFillStyle("#746d83");
        context.setFontSize(13);
        context.fillText("这个区间还没有体重记录", 64, 98);
        context.draw();
        return;
      }
      const values = visible.map((entry) => entry.weightKg);
      const minimum = Math.min(...values) - 1;
      const maximum = Math.max(...values) + 1;
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;
      for (const person of people) {
        const entries = visible.filter((entry) => entry.ownerUid === person.uid).sort((left, right) => left.recordedAt - right.recordedAt);
        if (!entries.length) continue;
        context.setStrokeStyle(person.color);
        context.setFillStyle(person.color);
        context.setLineWidth(3);
        context.beginPath();
        entries.forEach((entry, index) => {
          const x = padding.left + ((entry.recordedAt - since) / (trendRange * DAY)) * plotWidth;
          const y = padding.top + (1 - (entry.weightKg - minimum) / Math.max(1, maximum - minimum)) * plotHeight;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
        entries.forEach((entry) => {
          const x = padding.left + ((entry.recordedAt - since) / (trendRange * DAY)) * plotWidth;
          const y = padding.top + (1 - (entry.weightKg - minimum) / Math.max(1, maximum - minimum)) * plotHeight;
          context.beginPath();
          context.arc(x, y, 3.5, 0, Math.PI * 2);
          context.fill();
        });
      }
      context.setFillStyle("#746d83");
      context.setFontSize(10);
      context.fillText(`${maximum.toFixed(1)}kg`, 2, padding.top + 3);
      context.fillText(`${minimum.toFixed(1)}kg`, 2, height - padding.bottom);
      context.fillText(`${trendRange}天前`, padding.left, height - 7);
      context.fillText("今天", width - 34, height - 7);
      context.draw();
    }, 120);
    return () => clearTimeout(timer);
  }, [activeTab, data?.couple, people, trendRange, weights]);

  if (loading) return <Loading />;
  if (error && !data) return <Loading error={error} retry={() => bootstrap()} />;
  if (!data) return <Loading error="没有拿到农场数据。" retry={() => bootstrap()} />;

  if (!data.viewer.profileComplete) {
    return (
      <View className="full-page">
        <View className="message-card profile-card">
          <Text className="kicker">第一次见面</Text>
          <Text className="title">你想在农场里叫什么？</Text>
          <Input className="field" value={profileNickname} onInput={(event) => setProfileNickname(event.detail.value)} maxlength={12} placeholder="例如 鸡包蛋" />
          <View className="avatar-grid">{avatars.map((choice) => <Button key={choice} className={profileAvatar === choice ? "avatar active" : "avatar"} onClick={() => setProfileAvatar(choice)}>{choice}</Button>)}</View>
          <View className="color-grid">{colors.map((choice) => <Button key={choice} className={profileColor === choice ? "color-dot active" : "color-dot"} style={{ background: choice }} onClick={() => setProfileColor(choice)} />)}</View>
          {error && <Text className="error">{error}</Text>}
          <Button className="primary" loading={busy} onClick={saveProfile}>保存并继续</Button>
        </View>
      </View>
    );
  }

  if (!data.couple || !data.partner) {
    return (
      <View className="page pairing-page">
        <View className="pair-header"><Text className="profile-badge" style={{ background: data.viewer.color }}>{data.viewer.avatar}</Text><View><Text className="kicker">欢迎，{data.viewer.nickname}</Text><Text className="title">把两块田连在一起</Text></View></View>
        <Text className="description">一个人生成配对码，另一个人在自己的微信里输入。配对码 24 小时有效，只能使用一次。</Text>
        <View className="panel">
          <Text className="step">方法 A</Text><Text className="subtitle">邀请我的伴侣</Text><Text className="description small">生成后会自动复制，私下发给对方。</Text>
          {createdInvite ? <Button className="invite-code" onClick={() => Taro.setClipboardData({ data: createdInvite })}>{createdInvite}</Button> : <Button className="primary" loading={busy} onClick={createInvite}>生成配对码</Button>}
        </View>
        <View className="panel">
          <Text className="step">方法 B</Text><Text className="subtitle">输入伴侣的配对码</Text>
          <Input className="field code-input" value={inviteCode} onInput={(event) => setInviteCode(event.detail.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} maxlength={8} placeholder="8 位配对码" />
          <Button className="secondary" loading={busy} onClick={acceptInvite}>确认绑定</Button>
        </View>
        {error && <Text className="error">{error}</Text>}
      </View>
    );
  }

  const viewer = data.viewer;
  const partner = data.partner;
  const myWeightDone = todayWeights(weights, viewer.uid) > 0;
  const myPoopDone = todayPoops(poops, viewer.uid) > 0;
  const farmProgress = (Number(myWeightDone) + Number(myPoopDone)) * 50;

  return (
    <View className="app-shell">
      <ScrollView className="page-scroll" scrollY enhanced showScrollbar={false}>
        <View className="page dashboard-page">
          {error && <View className="error-banner"><Text>{error}</Text><Button onClick={() => setError(null)}>×</Button></View>}

          {activeTab === "farm" && <>
            <View className="farm-hero">
              <View><Text className="kicker">情侣小农场 · 0.2.0</Text><Text className="farm-title">{data.couple.farmName}</Text></View>
              <View className="day-counter"><Text className="counter-value">{coupleDays || "--"}</Text><Text className="counter-label">在一起天数</Text></View>
              <View className="farm-ground"><Text>🌳</Text><Text>🏡</Text><Text>🐥</Text><Text>🐥</Text><Text>🌷</Text></View>
            </View>

            {!data.couple.togetherSince && <View className="setup-banner" onClick={() => setActiveTab("us")}><Text>💞 设置你们在一起的日期，开始计算纪念天数</Text><Text>去设置 ›</Text></View>}

            {reminderCards.length > 0 && <View className="reminder-stack">{reminderCards.map((card) => <View className="reminder-card" key={card.key} onClick={() => setActiveTab(card.tab)}><Text className="reminder-icon">{card.icon}</Text><View><Text className="activity-title">{card.title}</Text><Text className="role">{card.detail}</Text></View><Text className="chevron">›</Text></View>)}</View>}

            <View className="milestone-grid">
              <View className="milestone-card"><Text className="milestone-icon">💗</Text><Text className="metric-value">{nextMilestone ? `${nextMilestone.remaining}天` : "待设置"}</Text><Text className="role">{nextMilestone ? `距离第 ${nextMilestone.day} 天` : "设置相恋日期"}</Text></View>
              <View className="milestone-card"><Text className="milestone-icon">📅</Text><Text className="metric-value">{sortedAnniversaries[0] ? `${daysUntil(nextOccurrence(sortedAnniversaries[0]).getTime())}天` : "待添加"}</Text><Text className="role">{sortedAnniversaries[0]?.title || "添加纪念日"}</Text></View>
            </View>

            <View className="people-grid">{people.map((person) => { const latest = latestWeight(weights, person.uid); return <View key={person.uid} className="person-card" style={{ borderColor: person.color }}><View className="person-head"><Text className="profile-badge small" style={{ background: person.color }}>{person.avatar}</Text><View><Text className="role">{person.uid === viewer.uid ? "我的田" : "伴侣的田"}</Text><Text className="subtitle compact-title">{person.nickname}</Text></View></View><View className="metrics"><View><Text className="metric-value">{latest ? latest.weightKg.toFixed(1) : "--"}</Text><Text>kg</Text></View><View><Text className="metric-value">{todayPoops(poops, person.uid)}</Text><Text>今日如厕</Text></View></View></View>; })}</View>

            <View className="panel progress-panel"><View className="section-heading"><View><Text className="kicker">今日农活</Text><Text className="subtitle">完成记录，让农场长大</Text></View><Text className="progress-number">{farmProgress}%</Text></View><View className="progress-track"><View className="progress-fill" style={{ width: `${farmProgress}%` }} /></View><View className="task-row"><Text className={myWeightDone ? "task done" : "task"}>⚖️ {myWeightDone ? "已称重" : "待称重"}</Text><Text className={myPoopDone ? "task done" : "task"}>🚽 {myPoopDone ? "已记录" : "待记录"}</Text></View></View>

            <View className="panel action-panel"><Text className="kicker">快速记录</Text><Text className="subtitle">{editingWeightId || editingPoopId ? "正在修改一条记录" : "我的今天"}</Text><View className="date-row"><Picker mode="date" value={recordDate} onChange={(event) => setRecordDate(String(event.detail.value))}><View className="picker-field">📅 {recordDate}</View></Picker><Picker mode="time" value={recordTime} onChange={(event) => setRecordTime(String(event.detail.value))}><View className="picker-field">🕐 {recordTime}</View></Picker></View><View className="weight-row"><Input className="field" type="digit" value={weight} onInput={(event) => setWeight(event.detail.value)} placeholder="体重 kg，例如 68.4" /><Button className="primary compact" loading={busy} onClick={saveWeight}>{editingWeightId ? "保存" : "记体重"}</Button></View><Button className="secondary full" loading={busy} onClick={savePoop}>{editingPoopId ? "保存如厕时间" : "🚽 记一次如厕"}</Button>{(editingWeightId || editingPoopId) && <Button className="text-button" onClick={resetRecordForm}>取消修改</Button>}</View>

            <View className="panel"><Text className="kicker">给点动静</Text><Text className="subtitle">回应 {partner.nickname}</Text><View className="reaction-row"><Button disabled={busy} onClick={() => runAction("react", { kind: "like" }, "小红心送到啦")}>💗<Text>给个赞</Text></Button><Button disabled={busy} onClick={() => runAction("react", { kind: "tease" }, "小喇叭送到啦")}>📣<Text>轻轻催促</Text></Button></View>{reactions[0] && <View className="note"><Text>“{reactions[0].message}”</Text><Text className="role">{formatDateTime(reactions[0].createdAt)}</Text></View>}</View>

            <View className="panel"><Text className="kicker">共同动态</Text><Text className="subtitle">最近发生的小事</Text>{timeline.length ? <View className="timeline">{timeline.map((item) => { const owner = people.find((person) => person.uid === item.ownerUid) || viewer; return <View className="activity" key={`${item.type}-${item.id}`}><Text className="profile-badge tiny" style={{ background: owner.color }}>{owner.avatar}</Text><View><Text className="activity-title">{owner.nickname} · {item.type === "weight" ? `记录体重 ${item.weightKg?.toFixed(1)} kg` : "记录了一次如厕"}</Text><Text className="role">{formatDateTime(item.occurredAt)}</Text></View></View>; })}</View> : <View className="empty">🪴 还没有记录，种下第一件小事吧。</View>}</View>
          </>}

          {activeTab === "trends" && <>
            <View className="page-heading"><Text className="kicker">共同趋势</Text><Text className="title">认真生活，也看得见变化</Text><Text className="description">曲线只展示你们两个人共享农场里的记录。</Text></View>
            <View className="panel chart-panel"><View className="section-heading"><View><Text className="subtitle">体重曲线</Text><View className="legend-row">{people.map((person) => <Text key={person.uid}><Text className="legend-dot" style={{ background: person.color }} />{person.nickname}</Text>)}</View></View><View className="range-tabs">{([7, 30, 90] as const).map((range) => <Button key={range} className={trendRange === range ? "active" : ""} onClick={() => setTrendRange(range)}>{range}天</Button>)}</View></View><Canvas canvasId="weightChart" id="weightChart" className="weight-chart" /></View>

            <View className="people-grid">{people.map((person) => { const own = weights.filter((entry) => entry.ownerUid === person.uid && entry.recordedAt >= Date.now() - trendRange * DAY).sort((left, right) => left.recordedAt - right.recordedAt); const change = own.length > 1 ? own[own.length - 1].weightKg - own[0].weightKg : null; return <View className="stat-card" key={person.uid} style={{ borderColor: person.color }}><Text className="role">{person.nickname} · {trendRange} 天</Text><Text className="stat-large">{change === null ? "--" : `${change > 0 ? "+" : ""}${change.toFixed(1)}`}<Text> kg</Text></Text><Text className="role">区间体重变化</Text></View>; })}</View>

            <View className="panel"><Text className="kicker">最近 7 天</Text><Text className="subtitle">如厕记录小日历</Text><View className="poop-chart">{weekPoopStats.map((day) => <View className="poop-day" key={day.key}><View className="poop-bars">{day.values.map((count, index) => <View key={`${day.key}-${people[index]?.uid}`} className="poop-bar" style={{ height: `${Math.max(8, count * 22)}rpx`, background: people[index]?.color }} />)}</View><Text className="role">{day.label}</Text></View>)}</View></View>

            <View className="panel"><Text className="kicker">记录管理</Text><Text className="subtitle">最近的记录</Text>{recordItems.length ? <View className="record-list">{recordItems.slice(0, 24).map((record) => { const owner = people.find((person) => person.uid === record.ownerUid) || viewer; const mine = record.ownerUid === viewer.uid; return <View className="record-row" key={`${record.type}-${record.id}`}><Text className="record-icon">{record.type === "weight" ? "⚖️" : "🚽"}</Text><View className="record-copy"><Text className="activity-title">{owner.nickname} · {record.type === "weight" ? `${record.weightKg?.toFixed(1)} kg` : "一次如厕"}</Text><Text className="role">{formatDateTime(record.occurredAt)}</Text></View>{mine && <View className="record-actions"><Button onClick={() => beginEditRecord(record)}>编辑</Button><Button className="danger-mini" onClick={() => confirmDeleteRecord(record)}>删除</Button></View>}</View>; })}</View> : <View className="empty">还没有记录。</View>}</View>
          </>}

          {activeTab === "anniversaries" && <>
            <View className="page-heading"><Text className="kicker">我们的故事</Text><Text className="title">把重要的日子种进农场</Text><Text className="description">可以写入手机系统日历，即使不打开小程序也能收到提醒。</Text></View>

            {data.couple.togetherSince && <View className="love-days-card"><Text className="love-icon">💞</Text><View><Text className="kicker">从 {formatDateLabel(data.couple.togetherSince)} 开始</Text><Text className="love-days">在一起第 {coupleDays} 天</Text><Text className="description small">{nextMilestone ? `距离第 ${nextMilestone.day} 天还有 ${nextMilestone.remaining} 天` : "每一天都值得纪念"}</Text></View></View>}

            <View className="panel anniversary-form"><Text className="kicker">{editingAnniversaryId ? "修改纪念日" : "新增纪念日"}</Text><Text className="subtitle">下一颗回忆种子</Text><Input className="field" value={anniversaryTitle} onInput={(event) => setAnniversaryTitle(event.detail.value)} maxlength={16} placeholder="例如 第一次约会" /><View className="anniversary-meta"><Picker mode="date" value={anniversaryDate} onChange={(event) => setAnniversaryDate(String(event.detail.value))}><View className="picker-field">📅 {anniversaryDate}</View></Picker><View className="repeat-switch"><Text>每年重复</Text><Switch checked={anniversaryRepeats} color="#7457ff" onChange={(event) => setAnniversaryRepeats(event.detail.value)} /></View></View><View className="icon-grid">{anniversaryIcons.map((icon) => <Button key={icon} className={anniversaryIcon === icon ? "icon-choice active" : "icon-choice"} onClick={() => setAnniversaryIcon(icon)}>{icon}</Button>)}</View><Textarea className="textarea" value={anniversaryNote} onInput={(event) => setAnniversaryNote(event.detail.value)} maxlength={40} placeholder="留一句悄悄话（选填）" /><Button className="primary" loading={busy} onClick={saveAnniversary}>{editingAnniversaryId ? "保存修改" : "种下纪念日"}</Button>{editingAnniversaryId && <Button className="text-button" onClick={resetAnniversaryForm}>取消修改</Button>}</View>

            <View className="anniversary-list">{sortedAnniversaries.map((anniversary) => { const occurrence = nextOccurrence(anniversary); const remaining = daysUntil(occurrence.getTime()); return <View className="anniversary-card" key={anniversary.id}><Text className="anniversary-badge">{anniversary.icon}</Text><View className="anniversary-copy"><Text className="subtitle compact-title">{anniversary.title}</Text><Text className="role">{formatDateLabel(anniversary.date)} · {anniversary.repeatsYearly ? "每年" : "仅一次"}</Text>{anniversary.note && <Text className="anniversary-note">{anniversary.note}</Text>}</View><View className="countdown"><Text>{remaining === 0 ? "今天" : remaining > 0 ? remaining : "已过"}</Text><Text className="role">{remaining > 0 ? "天" : ""}</Text></View><View className="anniversary-actions"><Button onClick={() => addAnniversaryToCalendar(anniversary)}>加到日历</Button><Button onClick={() => beginEditAnniversary(anniversary)}>编辑</Button><Button className="danger-mini" onClick={() => confirmDeleteAnniversary(anniversary)}>删除</Button></View></View>; })}{!sortedAnniversaries.length && <View className="panel empty">🌱 还没有纪念日，种下第一颗回忆种子吧。</View>}</View>
          </>}

          {activeTab === "us" && <>
            <View className="page-heading"><Text className="kicker">我们与设置</Text><Text className="title">把小农场变成你们的样子</Text></View>

            <View className="panel"><Text className="kicker">我的资料</Text><Text className="subtitle">昵称、头像和代表色</Text><Input className="field" value={profileNickname} onInput={(event) => setProfileNickname(event.detail.value)} maxlength={12} placeholder="我的昵称" /><View className="avatar-grid settings-grid">{avatars.map((choice) => <Button key={choice} className={profileAvatar === choice ? "avatar active" : "avatar"} onClick={() => setProfileAvatar(choice)}>{choice}</Button>)}</View><View className="color-grid">{colors.map((choice) => <Button key={choice} className={profileColor === choice ? "color-dot active" : "color-dot"} style={{ background: choice }} onClick={() => setProfileColor(choice)} />)}</View><Button className="primary" loading={busy} onClick={saveProfile}>保存我的资料</Button></View>

            <View className="panel"><Text className="kicker">共同农场</Text><Text className="subtitle">农场名称和相恋日期</Text><Input className="field" value={farmName} onInput={(event) => setFarmName(event.detail.value)} maxlength={16} placeholder="给农场取个名字" /><Picker mode="date" value={togetherSince || dateValue()} end={dateValue()} onChange={(event) => setTogetherSince(String(event.detail.value))}><View className="picker-field settings-picker">💞 {togetherSince || "选择在一起的日期"}</View></Picker><Button className="primary" loading={busy} onClick={saveFarmSettings}>保存共同农场</Button></View>

            <View className="panel"><Text className="kicker">每日提醒</Text><Text className="subtitle">别让秤和小马桶等困了</Text><View className="setting-row"><View><Text className="activity-title">⚖️ 称重提醒</Text><Text className="role">打开小程序时检查今日记录</Text></View><Switch checked={reminders.weight.enabled} color="#7457ff" onChange={(event) => setReminders((current) => ({ ...current, weight: { ...current.weight, enabled: event.detail.value } }))} /></View><Picker mode="time" value={reminders.weight.time} onChange={(event) => setReminders((current) => ({ ...current, weight: { ...current.weight, time: String(event.detail.value) } }))}><View className="reminder-time">每天 {reminders.weight.time}<Text>修改时间 ›</Text></View></Picker><Button className="calendar-button" onClick={() => addDailyCalendarReminder("weight")}>📅 写入手机日历，每天提醒</Button><View className="setting-divider" /><View className="setting-row"><View><Text className="activity-title">🚽 如厕记录提醒</Text><Text className="role">到点且今天未记录时提示</Text></View><Switch checked={reminders.poop.enabled} color="#7457ff" onChange={(event) => setReminders((current) => ({ ...current, poop: { ...current.poop, enabled: event.detail.value } }))} /></View><Picker mode="time" value={reminders.poop.time} onChange={(event) => setReminders((current) => ({ ...current, poop: { ...current.poop, time: String(event.detail.value) } }))}><View className="reminder-time">每天 {reminders.poop.time}<Text>修改时间 ›</Text></View></Picker><Button className="calendar-button" onClick={() => addDailyCalendarReminder("poop")}>📅 写入手机日历，每天提醒</Button><View className="setting-divider" /><View className="setting-row"><View><Text className="activity-title">💞 纪念日提醒</Text><Text className="role">提前 7 天、1 天和当天提示</Text></View><Switch checked={reminders.anniversary.enabled} color="#7457ff" onChange={(event) => setReminders((current) => ({ ...current, anniversary: { ...current.anniversary, enabled: event.detail.value } }))} /></View><Button className="primary" loading={busy} onClick={saveReminderSettings}>保存小程序内提醒</Button><Text className="fine-print">手机日历提醒由系统日历管理；重复点击可能生成重复日程。</Text></View>

            <View className="panel privacy-panel"><Text className="kicker">隐私与数据</Text><Text className="subtitle">你的记录由你管理</Text><Text className="description small">体重、如厕、配对和互动数据只用于情侣小农场功能，并只向当前绑定伴侣展示。</Text><Button className="outline-danger" onClick={clearMyRecords}>清空我的记录</Button><Button className="outline-danger" onClick={unbind}>解除伴侣绑定</Button><Button className="danger-solid" onClick={deleteIdentity}>注销我的农场身份</Button></View>
          </>}
        </View>
      </ScrollView>

      <View className="tab-bar">
        {([
          ["farm", "🏡", "农场"],
          ["trends", "📈", "趋势"],
          ["anniversaries", "💞", "纪念日"],
          ["us", "⚙️", "我们"],
        ] as const).map(([key, icon, label]) => <Button key={key} className={activeTab === key ? "tab-item active" : "tab-item"} onClick={() => setActiveTab(key)}><Text>{icon}</Text><Text>{label}</Text></Button>)}
      </View>
    </View>
  );
}
