import { Button, Input, Picker, ScrollView, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useCallback, useMemo, useState } from "react";
import "./index.scss";

type UserProfile = {
  uid: string;
  nickname: string;
  avatar: string;
  color: string;
  profileComplete: boolean;
  coupleId: string | null;
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

type FarmData = {
  viewer: UserProfile;
  partner: UserProfile | null;
  couple: { id: string; createdAt: number } | null;
  weights?: WeightEntry[];
  poops?: PoopEntry[];
  reactions?: Reaction[];
  serverTime: number;
};

type CloudResult = {
  status: number;
  data: Record<string, unknown>;
};

const avatars = ["🐣", "🐰", "🐻", "🐼", "🐱", "🐶", "🦊", "🐸"];

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

function dayKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDateTime(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${timeValue(timestamp)}`;
}

function latestWeight(entries: WeightEntry[], uid: string) {
  return [...entries].filter((item) => item.ownerUid === uid).sort((a, b) => b.recordedAt - a.recordedAt)[0];
}

function todayPoops(entries: PoopEntry[], uid: string) {
  const today = dayKey(Date.now());
  return entries.filter((item) => item.ownerUid === uid && dayKey(item.occurredAt) === today).length;
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
    return { status: 503, data: { error: "没有连上共同农场，请稍后重试。" } };
  }
}

function Loading({ error, retry }: { error?: string | null; retry?: () => void }) {
  return (
    <View className="full-page">
      <View className="message-card">
        <Text className="heart">♥</Text>
        <Text className="kicker">我们俩的小日常</Text>
        <Text className="title">{error ? "小农场打了个盹" : "正在打开共同农场"}</Text>
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
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("🐣");
  const [createdInvite, setCreatedInvite] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [weight, setWeight] = useState("");
  const [recordDate, setRecordDate] = useState(() => dateValue());
  const [recordTime, setRecordTime] = useState(() => timeValue());

  const bootstrap = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    const result = await cloudCall("bootstrap");
    if (result.status !== 200) {
      setError(typeof result.data.error === "string" ? result.data.error : "云端连接失败。");
      setLoading(false);
      return;
    }
    setData(result.data as unknown as FarmData);
    setLoading(false);
  }, []);

  useDidShow(() => {
    void bootstrap(Boolean(data));
  });

  usePullDownRefresh(() => {
    void bootstrap(true).finally(() => Taro.stopPullDownRefresh());
  });

  const runAction = async (action: string, payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    setError(null);
    const result = await cloudCall(action, payload);
    setBusy(false);
    if (result.status < 200 || result.status >= 300) {
      setError(typeof result.data.error === "string" ? result.data.error : "操作失败，请重试。");
      return false;
    }
    await Taro.showToast({ title: success, icon: "none" });
    await bootstrap(true);
    return true;
  };

  const saveProfile = async () => {
    if (!nickname.trim()) return Taro.showToast({ title: "先取个昵称吧", icon: "none" });
    await runAction("update-profile", { nickname: nickname.trim(), avatar }, "欢迎来到农场");
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
    const ok = await runAction("accept-invite", { code: inviteCode }, "绑定成功，田地连起来啦");
    if (ok) setInviteCode("");
  };

  const addWeight = async () => {
    const ok = await runAction("add-weight", {
      weightKg: Number(weight),
      occurredAt: timestampFrom(recordDate, recordTime),
    }, "体重已记录");
    if (ok) setWeight("");
  };

  const addPoop = async () => {
    await runAction("add-poop", { occurredAt: timestampFrom(recordDate, recordTime) }, "粑粑时间已记录");
  };

  const unbind = async () => {
    const confirm = await Taro.showModal({
      title: "解除绑定？",
      content: "历史记录会封存，双方会立即看不到。",
      confirmColor: "#b32a50",
    });
    if (confirm.confirm) await runAction("unbind", {}, "已解除绑定");
  };

  const timeline = useMemo(() => {
    if (!data) return [];
    return [
      ...(data.weights || []).map((item) => ({ id: `w-${item.id}`, ownerUid: item.ownerUid, time: item.recordedAt, text: `记录体重 ${item.weightKg.toFixed(1)} kg` })),
      ...(data.poops || []).map((item) => ({ id: `p-${item.id}`, ownerUid: item.ownerUid, time: item.occurredAt, text: `在 ${timeValue(item.occurredAt)} 拉了粑粑` })),
    ].sort((a, b) => b.time - a.time).slice(0, 8);
  }, [data]);

  if (loading) return <Loading />;
  if (error && !data) return <Loading error={error} retry={() => bootstrap()} />;
  if (!data) return <Loading error="没有拿到农场数据。" retry={() => bootstrap()} />;

  if (!data.viewer.profileComplete) {
    return (
      <View className="full-page">
        <View className="message-card profile-card">
          <Text className="kicker">第一次见面</Text>
          <Text className="title">你想在农场里叫什么？</Text>
          <Input className="field" value={nickname} onInput={(event) => setNickname(event.detail.value)} maxlength={12} placeholder="例如 鸡包蛋" />
          <View className="avatar-grid">{avatars.map((choice) => <Button key={choice} className={avatar === choice ? "avatar active" : "avatar"} onClick={() => setAvatar(choice)}>{choice}</Button>)}</View>
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

  const weights = data.weights || [];
  const poops = data.poops || [];
  const reactions = data.reactions || [];
  const people = [data.viewer, data.partner];

  return (
    <View className="page dashboard-page">
      <View className="mini-hero"><Text className="kicker">共同农场 · 微信身份已同步</Text><Text className="hero-title">今天，也一起认真生活。</Text><Text className="description">只在打开、下拉刷新或记录后同步，省下免费额度。</Text></View>
      {error && <View className="error-banner"><Text>{error}</Text><Button onClick={() => setError(null)}>×</Button></View>}
      <View className="people-grid">{people.map((person) => { const latest = latestWeight(weights, person.uid); return <View key={person.uid} className="person-card" style={{ borderColor: person.color }}><View className="person-head"><Text className="profile-badge small" style={{ background: person.color }}>{person.avatar}</Text><View><Text className="role">{person.uid === data.viewer.uid ? "我的田" : "伴侣的田"}</Text><Text className="subtitle">{person.nickname}</Text></View></View><View className="metrics"><View><Text className="metric-value">{latest ? latest.weightKg.toFixed(1) : "--"}</Text><Text>kg</Text></View><View><Text className="metric-value">{todayPoops(poops, person.uid)}</Text><Text>今日粑粑</Text></View></View></View>; })}</View>

      <View className="panel action-panel"><Text className="kicker">快速记录</Text><Text className="subtitle">我的今天</Text><View className="date-row"><Picker mode="date" value={recordDate} onChange={(event) => setRecordDate(String(event.detail.value))}><View className="picker-field">📅 {recordDate}</View></Picker><Picker mode="time" value={recordTime} onChange={(event) => setRecordTime(String(event.detail.value))}><View className="picker-field">🕐 {recordTime}</View></Picker></View><View className="weight-row"><Input className="field" type="digit" value={weight} onInput={(event) => setWeight(event.detail.value)} placeholder="体重 kg，例如 68.4" /><Button className="primary compact" loading={busy} onClick={addWeight}>记体重</Button></View><Button className="secondary full" loading={busy} onClick={addPoop}>🚽 记一次粑粑</Button></View>

      <View className="panel"><Text className="kicker">给点动静</Text><Text className="subtitle">回应 {data.partner.nickname}</Text><View className="reaction-row"><Button disabled={busy} onClick={() => runAction("react", { kind: "like" }, "小红心送到啦")}>💗<Text>给个赞</Text></Button><Button disabled={busy} onClick={() => runAction("react", { kind: "tease" }, "轻轻嘲讽发出啦")}>📣<Text>轻轻嘲讽</Text></Button></View>{reactions[0] && <View className="note"><Text>“{reactions[0].message}”</Text><Text className="role">{formatDateTime(reactions[0].createdAt)}</Text></View>}</View>

      <View className="panel"><Text className="kicker">共同动态</Text><Text className="subtitle">最近发生的小事</Text>{timeline.length ? <ScrollView className="timeline" scrollY>{timeline.map((item) => { const owner = people.find((person) => person.uid === item.ownerUid) || data.viewer; return <View className="activity" key={item.id}><Text className="profile-badge tiny" style={{ background: owner.color }}>{owner.avatar}</Text><View><Text className="activity-title">{owner.nickname} · {item.text}</Text><Text className="role">{formatDateTime(item.time)}</Text></View></View>; })}</ScrollView> : <View className="empty">🪴 还没有记录，种下第一件小事吧。</View>}</View>
      <Button className="danger-link" onClick={unbind}>解除伴侣绑定</Button>
    </View>
  );
}
