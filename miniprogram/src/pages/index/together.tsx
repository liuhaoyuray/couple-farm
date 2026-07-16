import { Button, Input, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cloudCall } from "../../cloud";

type Person = { uid: string; nickname: string; avatar: string; color: string };
type TogetherOption = {
  id: string;
  label: string;
  cuisine: string;
  budget: "¥" | "¥¥" | "¥¥¥";
  note: string;
  createdBy: string;
  createdAt: number;
};
type TogetherDecision = {
  id: string;
  optionId: string;
  optionLabel: string;
  cuisine: string;
  budget: string;
  mode: "classic" | "fresh" | "budget";
  status: "pending" | "confirmed" | "vetoed";
  createdBy: string;
  confirmedByUids: string[];
  vetoedBy: string | null;
  createdAt: number;
  updatedAt: number;
};
type Checkin = {
  userUid: string;
  mood: number;
  moodLabel: string;
  energy: number;
  note: string;
  updatedAt: number;
};
type Membership = {
  current: {
    plan: "free" | "plus";
    source: "free" | "founder_trial" | "paid";
    activeUntil: number | null;
    trialAvailable: boolean;
    waitlisted: boolean;
    limits: { activeRestaurantOptions: number; decisionHistoryDays: number };
  };
  productName: string;
  suggestedPrices: { monthly: number; yearly: number; currency: string };
  features: string[];
  paymentReady: boolean;
  paymentNote: string;
};
type TogetherHub = {
  date: string;
  options: TogetherOption[];
  decisions: TogetherDecision[];
  currentDecision: TogetherDecision | null;
  checkins: Checkin[];
  prompt: {
    id: string;
    text: string;
    a: string;
    b: string;
    viewerChoice: "a" | "b" | null;
    partnerChoice: "a" | "b" | null;
    partnerAnswered: boolean;
    matched: boolean | null;
  };
  membership: Membership;
};

