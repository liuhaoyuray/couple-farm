import { Button, Input, Picker, Switch, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cloudCall } from "../../cloud";

type Person = { uid: string; nickname: string };
type MemoKind = "memo" | "task" | "event";
type MemoCategory = "daily" | "date" | "home" | "shopping" | "important" | "other";
type Recurrence = "none" | "daily" | "weekly" | "monthly";

type SharedMemo = {
  id: string;
  kind: MemoKind;
  title: string;
  note: string;
  category: MemoCategory;
  dueAt: number | null;
  assignee: "both" | string;
  recurrence: Recurrence;
  reminderEnabled: boolean;
  remindAt: number | null;
  completedByUids: string[];
  completed: boolean;
  status: "open" | "completed" | "archived";
  createdBy: string;
  updatedAt: number;
};

type NotebookData = {
  items: SharedMemo[];
  notification: {
    availableQuota: number;
    configured: boolean;
    templateId: string | null;
  };
  serverTime: number;
};

const kinds: Array<{ key: MemoKind; icon: string; label: string }> = [
  { key: "memo", icon: "📝", label: "备忘" },
  { key: "task", icon: "✅", label: "待办" },
  { key: "event", icon: "📅", label: "事件" },
];
const categories: Array<{ key: MemoCategory; label: string }> = [
  { key: "daily", label: "日常" },
  { key: "date", label: "约会" },
  { key: "home", label: "家务" },
  { key: "shopping", label: "采购" },
  { key: "important", label: "重要" },
  { key: "other", label: "其他" },
];
const recurrences: Array<{ key: Recurrence; label: string }> = [
  { key: "none", label: "不重复" },
  { key: "daily", label: "每天" },
  { key: "weekly", label: "每周" },
  { key: "monthly", label: "每月" },
];

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

function formatDue(timestamp: number | null) {
  if (!timestamp) return "不设时间";
  const date = new Date(timestamp);
  const today = dateValue();
  const day = dateValue(timestamp);
  const prefix = day === today ? "今天" : `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${prefix} ${timeValue(timestamp)}`;
}

function kindMeta(kind: MemoKind) {
  return kinds.find((item) => item.key === kind) || kinds[0];
}

