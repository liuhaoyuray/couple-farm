"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type UserProfile = {
  uid: string;
  nickname: string;
  avatar: string;
  color: string;
  profileComplete: boolean;
  coupleId: string | null;
  createdAt: number;
};

type WeightEntry = {
  id: string;
  coupleId: string;
  ownerUid: string;
  weightKg: number;
  recordedAt: number;
  createdAt: number;
};

type PoopEntry = {
  id: string;
  coupleId: string;
  ownerUid: string;
  occurredAt: number;
  createdAt: number;
};

type Reaction = {
  id: string;
  coupleId: string;
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

type FarmResult = {
  status: number;
  data: Record<string, unknown>;
};

type FarmRequest = {
  action: string;
  payload?: Record<string, unknown>;
  sessionToken?: string | null;
};

declare global {
  interface Window {
    __COUPLE_FARM_REQUEST__?: (input: FarmRequest) => Promise<FarmResult>;
  }
}

const SESSION_KEY = "couple-farm-session-v2";
const DAY = 24 * 60 * 60 * 1000;
const avatars = ["🐣", "🐰", "🐻", "🐼", "🐱", "🐶", "🦊", "🐸"];

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function dateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function todayCount(entries: PoopEntry[], uid: string, now: number) {
  const today = dateKey(now);
  return entries.filter((entry) => entry.ownerUid === uid && dateKey(entry.occurredAt) === today).length;
}

function latestWeight(entries: WeightEntry[], uid: string) {
  return [...entries]
    .filter((entry) => entry.ownerUid === uid)
    .sort((left, right) => right.recordedAt - left.recordedAt)[0];
}

function streakDays(weights: WeightEntry[], poops: PoopEntry[], uid: string, now: number) {
  const activeDays = new Set([
    ...weights.filter((entry) => entry.ownerUid === uid).map((entry) => dateKey(entry.recordedAt)),
    ...poops.filter((entry) => entry.ownerUid === uid).map((entry) => dateKey(entry.occurredAt)),
  ]);
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  while (activeDays.has(dateKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function toDateTimeInput(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function apiError(result: FarmResult) {
  return typeof result.data.error === "string" ? result.data.error : "操作没有成功，请稍后再试。";
}

function WeightMiniChart({ data, people, now }: { data: WeightEntry[]; people: UserProfile[]; now: number }) {
  const cutoff = now - 30 * DAY;
  const points = data.filter((entry) => entry.recordedAt >= cutoff);
  if (!points.length) {
    return (
      <div className="formal-empty compact">
        <span>🌱</span>
        <p>记录第一笔体重后，曲线会从这里长出来。</p>
      </div>
    );
  }

  const width = 620;
  const height = 220;
  const padding = 28;
  const minTime = Math.min(...points.map((point) => point.recordedAt));
  const maxTime = Math.max(...points.map((point) => point.recordedAt));
  const minWeight = Math.min(...points.map((point) => point.weightKg)) - 1;
  const maxWeight = Math.max(...points.map((point) => point.weightKg)) + 1;
  const x = (value: number) => padding + (maxTime === minTime ? (width - 2 * padding) / 2 : ((value - minTime) / (maxTime - minTime)) * (width - 2 * padding));
  const y = (value: number) => padding + ((maxWeight - value) / Math.max(maxWeight - minWeight, 1)) * (height - 2 * padding);

  return (
    <div className="formal-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="最近 30 天体重变化">
        {[0, 1, 2, 3].map((line) => (
          <line key={line} x1={padding} x2={width - padding} y1={padding + line * ((height - 2 * padding) / 3)} y2={padding + line * ((height - 2 * padding) / 3)} />
        ))}
        {people.map((person) => {
          const own = points.filter((point) => point.ownerUid === person.uid).sort((a, b) => a.recordedAt - b.recordedAt);
          return (
            <g key={person.uid}>
              {own.length > 1 && <polyline points={own.map((point) => `${x(point.recordedAt)},${y(point.weightKg)}`).join(" ")} fill="none" stroke={person.color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
              {own.map((point) => (
                <circle key={point.id} cx={x(point.recordedAt)} cy={y(point.weightKg)} r="6" fill="#fffaf0" stroke={person.color} strokeWidth="4">
                  <title>{`${person.nickname} ${point.weightKg.toFixed(1)}kg · ${formatDateTime(point.recordedAt)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FullPageMessage({ title, detail, action }: { title: string; detail: string; action?: () => void }) {
  return (
    <main className="formal-access">
      <section className="formal-access-card">
        <div className="formal-logo" aria-hidden="true">♥</div>
        <p className="formal-kicker">情侣小农场</p>
        <h1>{title}</h1>
        <p>{detail}</p>
        {action && <button className="formal-primary" onClick={action}>重新连接</button>}
      </section>
    </main>
  );
}

export default function FormalApp() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [data, setData] = useState<FarmData | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register" | "recover">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [issuedRecoveryCode, setIssuedRecoveryCode] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("🐣");
  const [inviteCode, setInviteCode] = useState("");
  const [createdInvite, setCreatedInvite] = useState<{ code: string; expiresAt: number } | null>(null);
  const [weight, setWeight] = useState("");
  const [weightTime, setWeightTime] = useState(() => toDateTimeInput());
  const [poopTime, setPoopTime] = useState(() => toDateTimeInput());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const call = useCallback(async (action: string, payload: Record<string, unknown> = {}, tokenOverride?: string | null) => {
    if (!window.__COUPLE_FARM_REQUEST__) {
      return { status: 503, data: { error: "网页还没有连接到腾讯云，请稍后刷新。" } } satisfies FarmResult;
    }
    return window.__COUPLE_FARM_REQUEST__({
      action,
      payload,
      sessionToken: tokenOverride === undefined ? sessionToken : tokenOverride,
    });
  }, [sessionToken]);

  const bootstrap = useCallback(async (token: string, quiet = false) => {
    if (!quiet) setBooting(true);
    setError(null);
    const result = await call("bootstrap", {}, token);
    if (result.status === 401) {
      window.localStorage.removeItem(SESSION_KEY);
      setSessionToken(null);
      setData(null);
      setBooting(false);
      if (!quiet) setError("登录已经过期，请重新登录。");
      return;
    }
    if (result.status !== 200) {
      setError(apiError(result));
      setBooting(false);
      return;
    }
    setData(result.data as unknown as FarmData);
    setBooting(false);
  }, [call]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("key")) {
      url.searchParams.delete("key");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    const stateTimer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(SESSION_KEY);
      if (!saved) {
        setBooting(false);
        return;
      }
      setSessionToken(saved);
      void bootstrap(saved);
    }, 0);
    return () => window.clearTimeout(stateTimer);
  }, [bootstrap]);

  useEffect(() => {
    if (!sessionToken || !data?.couple) return;
    let lastRefresh = Date.now();
    const refresh = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefresh > 60_000) {
        lastRefresh = Date.now();
        void bootstrap(sessionToken, true);
      }
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [bootstrap, data?.couple, sessionToken]);

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const action = authMode === "register" ? "register" : authMode === "recover" ? "recover-account" : "login";
    const payload = authMode === "recover"
      ? { username, recoveryCode, newPassword: password }
      : { username, password };
    const result = await call(action, payload, null);
    setBusy(false);
    if (result.status < 200 || result.status >= 300) {
      setError(apiError(result));
      return;
    }
    const token = typeof result.data.sessionToken === "string" ? result.data.sessionToken : null;
    if (!token) {
      setError("云端没有返回登录凭证，请重试。");
      return;
    }
    window.localStorage.setItem(SESSION_KEY, token);
    setSessionToken(token);
    setPassword("");
    if (authMode === "register" && typeof result.data.recoveryCode === "string") {
      setIssuedRecoveryCode(result.data.recoveryCode);
      setBooting(false);
      return;
    }
    await bootstrap(token);
  };

  const finishRecoveryNotice = async () => {
    if (!sessionToken) return;
    setIssuedRecoveryCode(null);
    await bootstrap(sessionToken);
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await call("update-profile", { nickname, avatar });
    setBusy(false);
    if (result.status !== 200) {
      setError(apiError(result));
      return;
    }
    if (sessionToken) await bootstrap(sessionToken);
  };

  const createInvite = async () => {
    setBusy(true);
    setError(null);
    const result = await call("create-invite");
    setBusy(false);
    if (result.status !== 201) {
      setError(apiError(result));
      return;
    }
    setCreatedInvite({
      code: String(result.data.code),
      expiresAt: Number(result.data.expiresAt),
    });
  };

  const acceptInvite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await call("accept-invite", { code: inviteCode });
    setBusy(false);
    if (result.status !== 200) {
      setError(apiError(result));
      return;
    }
    setData(result.data as unknown as FarmData);
    showToast("绑定成功，欢迎来到你们的共同农场！");
  };

  const refreshDashboard = useCallback(async () => {
    if (!sessionToken) return;
    await bootstrap(sessionToken, true);
  }, [bootstrap, sessionToken]);

  const addWeight = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await call("add-weight", {
      weightKg: Number(weight),
      occurredAt: new Date(weightTime).getTime(),
    });
    setBusy(false);
    if (result.status !== 201) return setError(apiError(result));
    setWeight("");
    setWeightTime(toDateTimeInput());
    showToast("体重已经种进小农场啦。");
    await refreshDashboard();
  };

  const addPoop = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await call("add-poop", { occurredAt: new Date(poopTime).getTime() });
    setBusy(false);
    if (result.status !== 201) return setError(apiError(result));
    setPoopTime(toDateTimeInput());
    showToast("粑粑时间记下来了，肚肚辛苦啦。");
    await refreshDashboard();
  };

  const sendReaction = async (kind: "like" | "tease") => {
    setBusy(true);
    const result = await call("react", { kind });
    setBusy(false);
    if (result.status !== 201) return setError(apiError(result));
    showToast(kind === "like" ? "小红心已经送到对方田里。" : "轻轻嘲讽已经发出，注意求生欲！");
    await refreshDashboard();
  };

  const deleteEntry = async (kind: "weight" | "poop", id: string) => {
    const result = await call(`delete-${kind}`, { id });
    if (result.status !== 200) return setError(apiError(result));
    showToast("这条记录已经移除了。");
    await refreshDashboard();
  };

  const logout = async () => {
    await call("logout").catch(() => undefined);
    window.localStorage.removeItem(SESSION_KEY);
    setSessionToken(null);
    setData(null);
    setError(null);
    setAuthMode("login");
  };

  const unbind = async () => {
    if (!window.confirm("确定解除绑定吗？历史记录会封存，双方会立即看不到。")) return;
    setBusy(true);
    const result = await call("unbind");
    setBusy(false);
    if (result.status !== 200) return setError(apiError(result));
    showToast("已解除绑定，历史记录已经封存。");
    await refreshDashboard();
  };

  const timeline = useMemo(() => {
    if (!data) return [];
    return [
      ...(data.weights || []).map((item) => ({ id: `w-${item.id}`, type: "weight" as const, ownerUid: item.ownerUid, time: item.recordedAt, text: `记录体重 ${item.weightKg.toFixed(1)} kg`, rawId: item.id })),
      ...(data.poops || []).map((item) => ({ id: `p-${item.id}`, type: "poop" as const, ownerUid: item.ownerUid, time: item.occurredAt, text: `在 ${formatTime(item.occurredAt)} 拉了粑粑`, rawId: item.id })),
    ].sort((a, b) => b.time - a.time).slice(0, 12);
  }, [data]);

  if (booting) return <FullPageMessage title="正在打开你们的小农场" detail="这次只检查登录状态，不会一直让你等。" />;

  if (!sessionToken) {
    return (
      <main className="formal-access">
        <section className="formal-auth-layout">
          <div className="formal-auth-story">
            <div className="formal-logo" aria-hidden="true">♥</div>
            <p className="formal-kicker">双人生活养成</p>
            <h1>把两个人的小事，<br />种成一座共同农场。</h1>
            <p>体重曲线、粑粑动态、互相点赞和轻轻嘲讽。现在每个人都有自己的账号，不再依赖专属链接。</p>
            <div className="formal-story-badges"><span>🌱 免费起步</span><span>🔐 独立账号</span><span>💞 一次配对</span></div>
          </div>
          <section className="formal-auth-card">
            <div className="formal-tabs">
              <button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setError(null); }}>登录</button>
              <button className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setError(null); }}>注册</button>
            </div>
            <h2>{authMode === "login" ? "欢迎回来" : authMode === "register" ? "领一块自己的田" : "用恢复码改密码"}</h2>
            <p>{authMode === "recover" ? "无需短信或邮件，使用注册时保存的恢复码。" : "账号只需字母、数字、下划线或短横线。"}</p>
            <form onSubmit={submitAuth} className="formal-form">
              <label>账号<input value={username} onChange={(event) => setUsername(event.target.value)} autoCapitalize="none" autoComplete="username" placeholder="例如 chicken_egg" minLength={3} maxLength={24} required /></label>
              {authMode === "recover" && <label>恢复码<input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())} placeholder="XXXXXXXX-XXXXXXXX" autoComplete="off" required /></label>}
              <label>{authMode === "recover" ? "新密码" : "密码"}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={authMode === "login" ? "current-password" : "new-password"} placeholder="至少 8 位，包含字母和数字" minLength={8} maxLength={64} required /></label>
              {error && <p className="formal-error" role="alert">{error}</p>}
              <button className="formal-primary" disabled={busy}>{busy ? "请稍等…" : authMode === "login" ? "进入我的农场" : authMode === "register" ? "注册并进入" : "重设密码并登录"}</button>
            </form>
            <button className="formal-text-button" onClick={() => { setAuthMode(authMode === "recover" ? "login" : "recover"); setError(null); }}>{authMode === "recover" ? "返回登录" : "忘记密码？用恢复码"}</button>
          </section>
        </section>
      </main>
    );
  }

  if (issuedRecoveryCode) {
    return (
      <main className="formal-access">
        <section className="formal-access-card recovery-card">
          <span className="formal-big-emoji">🔑</span>
          <p className="formal-kicker">只显示这一次</p>
          <h1>保存你的账号恢复码</h1>
          <p>忘记密码时，它是唯一的恢复方式。截图或复制到自己的安全备忘录，不要发给别人。</p>
          <button className="formal-code" onClick={() => { void navigator.clipboard?.writeText(issuedRecoveryCode); showToast("恢复码已复制"); }}>{issuedRecoveryCode}</button>
          <button className="formal-primary" onClick={finishRecoveryNotice}>我已经安全保存</button>
        </section>
        {toast && <div className="formal-toast">{toast}</div>}
      </main>
    );
  }

  if (error && !data) return <FullPageMessage title="小农场暂时没连上" detail={error} action={() => sessionToken && void bootstrap(sessionToken)} />;

  if (!data) return <FullPageMessage title="正在整理田地" detail="请稍后刷新一次。" />;

  if (!data.viewer.profileComplete) {
    return (
      <main className="formal-access">
        <section className="formal-access-card profile-card">
          <p className="formal-kicker">第一步 · 认识一下</p>
          <h1>你想在农场里叫什么？</h1>
          <p>昵称可以是中文；头像以后也可以继续修改。</p>
          <form onSubmit={saveProfile} className="formal-form">
            <label>昵称<input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="例如 小麦苗、团子、阿星" maxLength={12} required /></label>
            <fieldset className="formal-avatar-picker"><legend>像素居民</legend>{avatars.map((choice) => <button type="button" key={choice} className={avatar === choice ? "active" : ""} onClick={() => setAvatar(choice)}>{choice}</button>)}</fieldset>
            {error && <p className="formal-error">{error}</p>}
            <button className="formal-primary" disabled={busy}>{busy ? "正在保存…" : "就这样，继续"}</button>
          </form>
          <button className="formal-text-button" onClick={logout}>退出账号</button>
        </section>
      </main>
    );
  }

  if (!data.couple || !data.partner) {
    return (
      <main className="formal-access">
        <section className="formal-pair-card">
          <header><span className="formal-profile-dot" style={{ background: data.viewer.color }}>{data.viewer.avatar}</span><div><p className="formal-kicker">欢迎，{data.viewer.nickname}</p><h1>把两块田连在一起</h1></div></header>
          <p className="formal-pair-lead">一个人生成配对码，另一个人在自己的账号里输入。配对码 24 小时有效，只能使用一次。</p>
          <div className="formal-pair-grid">
            <section>
              <span className="formal-step">方法 A</span>
              <h2>邀请我的伴侣</h2>
              <p>生成后，把 8 位配对码私下发给对方。</p>
              {createdInvite ? <><button className="formal-code small" onClick={() => { void navigator.clipboard?.writeText(createdInvite.code); showToast("配对码已复制"); }}>{createdInvite.code}</button><small>有效至 {formatDateTime(createdInvite.expiresAt)}</small></> : <button className="formal-primary" disabled={busy} onClick={createInvite}>生成一次性配对码</button>}
            </section>
            <section>
              <span className="formal-step">方法 B</span>
              <h2>我来输入配对码</h2>
              <p>输入伴侣发来的 8 位代码。</p>
              <form onSubmit={acceptInvite} className="formal-form inline"><input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="8 位配对码" required /><button className="formal-secondary" disabled={busy}>确认绑定</button></form>
            </section>
          </div>
          {error && <p className="formal-error">{error}</p>}
          <footer><button className="formal-text-button" onClick={logout}>退出账号</button><button className="formal-text-button" onClick={() => sessionToken && void bootstrap(sessionToken)}>刷新状态</button></footer>
        </section>
        {toast && <div className="formal-toast">{toast}</div>}
      </main>
    );
  }

  const weights = data.weights || [];
  const poops = data.poops || [];
  const reactions = data.reactions || [];
  const people = [data.viewer, data.partner];
  const now = data.serverTime;
  const viewerWeight = latestWeight(weights, data.viewer.uid);
  const partnerWeight = latestWeight(weights, data.partner.uid);

  return (
    <main className="formal-dashboard">
      <header className="formal-topbar">
        <div className="formal-brand"><span>♥</span><strong>情侣小农场</strong></div>
        <div className="formal-couple-chip"><span style={{ background: data.viewer.color }}>{data.viewer.avatar}</span><i>+</i><span style={{ background: data.partner.color }}>{data.partner.avatar}</span><b>{data.viewer.nickname} & {data.partner.nickname}</b></div>
        <div className="formal-top-actions"><button onClick={refreshDashboard} aria-label="刷新">↻</button><details><summary>设置</summary><div><button onClick={logout}>退出登录</button><button className="danger" onClick={unbind}>解除绑定</button></div></details></div>
      </header>
      <div className="formal-shell">
        <section className="formal-hero">
          <div><p className="formal-kicker">共同农场 · 已安全同步</p><h1>今天，也一起认真生活。</h1><p>不用盯着数字焦虑，只看两个人真实、缓慢的变化。</p></div>
          <div className="formal-farm-scene" aria-hidden="true"><span>🌻</span><span>🏡</span><span>🌳</span></div>
        </section>

        {error && <div className="formal-banner-error">{error}<button onClick={() => setError(null)}>×</button></div>}

        <section className="formal-summary-grid">
          {people.map((person) => {
            const latest = person.uid === data.viewer.uid ? viewerWeight : partnerWeight;
            return <article key={person.uid} className="formal-person-card" style={{ "--person-color": person.color } as React.CSSProperties}><div className="formal-person-head"><span>{person.avatar}</span><div><small>{person.uid === data.viewer.uid ? "我的田" : "伴侣的田"}</small><h2>{person.nickname}</h2></div></div><div className="formal-metrics"><div><strong>{latest ? latest.weightKg.toFixed(1) : "--"}</strong><span>kg 最新体重</span></div><div><strong>{todayCount(poops, person.uid, now)}</strong><span>次 今日粑粑</span></div><div><strong>{streakDays(weights, poops, person.uid, now)}</strong><span>天 连续打卡</span></div></div></article>;
          })}
        </section>

        <section className="formal-main-grid">
          <article className="formal-panel formal-chart-panel"><div className="formal-panel-title"><div><p className="formal-kicker">最近 30 天</p><h2>双人体重曲线</h2></div><div className="formal-legend">{people.map((person) => <span key={person.uid}><i style={{ background: person.color }} />{person.nickname}</span>)}</div></div><WeightMiniChart data={weights} people={people} now={now} /></article>
          <aside className="formal-panel formal-react-panel"><p className="formal-kicker">今天也要有回应</p><h2>给 {data.partner.nickname} 一点动静</h2><div className="formal-reaction-buttons"><button disabled={busy} onClick={() => sendReaction("like")}>💗<span>给个赞</span></button><button disabled={busy} onClick={() => sendReaction("tease")}>📣<span>轻轻嘲讽</span></button></div>{reactions[0] ? <blockquote>“{reactions[0].message}”<small>{formatDateTime(reactions[0].createdAt)}</small></blockquote> : <p className="formal-muted">还没有小纸条，先发第一张吧。</p>}</aside>
        </section>

        <section className="formal-record-grid">
          <article className="formal-panel"><div className="formal-panel-title"><div><p className="formal-kicker">体重秤</p><h2>记录我的体重</h2></div><span className="formal-panel-emoji">⚖️</span></div><form className="formal-record-form" onSubmit={addWeight}><label><span>千克</span><input type="number" min="25" max="250" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="例如 68.4" required /></label><label><span>时间</span><input type="datetime-local" value={weightTime} onChange={(event) => setWeightTime(event.target.value)} required /></label><button className="formal-primary" disabled={busy}>保存体重</button></form></article>
          <article className="formal-panel"><div className="formal-panel-title"><div><p className="formal-kicker">小马桶</p><h2>记录粑粑时间</h2></div><span className="formal-panel-emoji">🚽</span></div><form className="formal-record-form" onSubmit={addPoop}><label className="wide"><span>什么时候解决的？</span><input type="datetime-local" value={poopTime} onChange={(event) => setPoopTime(event.target.value)} required /></label><button className="formal-primary poop" disabled={busy}>记下一次</button></form><p className="formal-muted">一天可以记录多次，只统计时间，不做健康诊断。</p></article>
        </section>

        <section className="formal-panel formal-timeline"><div className="formal-panel-title"><div><p className="formal-kicker">共同动态</p><h2>最近发生的小事</h2></div><button className="formal-text-button" onClick={refreshDashboard}>刷新</button></div>{timeline.length ? <div className="formal-activity-list">{timeline.map((item) => { const owner = people.find((person) => person.uid === item.ownerUid) || data.viewer; return <div key={item.id}><span className="formal-activity-avatar" style={{ background: owner.color }}>{owner.avatar}</span><div><strong>{owner.nickname}</strong><p>{item.text}</p><small>{formatDateTime(item.time)}</small></div>{item.ownerUid === data.viewer.uid && <button onClick={() => deleteEntry(item.type, item.rawId)}>删除</button>}</div>; })}</div> : <div className="formal-empty"><span>🪴</span><p>共同动态还是空的，记下今天的第一件小事吧。</p></div>}</section>
      </div>
      {toast && <div className="formal-toast">{toast}</div>}
    </main>
  );
}