const moods = ["🌧️", "🥺", "🙂", "😊", "🥰"];
const energies = ["见底", "偏低", "一般", "充足", "满格"];
const budgets = ["¥", "¥¥", "¥¥¥"] as const;
const modes = [
  { key: "classic", label: "🎲 随机抽", detail: "所有候选等概率" },
  { key: "fresh", label: "🌱 换口味", detail: "尽量避开近 7 天" },
  { key: "budget", label: "💰 按预算", detail: "只从指定预算抽" },
] as const;

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shortDate(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function money(cents: number) {
  return `¥${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

export default function TogetherPanel({
  viewer,
  partner,
  onOpenAnniversaries,
}: {
  viewer: Person;
  partner: Person;
  onOpenAnniversaries: () => void;
}) {
  const [hub, setHub] = useState<TogetherHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mood, setMood] = useState(4);
  const [energy, setEnergy] = useState(3);
  const [moodNote, setMoodNote] = useState("");
  const [optionLabel, setOptionLabel] = useState("");
  const [optionCuisine, setOptionCuisine] = useState("");
  const [optionBudget, setOptionBudget] = useState<(typeof budgets)[number]>("¥¥");
  const [mode, setMode] = useState<(typeof modes)[number]["key"]>("classic");
  const [spinBudget, setSpinBudget] = useState<(typeof budgets)[number]>("¥¥");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await cloudCall("together-hub", { date: localDate() });
    setLoading(false);
    if (result.status !== 200) {
      const code = String(result.data.diagnosticId || result.data.code || "");
      const suffix = code ? `（诊断码：${code}）` : "";
      setError(`${String(result.data.error || "今天一起暂时没有连接成功。")}${suffix}`);
      return;
    }
    const next = result.data as unknown as TogetherHub;
    setHub(next);
    const mine = next.checkins.find((item) => item.userUid === viewer.uid);
    if (mine) {
      setMood(mine.mood);
      setEnergy(mine.energy);
      setMoodNote(mine.note);
    }
  }, [viewer.uid]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const act = async (action: string, payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    const result = await cloudCall(action, payload);
    setBusy(false);
    if (result.status < 200 || result.status >= 300) {
      const message = String(result.data.error || "操作没有完成，请再试一次。");
      await Taro.showToast({ title: message, icon: "none", duration: 2800 });
      return false;
    }
    await Taro.showToast({ title: success, icon: "none" });
    await load();
    return true;
  };

  const myCheckin = hub?.checkins.find((item) => item.userUid === viewer.uid);
  const partnerCheckin = hub?.checkins.find((item) => item.userUid === partner.uid);
  const plus = hub?.membership.current.plan === "plus";
  const recentConfirmed = useMemo(
    () => hub?.decisions.filter((item) => item.status === "confirmed").slice(0, 5) || [],
    [hub?.decisions],
  );

  const saveCheckin = () => act("save-daily-checkin", {
    date: localDate(), mood, energy, note: moodNote.trim(),
  }, "今日状态告诉对方啦");

  const answer = (choice: "a" | "b") => act("answer-daily-question", {
    date: localDate(), choice,
  }, "答案藏好啦");

  const addOption = async () => {
    if (!optionLabel.trim()) return Taro.showToast({ title: "先写一家餐厅吧", icon: "none" });
    const ok = await act("add-together-option", {
      label: optionLabel.trim(), cuisine: optionCuisine.trim(), budget: optionBudget,
    }, "放进候选池啦");
    if (ok) {
      setOptionLabel("");
      setOptionCuisine("");
    }
  };

  const removeOption = async (option: TogetherOption) => {
    const confirmed = await Taro.showModal({
      title: "移出候选池？",
      content: option.label,
      confirmColor: "#b32a50",
    });
    if (confirmed.confirm) await act("archive-together-option", { id: option.id }, "已经移出啦");
  };

  const chooseMode = async (next: (typeof modes)[number]["key"]) => {
    if (next !== "classic" && !plus) {
      await Taro.showToast({ title: "领取心动会员体验后可用", icon: "none" });
      return;
    }
    setMode(next);
  };

  if (loading && !hub) return <View className="together-loading">🌱 正在准备今天的小约会…</View>;
  if (error && !hub) return <View className="panel together-error"><Text className="subtitle">今天一起打了个盹</Text><Text className="description">{error}</Text><Button className="primary" onClick={load}>重新连接</Button></View>;
  if (!hub) return null;

  return (
    <>
      <View className="page-heading together-heading">
        <Text className="kicker">我们俩的小田地 · 0.5.0</Text>
        <Text className="title">今天，一起做点什么</Text>
        <Text className="description">每天一分钟对个暗号，吃什么也不用再互相说“随便”。</Text>
      </View>

      <View className="daily-duo-grid">
        <View className="daily-person-card mine"><Text className="daily-avatar">{moods[(myCheckin?.mood || mood) - 1]}</Text><Text className="activity-title">{viewer.nickname}</Text><Text className="role">{myCheckin ? myCheckin.moodLabel : "今天还没报到"}</Text></View>
        <View className="daily-person-card"><Text className="daily-avatar">{partnerCheckin ? moods[partnerCheckin.mood - 1] : "🌙"}</Text><Text className="activity-title">{partner.nickname}</Text><Text className="role">{partnerCheckin ? partnerCheckin.moodLabel : "等 TA 来报到"}</Text></View>
      </View>

      <View className="panel daily-checkin-panel">
        <Text className="kicker">每日碰头</Text><Text className="subtitle">今天的你怎么样？</Text>
        <Text className="together-label">心情</Text>
        <View className="mood-row">{moods.map((icon, index) => <Button key={icon} className={mood === index + 1 ? "active" : ""} onClick={() => setMood(index + 1)}>{icon}</Button>)}</View>
        <Text className="together-label">能量：{energies[energy - 1]}</Text>
        <View className="energy-row">{energies.map((label, index) => <Button key={label} className={energy === index + 1 ? "active" : ""} onClick={() => setEnergy(index + 1)}>{index + 1}</Button>)}</View>
        <Textarea className="textarea together-note" value={moodNote} maxlength={40} onInput={(event) => setMoodNote(event.detail.value)} placeholder="想让对方知道的一句话（选填）" />
        <Button className="primary" loading={busy} onClick={saveCheckin}>把今日状态告诉 TA</Button>
        {partnerCheckin?.note && <View className="partner-note"><Text>“{partnerCheckin.note}”</Text><Text className="role">来自 {partner.nickname}</Text></View>}
      </View>

      <View className="panel match-panel">
        <Text className="kicker">今日默契题</Text><Text className="subtitle">{hub.prompt.text}</Text>
        <View className="match-options">
          <Button className={hub.prompt.viewerChoice === "a" ? "active" : ""} disabled={busy} onClick={() => answer("a")}><Text>A</Text>{hub.prompt.a}</Button>
          <Button className={hub.prompt.viewerChoice === "b" ? "active" : ""} disabled={busy} onClick={() => answer("b")}><Text>B</Text>{hub.prompt.b}</Button>
        </View>
        {!hub.prompt.viewerChoice && hub.prompt.partnerAnswered && <Text className="match-hint">🔒 TA 已经选好，你选完就揭晓</Text>}
        {!hub.prompt.viewerChoice && !hub.prompt.partnerAnswered && <Text className="match-hint">答案会先保密，等两个人都选完</Text>}
        {hub.prompt.viewerChoice && !hub.prompt.partnerAnswered && <Text className="match-hint">⏳ 你的答案已藏好，等 TA 来选</Text>}
        {hub.prompt.matched === true && <Text className="match-result good">💞 默契命中！你们选了一样的答案</Text>}
        {hub.prompt.matched === false && <Text className="match-result">🌈 这次不一样，正好多了解彼此一点</Text>}
      </View>

      <View className="panel restaurant-panel">
        <Text className="kicker">今晚吃什么</Text><Text className="subtitle">把“随便”交给小田地</Text>
        {hub.currentDecision
          ? <View className="decision-card"><Text className="decision-confetti">✨ 🍽️ ✨</Text><Text className="decision-name">{hub.currentDecision.optionLabel}</Text><Text className="decision-meta">{hub.currentDecision.cuisine || "好吃就行"} · {hub.currentDecision.budget}</Text><Text className="role">{hub.currentDecision.confirmedByUids.length === 2 ? "两个人都同意啦" : `还差 ${hub.currentDecision.confirmedByUids.includes(viewer.uid) ? partner.nickname : viewer.nickname} 确认`}</Text><View className="decision-actions"><Button className="primary" disabled={hub.currentDecision.confirmedByUids.includes(viewer.uid) || busy} onClick={() => act("respond-together-decision", { id: hub.currentDecision?.id, response: "confirm" }, "就吃这家")}>✓ 同意</Button><Button className="secondary" disabled={busy} onClick={() => act("respond-together-decision", { id: hub.currentDecision?.id, response: "veto" }, "行，换一家")}>↻ 这次否决</Button></View></View>
          : <><View className="decision-modes">{modes.map((item) => <Button key={item.key} className={mode === item.key ? "active" : ""} onClick={() => chooseMode(item.key)}><Text>{item.label}{item.key !== "classic" && !plus ? " 🔒" : ""}</Text><Text>{item.detail}</Text></Button>)}</View>{mode === "budget" && <Picker mode="selector" range={[...budgets]} value={budgets.indexOf(spinBudget)} onChange={(event) => setSpinBudget(budgets[Number(event.detail.value)] || "¥¥")}><View className="budget-picker">本次预算：{spinBudget}<Text>修改 ›</Text></View></Picker>}<Button className="spin-button" disabled={busy || hub.options.length < 2} onClick={() => act("spin-together-decision", { mode, budget: spinBudget }, "结果出来啦")}>{hub.options.length < 2 ? "至少放进 2 家餐厅" : "🎲 开始抽一家"}</Button></>}
      </View>

      <View className="panel option-pool-panel">
        <View className="section-heading"><View><Text className="kicker">共同候选池</Text><Text className="subtitle">{hub.options.length} / {hub.membership.current.limits.activeRestaurantOptions} 家</Text></View><Text className="pool-count">🍜</Text></View>
        <Input className="field" value={optionLabel} maxlength={20} onInput={(event) => setOptionLabel(event.detail.value)} placeholder="餐厅名，例如 巷口火锅" />
        <View className="option-meta-row"><Input className="field" value={optionCuisine} maxlength={10} onInput={(event) => setOptionCuisine(event.detail.value)} placeholder="口味/菜系" /><Picker mode="selector" range={[...budgets]} value={budgets.indexOf(optionBudget)} onChange={(event) => setOptionBudget(budgets[Number(event.detail.value)] || "¥¥")}><View className="picker-field">{optionBudget} 预算</View></Picker></View>
        <Button className="secondary" loading={busy} onClick={addOption}>＋ 放进候选池</Button>
        <View className="option-list">{hub.options.map((option) => <View className="option-chip" key={option.id}><View><Text className="activity-title">{option.label}</Text><Text className="role">{option.cuisine || "未分类"} · {option.budget}</Text></View><Button onClick={() => removeOption(option)}>×</Button></View>)}</View>
      </View>

      <View className="panel decision-history-panel">
        <Text className="kicker">最近吃过</Text><Text className="subtitle">共同决定也有记忆</Text>
        {recentConfirmed.length ? recentConfirmed.map((item) => <View className="history-row" key={item.id}><Text>🍽️</Text><View><Text className="activity-title">{item.optionLabel}</Text><Text className="role">{shortDate(item.createdAt)} · {item.budget}</Text></View><Text className="history-status">已约定</Text></View>) : <View className="empty">还没有一起确认过餐厅。</View>}
      </View>

      <View className="panel memory-shortcut" onClick={onOpenAnniversaries}><Text className="memory-icon">💞</Text><View><Text className="kicker">纪念日与约会计划</Text><Text className="subtitle compact-title">去照顾你们种下的重要日子</Text></View><Text className="chevron">›</Text></View>

      <View className={`panel membership-card ${plus ? "active" : ""}`}>
        <View className="membership-title-row"><View><Text className="kicker">商业化内测 · 不会自动扣费</Text><Text className="subtitle">💗 {hub.membership.productName}</Text></View><Text className="membership-badge">{plus ? "体验中" : "FREE"}</Text></View>
        <Text className="description small">{hub.membership.features.join(" · ")}</Text>
        <View className="price-row"><Text><Text>{money(hub.membership.suggestedPrices.monthly)}</Text>/月</Text><Text><Text>{money(hub.membership.suggestedPrices.yearly)}</Text>/年</Text></View>
        {plus && hub.membership.current.activeUntil && <Text className="membership-expiry">体验有效至 {new Date(hub.membership.current.activeUntil).toLocaleDateString()}</Text>}
        {!plus && hub.membership.current.trialAvailable && <Button className="primary" loading={busy} onClick={() => act("claim-founder-trial", {}, "7 天体验已经种下")}>免费领取 7 天创始体验</Button>}
        {!hub.membership.current.waitlisted
          ? <Button className="secondary" loading={busy} onClick={() => act("join-membership-waitlist", { plan: "yearly" }, "已登记首发优惠")}>登记 ¥48/年首发优惠</Button>
          : <Text className="waitlist-done">✓ 已登记，正式开放前不会收取任何费用</Text>}
        <Text className="fine-print">{hub.membership.paymentNote}</Text>
      </View>
    </>
  );
}