export default function NotebookPanel({ viewer, partner, onChanged }: {
  viewer: Person;
  partner: Person;
  onChanged: () => void;
}) {
  const [data, setData] = useState<NotebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "done">("open");
  const [kind, setKind] = useState<MemoKind>("task");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<MemoCategory>("daily");
  const [assignee, setAssignee] = useState("both");
  const [hasDueAt, setHasDueAt] = useState(true);
  const [dueDate, setDueDate] = useState(() => dateValue(Date.now() + 60 * 60 * 1000));
  const [dueTime, setDueTime] = useState(() => timeValue(Date.now() + 60 * 60 * 1000));
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [reminderEnabled, setReminderEnabled] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    const result = await cloudCall("shared-notebook");
    if (result.status !== 200) {
      setError(String(result.data.error || "共同小本本暂时没有打开。"));
      setLoading(false);
      return;
    }
    setData(result.data as unknown as NotebookData);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const act = async (action: string, payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    const result = await cloudCall(action, payload);
    setBusy(false);
    if (result.status < 200 || result.status >= 300) {
      const message = String(result.data.error || "这次操作没有完成。" );
      await Taro.showToast({ title: message, icon: "none", duration: 2800 });
      return false;
    }
    await Taro.showToast({ title: success, icon: "none" });
    await load(true);
    onChanged();
    return true;
  };

  const resetForm = () => {
    setKind("task");
    setTitle("");
    setNote("");
    setCategory("daily");
    setAssignee("both");
    setHasDueAt(true);
    setDueDate(dateValue(Date.now() + 60 * 60 * 1000));
    setDueTime(timeValue(Date.now() + 60 * 60 * 1000));
    setRecurrence("none");
    setReminderEnabled(false);
  };

  const requestWechatReminder = async () => {
    const templateId = data?.notification.templateId;
    if (!templateId) {
      await Taro.showModal({
        title: "微信提醒正在接入",
        content: "需要先在微信公众平台选定订阅消息模板。当前可先使用手机日历提醒，模板配置后这里会自动开放。",
        showCancel: false,
      });
      return false;
    }
    try {
      // Taro 4.2 currently exposes the mini-program runtime API with an
      // incompatible type signature. The emitted WeChat call still requires
      // `tmplIds`, so keep the runtime payload and narrow only at this boundary.
      const result = await Taro.requestSubscribeMessage({ tmplIds: [templateId] } as never);
      const choice = String((result as unknown as Record<string, unknown>)[templateId] || "reject");
      if (choice !== "accept" && choice !== "acceptWithAudio") {
        await Taro.showToast({ title: "这次没有开启微信提醒", icon: "none" });
        return false;
      }
      const saved = await cloudCall("save-subscription-consent", {
        templateKey: "shared_memo",
        templateId,
        result: choice,
      });
      if (saved.status !== 201) throw new Error(String(saved.data.error || "授权没有保存"));
      await load(true);
      await Taro.showToast({ title: "已获得 1 次微信提醒", icon: "none" });
      return true;
    } catch (subscriptionError) {
      console.error("Subscription request failed", subscriptionError);
      await Taro.showToast({ title: "微信提醒没有开启", icon: "none" });
      return false;
    }
  };

  const create = async () => {
    if (!title.trim()) return Taro.showToast({ title: "先写下这件事吧", icon: "none" });
    let reminderAllowed = Boolean(
      hasDueAt
      && reminderEnabled
      && data?.notification.configured
      && data.notification.availableQuota > 0,
    );
    // WeChat only allows the subscription sheet directly from a user's tap.
    // Request it before the first network call made by this handler.
    if (hasDueAt && reminderEnabled && !reminderAllowed) {
      reminderAllowed = await requestWechatReminder();
    }
    const dueAt = hasDueAt ? timestampFrom(dueDate, dueTime) : null;
    const ok = await act("create-shared-memo", {
      kind,
      title: title.trim(),
      note: note.trim(),
      category,
      assignee,
      dueAt,
      recurrence: hasDueAt ? recurrence : "none",
      reminderEnabled: reminderAllowed,
      remindAt: reminderAllowed ? Math.max(Date.now(), Number(dueAt) - 60 * 60 * 1000) : null,
    }, "已经放进共同小本本");
    if (!ok) return;
    resetForm();
  };

  const remove = async (item: SharedMemo) => {
    const confirmed = await Taro.showModal({
      title: "删除这条事项？",
      content: item.title,
      confirmColor: "#b32a50",
    });
    if (confirmed.confirm) await act("delete-shared-memo", { id: item.id }, "已经删除");
  };

  const addToCalendar = async (item: SharedMemo) => {
    if (!item.dueAt) return;
    try {
      await Taro.addPhoneCalendar({
        title: `我们俩的小田地 · ${item.title}`,
        startTime: Math.floor(item.dueAt / 1000),
        description: item.note || "共同小本本事项",
        alarm: item.reminderEnabled,
        alarmOffset: item.reminderEnabled ? 60 * 60 : 0,
      });
      await Taro.showToast({ title: "已加入手机日历", icon: "none" });
    } catch (calendarError) {
      console.error("Shared memo calendar export failed", calendarError);
      await Taro.showToast({ title: "没有加入日历，请检查权限", icon: "none" });
    }
  };

  const assigneeOptions = useMemo(() => [
    { value: "both", label: "我们两个人" },
    { value: viewer.uid, label: viewer.nickname },
    { value: partner.uid, label: partner.nickname },
  ], [partner.nickname, partner.uid, viewer.nickname, viewer.uid]);

  const visibleItems = useMemo(() => (data?.items || []).filter((item) => (
    filter === "done" ? item.status === "completed" : item.status === "open"
  )), [data?.items, filter]);

  if (loading && !data) return <View className="notebook-loading">📒 正在翻开共同小本本…</View>;
  if (error && !data) return <View className="panel notebook-error"><Text className="subtitle">小本本暂时没有打开</Text><Text className="description">{error}</Text><Button className="primary" onClick={() => load()}>重新连接</Button></View>;

  return (
    <>
      <View className="page-heading notebook-heading">
        <Text className="kicker">我们俩的小田地 · 0.5.0</Text>
        <Text className="title">共同小本本</Text>
        <Text className="description">把约会、采购、家务和那些“别忘啦”放在同一个地方。</Text>
      </View>

      <View className="panel memo-form">
        <Text className="kicker">新记一件事</Text>
        <View className="memo-kind-row">{kinds.map((item) => <Button key={item.key} className={kind === item.key ? "active" : ""} onClick={() => { setKind(item.key); if (item.key === "memo") setHasDueAt(false); }}>{item.icon} {item.label}</Button>)}</View>
        <Input className="field" maxlength={30} value={title} onInput={(event) => setTitle(event.detail.value)} placeholder="例如：周六去看新电影" />
        <Textarea className="textarea" maxlength={200} value={note} onInput={(event) => setNote(event.detail.value)} placeholder="补充地点、清单或想对 TA 说的话（选填）" />
        <View className="memo-category-row">{categories.map((item) => <Button key={item.key} className={category === item.key ? "active" : ""} onClick={() => setCategory(item.key)}>{item.label}</Button>)}</View>
        <Picker mode="selector" range={assigneeOptions.map((item) => item.label)} value={Math.max(0, assigneeOptions.findIndex((item) => item.value === assignee))} onChange={(event) => setAssignee(assigneeOptions[Number(event.detail.value)]?.value || "both")}><View className="picker-field settings-picker">👫 交给：{assigneeOptions.find((item) => item.value === assignee)?.label}<Text>修改 ›</Text></View></Picker>
        <View className="setting-row memo-time-switch"><View><Text className="activity-title">设置日期时间</Text><Text className="role">事件、约会和有截止时间的待办</Text></View><Switch checked={hasDueAt} color="#7457ff" onChange={(event) => { setHasDueAt(event.detail.value); if (!event.detail.value) { setRecurrence("none"); setReminderEnabled(false); } }} /></View>
        {hasDueAt && <><View className="date-row"><Picker mode="date" value={dueDate} onChange={(event) => setDueDate(String(event.detail.value))}><View className="picker-field">📅 {dueDate}</View></Picker><Picker mode="time" value={dueTime} onChange={(event) => setDueTime(String(event.detail.value))}><View className="picker-field">🕐 {dueTime}</View></Picker></View><Picker mode="selector" range={recurrences.map((item) => item.label)} value={recurrences.findIndex((item) => item.key === recurrence)} onChange={(event) => setRecurrence(recurrences[Number(event.detail.value)]?.key || "none")}><View className="picker-field settings-picker">🔁 {recurrences.find((item) => item.key === recurrence)?.label}<Text>修改 ›</Text></View></Picker><View className="setting-row"><View><Text className="activity-title">微信提醒</Text><Text className="role">事项前 1 小时提醒；每次需用户授权</Text></View><Switch checked={reminderEnabled} color="#7457ff" onChange={(event) => setReminderEnabled(event.detail.value)} /></View></>}
        <Button className="primary" loading={busy} onClick={create}>放进共同小本本</Button>
      </View>

      <View className="panel subscription-card">
        <View><Text className="kicker">微信订阅提醒</Text><Text className="subtitle">当前可用 {data?.notification.availableQuota || 0} 次</Text><Text className="description small">微信不允许普通小程序静默永久推送；每次点击授权可获得一次发送额度，手机日历可作为长期提醒。</Text></View>
        <Button className="secondary" onClick={requestWechatReminder}>{data?.notification.configured ? "再授权 1 次" : "查看接入状态"}</Button>
      </View>

      <View className="memo-list-tabs"><Button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>进行中</Button><Button className={filter === "done" ? "active" : ""} onClick={() => setFilter("done")}>已完成</Button></View>
      <View className="memo-list">
        {visibleItems.map((item) => {
          const meta = kindMeta(item.kind);
          const assignedToMe = item.assignee === "both" || item.assignee === viewer.uid;
          const mineDone = item.completedByUids.includes(viewer.uid);
          const waitingPartner = item.assignee === "both" && mineDone && !item.completed;
          return <View className={`memo-card ${item.status}`} key={item.id}><View className="memo-icon">{meta.icon}</View><View className="memo-copy"><View className="memo-title-row"><Text className="activity-title">{item.title}</Text><Text className={`memo-category ${item.category}`}>{categories.find((categoryItem) => categoryItem.key === item.category)?.label}</Text></View>{item.note && <Text className="memo-note">{item.note}</Text>}<Text className="role">{formatDue(item.dueAt)} · {item.assignee === "both" ? "两个人" : item.assignee === viewer.uid ? "交给我" : `交给${partner.nickname}`}{item.recurrence !== "none" ? ` · ${recurrences.find((rule) => rule.key === item.recurrence)?.label}` : ""}</Text>{waitingPartner && <Text className="memo-waiting">✓ 我已完成，等 {partner.nickname}</Text>}<View className="memo-actions">{item.dueAt && <Button onClick={() => addToCalendar(item)}>加日历</Button>}{item.status === "open" && assignedToMe && <Button className={mineDone ? "done" : "primary-mini"} loading={busy} onClick={() => act("toggle-shared-memo", { id: item.id }, mineDone ? "已撤销完成" : "完成一小步")}>{mineDone ? "撤销" : "完成"}</Button>}{item.createdBy === viewer.uid && <Button className="danger-mini" onClick={() => remove(item)}>删除</Button>}</View></View></View>;
        })}
        {!visibleItems.length && <View className="panel empty">{filter === "open" ? "🌱 暂时没有待办，记下一件想一起完成的事吧。" : "完成的事情会在这里留下脚印。"}</View>}
      </View>
    </>
  );
}
