"use client";

/* eslint-disable @next/next/no-img-element -- native images keep this shared UI portable across Next.js and CloudBase Vite builds. */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type MemberId = "chicken" | "poopy";
type RangeDays = 7 | 30 | 90;

type Profile = {
  id: MemberId;
  name: string;
  shortName: string;
  color: string;
  pale: string;
  avatar: string;
};

type WeightEntry = {
  id: number | string;
  member: MemberId;
  weightKg: number;
  recordedAt: number;
  createdAt: number;
};

type PoopEntry = {
  id: number | string;
  member: MemberId;
  occurredAt: number;
  createdAt: number;
};

type Reaction = {
  id: number | string;
  fromMember: MemberId;
  toMember: MemberId;
  kind: "like" | "tease";
  message: string;
  createdAt: number;
};

type DashboardData = {
  viewer: MemberId;
  profiles: Record<MemberId, Profile>;
  weights: WeightEntry[];
  poops: PoopEntry[];
  reactions: Reaction[];
  serverTime: number;
};

const TOKEN_KEY = "our-little-farm-access";
const DAY = 24 * 60 * 60 * 1000;

type TrackerBridgeResult = {
  status: number;
  data: Record<string, unknown>;
};

declare global {
  interface Window {
    __COUPLE_TRACKER_REQUEST__?: (input: {
      token: string;
      method: "GET" | "POST";
      payload?: Record<string, unknown>;
    }) => Promise<TrackerBridgeResult>;
  }
}

async function trackerRequest(
  token: string,
  method: "GET" | "POST",
  payload?: Record<string, unknown>,
): Promise<TrackerBridgeResult> {
  if (window.__COUPLE_TRACKER_REQUEST__) {
    return window.__COUPLE_TRACKER_REQUEST__({ token, method, payload });
  }

  const response = await fetch("/api/tracker", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "POST" ? JSON.stringify(payload ?? {}) : undefined,
    cache: "no-store",
  });
  return {
    status: response.status,
    data: (await response.json()) as Record<string, unknown>,
  };
}

function toInputDateTime(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function inputDateTimeToTimestamp(value: string) {
  const clockValue = (input: string) => {
    const [datePart, timePart] = input.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    return Date.UTC(year, month - 1, day, hour, minute);
  };
  const now = Date.now();
  const currentClock = toInputDateTime(new Date(now));
  return now + (clockValue(value) - clockValue(currentClock));
}

function localDateKey(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayKeyAgo(baseTimestamp: number, daysAgo: number) {
  const date = new Date(baseTimestamp);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return localDateKey(date.getTime());
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

function formatShortDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(timestamp);
}

function greeting(name: string, timestamp: number) {
  const hour = new Date(timestamp).getHours();
  if (hour < 6) return `夜深啦，${name}`;
  if (hour < 11) return `早上好，${name}`;
  if (hour < 14) return `中午好，${name}`;
  if (hour < 19) return `下午好，${name}`;
  return `晚上好，${name}`;
}

function lastDailyWeights(entries: WeightEntry[], member: MemberId, range: RangeDays, now: number) {
  const cutoff = now - (range + 1) * DAY;
  const daily = new Map<string, WeightEntry>();
  entries
    .filter((entry) => entry.member === member && entry.recordedAt >= cutoff)
    .forEach((entry) => daily.set(localDateKey(entry.recordedAt), entry));
  return [...daily.values()].sort((a, b) => a.recordedAt - b.recordedAt);
}

function WeightChart({
  entries,
  profiles,
  range,
  now,
}: {
  entries: WeightEntry[];
  profiles: Record<MemberId, Profile>;
  range: RangeDays;
  now: number;
}) {
  const datasets = (["chicken", "poopy"] as MemberId[]).map((member) => ({
    member,
    entries: lastDailyWeights(entries, member, range, now),
  }));
  const all = datasets.flatMap((dataset) => dataset.entries);

  if (!all.length) {
    return (
      <div className="chart-empty">
        <span className="sprout" aria-hidden="true">🌱</span>
        <strong>体重曲线还在等第一颗种子</strong>
        <p>记录一次体重后，两个人的变化会一起长在这里。</p>
      </div>
    );
  }

  const width = 780;
  const height = 280;
  const padding = { left: 52, right: 24, top: 24, bottom: 42 };
  const minTime = Math.min(...all.map((entry) => entry.recordedAt));
  const maxTime = Math.max(...all.map((entry) => entry.recordedAt));
  const minWeight = Math.min(...all.map((entry) => entry.weightKg));
  const maxWeight = Math.max(...all.map((entry) => entry.weightKg));
  const yMin = Math.floor((minWeight - 1) * 2) / 2;
  const yMax = Math.ceil((maxWeight + 1) * 2) / 2;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const x = (time: number) =>
    padding.left + (maxTime === minTime ? plotWidth / 2 : ((time - minTime) / (maxTime - minTime)) * plotWidth);
  const y = (weight: number) =>
    padding.top + (yMax === yMin ? plotHeight / 2 : ((yMax - weight) / (yMax - yMin)) * plotHeight);
  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4);
  const xLabels = [minTime, minTime + (maxTime - minTime) / 2, maxTime];

  return (
    <div className="chart-wrap">
      <svg className="weight-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${range}天体重变化曲线`}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} className="chart-grid" />
            <text x={padding.left - 10} y={y(tick) + 4} textAnchor="end" className="chart-axis">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        {maxTime !== minTime && xLabels.map((tick, index) => (
          <text
            key={`${tick}-${index}`}
            x={x(tick)}
            y={height - 12}
            textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
            className="chart-axis"
          >
            {formatShortDate(tick)}
          </text>
        ))}
        {datasets.map(({ member, entries: points }) => {
          const profile = profiles[member];
          const polyline = points.map((point) => `${x(point.recordedAt)},${y(point.weightKg)}`).join(" ");
          return (
            <g key={member}>
              {points.length > 1 && (
                <polyline
                  points={polyline}
                  fill="none"
                  stroke={profile.color}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="chart-line"
                />
              )}
              {points.map((point) => (
                <circle
                  key={point.id}
                  cx={x(point.recordedAt)}
                  cy={y(point.weightKg)}
                  r="6"
                  fill="#fffaf0"
                  stroke={profile.color}
                  strokeWidth="4"
                  className="chart-point"
                >
                  <title>{`${profile.name} · ${formatShortDate(point.recordedAt)} ${formatTime(point.recordedAt)} · ${point.weightKg.toFixed(1)} kg`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Avatar({ profile, size = 56 }: { profile: Profile; size?: number }) {
  return (
    <span className="avatar-frame" style={{ width: size, height: size, background: profile.pale }}>
      <img src={profile.avatar} alt={`${profile.name}的像素头像`} width={size} height={size} />
    </span>
  );
}

export default function CoupleDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [accessState, setAccessState] = useState<"checking" | "ready" | "invalid">("checking");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [range, setRange] = useState<RangeDays>(30);
  const [focus, setFocus] = useState<"mine" | "partner">("mine");
  const [modal, setModal] = useState<"weight" | "poop" | null>(null);
  const [weightDraft, setWeightDraft] = useState("");
  const [timeDraft, setTimeDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const invite = url.searchParams.get("key");
    const saved = window.localStorage.getItem(TOKEN_KEY);
    const nextToken = invite || saved;
    if (invite) {
      window.localStorage.setItem(TOKEN_KEY, invite);
      url.searchParams.delete("key");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    const stateTimer = window.setTimeout(() => {
      if (nextToken) setToken(nextToken);
      else {
        setAccessState("invalid");
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(stateTimer);
  }, []);

  const loadData = useCallback(async (currentToken: string, quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const response = await trackerRequest(currentToken, "GET");
      if (response.status === 401) {
        window.localStorage.removeItem(TOKEN_KEY);
        setAccessState("invalid");
        setData(null);
        return;
      }
      const payload = response.data as unknown as DashboardData & { error?: string };
      if (response.status < 200 || response.status >= 300) throw new Error(payload.error || "同步失败");
      setData(payload);
      setLoadError(null);
      setAccessState("ready");
    } catch (error) {
      if (!quiet) {
        const message = error instanceof Error ? error.message : "同步失败，请重试";
        setLoadError(message);
        showToast(message);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!token) return;
    const initialLoad = window.setTimeout(() => loadData(token), 0);
    const interval = window.setInterval(() => loadData(token, true), 15_000);
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") loadData(token, true);
    };
    document.addEventListener("visibilitychange", syncWhenVisible);
    window.addEventListener("focus", syncWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(initialLoad);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.removeEventListener("focus", syncWhenVisible);
    };
  }, [token, loadData]);

  const postAction = useCallback(async (payload: Record<string, unknown>, fallbackMessage: string) => {
    if (!token) {
      showToast("身份入口还没有准备好，请刷新页面后再试。");
      return false;
    }
    if (saving) return false;
    setSaving(true);
    try {
      const response = await trackerRequest(token, "POST", payload);
      const result = response.data as { error?: string; reaction?: Reaction };
      if (response.status < 200 || response.status >= 300) throw new Error(result.error || "保存失败");
      await loadData(token, true);
      showToast(result.reaction?.message || fallbackMessage);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "没有保存成功，请重试");
      return false;
    } finally {
      setSaving(false);
    }
  }, [token, saving, loadData, showToast]);

  const computed = useMemo(() => {
    if (!data) return null;
    const latestWeights = {} as Record<MemberId, WeightEntry | undefined>;
    const previousWeights = {} as Record<MemberId, WeightEntry | undefined>;
    const todayPoops = {} as Record<MemberId, PoopEntry[]>;
    const today = localDateKey(data.serverTime);

    (["chicken", "poopy"] as MemberId[]).forEach((member) => {
      const memberWeights = data.weights.filter((entry) => entry.member === member);
      latestWeights[member] = memberWeights.at(-1);
      previousWeights[member] = memberWeights.at(-2);
      todayPoops[member] = data.poops.filter(
        (entry) => entry.member === member && localDateKey(entry.occurredAt) === today,
      );
    });

    const activityKeys = new Set<string>();
    data.weights.forEach((entry) => activityKeys.add(`${entry.member}:${localDateKey(entry.recordedAt)}`));
    data.poops.forEach((entry) => activityKeys.add(`${entry.member}:${localDateKey(entry.occurredAt)}`));
    const completeDay = (key: string) =>
      activityKeys.has(`chicken:${key}`) && activityKeys.has(`poopy:${key}`);
    const todayComplete = completeDay(dayKeyAgo(data.serverTime, 0));
    let streak = 0;
    let offset = todayComplete ? 0 : 1;
    while (offset < 45 && completeDay(dayKeyAgo(data.serverTime, offset))) {
      streak += 1;
      offset += 1;
    }
    if (todayComplete) streak += 1;
    const week = Array.from({ length: 7 }, (_, index) => {
      const daysAgo = 6 - index;
      const date = new Date(data.serverTime);
      date.setDate(date.getDate() - daysAgo);
      return {
        key: dayKeyAgo(data.serverTime, daysAgo),
        label: new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date),
        complete: completeDay(dayKeyAgo(data.serverTime, daysAgo)),
        today: daysAgo === 0,
      };
    });
    return { latestWeights, previousWeights, todayPoops, streak, week };
  }, [data]);

  function openRecordModal(kind: "weight" | "poop") {
    if (!data || !computed) return;
    const latestOwn = computed.latestWeights[data.viewer];
    setWeightDraft(latestOwn ? latestOwn.weightKg.toFixed(1) : "");
    setTimeDraft(toInputDateTime());
    setModal(kind);
  }

  async function saveRecord() {
    const occurredAt = inputDateTimeToTimestamp(timeDraft);
    const success = modal === "weight"
      ? await postAction({ action: "add-weight", weightKg: Number(weightDraft), occurredAt }, "体重已经种进小农场啦！")
      : await postAction({ action: "add-poop", occurredAt }, "粑粑时间打卡成功！");
    if (success) setModal(null);
  }

  async function submitRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveRecord();
  }

  async function removeEntry(kind: "weight" | "poop", id: number | string) {
    const confirmed = window.confirm("要删除这条记录吗？");
    if (!confirmed) return;
    await postAction({ action: kind === "weight" ? "delete-weight" : "delete-poop", id }, "这条记录已经撤回啦。");
  }

  if (accessState === "invalid") {
    return (
      <main className="access-page">
        <section className="access-card pixel-panel">
          <div className="access-heart" aria-hidden="true">♥</div>
          <p className="eyebrow">秘密小农场</p>
          <h1>这里是你和伴侣的小日常</h1>
          <p>需要从属于你的专属入口进入。请让对方把那条链接重新发给你，不用注册账号。</p>
          <div className="access-farm">
            <img src="/farm-strip.webp" alt="温馨的像素农场" width={1536} height={512} />
          </div>
        </section>
      </main>
    );
  }

  if (!loading && !data && loadError) {
    return (
      <main className="access-page" role="alert">
        <section className="access-card pixel-panel">
          <div className="connection-scarecrow" aria-hidden="true">🐥</div>
          <p className="eyebrow">小农场打了个盹</p>
          <h1>这次没有连上云端</h1>
          <p>{loadError}</p>
          <button className="retry-button" type="button" onClick={() => token && loadData(token)}>
            重新连接
          </button>
          <div className="access-farm">
            <img src="/farm-strip.webp" alt="温馨的像素农场" width={1536} height={512} />
          </div>
        </section>
      </main>
    );
  }

  if (loading || !data || !computed) {
    return (
      <main className="loading-page" aria-live="polite">
        <div className="loading-chicken" aria-hidden="true">🐣</div>
        <strong>正在打开你们的小农场…</strong>
        <span>把体重秤和小马桶都叫醒</span>
      </main>
    );
  }

  const viewer = data.viewer;
  const partner: MemberId = viewer === "chicken" ? "poopy" : "chicken";
  const focusMember = focus === "mine" ? viewer : partner;
  const orderedMembers: MemberId[] = focus === "mine" ? [viewer, partner] : [partner, viewer];
  const receivedReactions = data.reactions.filter((reaction) => reaction.toMember === viewer).slice(0, 3);

  return (
    <main className={`dashboard viewer-${viewer}`}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="回到页面顶部">
          <span className="pixel-heart" aria-hidden="true">♥</span>
          <span>情侣小农场</span>
        </a>

        <div className="perspective-switch" aria-label="查看视角">
          <button className={focus === "mine" ? "active" : ""} onClick={() => setFocus("mine")}>
            <Avatar profile={data.profiles[viewer]} size={34} />
            我的田地
          </button>
          <button className={focus === "partner" ? "active" : ""} onClick={() => setFocus("partner")}>
            <Avatar profile={data.profiles[partner]} size={34} />
            看看TA
          </button>
        </div>

        <div className="sync-badge" title="页面会每15秒自动同步一次">
          <span className="sync-dot" />
          <span>小农场已同步</span>
        </div>
      </header>

      <div className="page-shell" id="top">
        <section className="hero">
          <div>
            <p className="eyebrow">今天也要认真生活</p>
            <h1>{greeting(data.profiles[viewer].name, data.serverTime)}！</h1>
            <p>今天也和{data.profiles[partner].name}一起，照顾好身体和小肚子吧。</p>
          </div>
          <div className="hero-avatar-stack" aria-label={`当前身份：${data.profiles[viewer].name}`}>
            <Avatar profile={data.profiles[partner]} size={58} />
            <Avatar profile={data.profiles[viewer]} size={68} />
            <span className="tiny-heart">♥</span>
          </div>
        </section>

        <section className="quick-actions" aria-label="快速记录">
          <button className="pixel-action weight-action" onClick={() => openRecordModal("weight")}>
            <span className="action-icon" aria-hidden="true">⚖</span>
            <span><strong>记录体重</strong><small>把今天的数字种下来</small></span>
            <span className="button-sparkle" aria-hidden="true">✦</span>
          </button>
          <button className="pixel-action poop-action" onClick={() => openRecordModal("poop")}>
            <span className="action-icon poop-emoji" aria-hidden="true">💩</span>
            <span><strong>记录粑粑</strong><small>默认记录此刻，也能改时间</small></span>
            <span className="button-sparkle" aria-hidden="true">✦</span>
          </button>
        </section>

        <section className="main-grid">
          <article className="weight-section pixel-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">体重田地</p>
                <h2>{focusMember === viewer ? "我的变化，也看看你" : `今天先看看${data.profiles[partner].name}`}</h2>
              </div>
              <div className="range-switch" aria-label="曲线时间范围">
                {([7, 30, 90] as RangeDays[]).map((value) => (
                  <button key={value} className={range === value ? "active" : ""} onClick={() => setRange(value)}>
                    {value}天
                  </button>
                ))}
              </div>
            </div>

            <div className="weight-cards">
              {orderedMembers.map((member) => {
                const profile = data.profiles[member];
                const latest = computed.latestWeights[member];
                const previous = computed.previousWeights[member];
                const delta = latest && previous ? latest.weightKg - previous.weightKg : null;
                const isMine = member === viewer;
                return (
                  <section className={`weight-card member-${member}`} key={member}>
                    <div className="weight-card-top">
                      <div className="profile-label">
                        <Avatar profile={profile} size={58} />
                        <span><strong>{profile.name}</strong><small>{isMine ? "这是我" : "我的另一半"}</small></span>
                      </div>
                      {delta !== null && (
                        <span className={`delta ${delta > 0 ? "up" : delta < 0 ? "down" : "same"}`}>
                          {delta > 0 ? "↑" : delta < 0 ? "↓" : "·"} {Math.abs(delta).toFixed(1)} kg
                        </span>
                      )}
                    </div>
                    {latest ? (
                      <div className="weight-value-row">
                        <div><strong>{latest.weightKg.toFixed(1)}</strong><span>kg</span></div>
                        <p>{formatShortDate(latest.recordedAt)} {formatTime(latest.recordedAt)}更新</p>
                      </div>
                    ) : (
                      <div className="weight-empty"><strong>还没称重</strong><span>第一条记录会从这里开始</span></div>
                    )}
                    <div className="card-controls">
                      {isMine ? (
                        latest && <button className="text-button danger" onClick={() => removeEntry("weight", latest.id)}>删掉最近一条</button>
                      ) : (
                        <>
                          <button className="reaction-button like" disabled={saving} onClick={() => postAction({ action: "react", kind: "like" }, "星星送到啦！")}>⭐ 点赞</button>
                          <button className="reaction-button tease" disabled={saving} onClick={() => postAction({ action: "react", kind: "tease" }, "轻轻嘲讽已送达！")}>💬 轻轻嘲讽</button>
                        </>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="chart-heading">
              <div className="chart-legend">
                {(["chicken", "poopy"] as MemberId[]).map((member) => (
                  <span key={member}><i style={{ background: data.profiles[member].color }} />{data.profiles[member].name}</span>
                ))}
              </div>
              <span>单位：kg</span>
            </div>
            <WeightChart entries={data.weights} profiles={data.profiles} range={range} now={data.serverTime} />
          </article>

          <aside className="side-column">
            <article className="poop-section pixel-panel">
              <div className="poop-title">
                <span className="poop-title-icon" aria-hidden="true">💩</span>
                <div><p className="eyebrow">今日粑粑状态</p><h2>小肚子播报站</h2></div>
              </div>
              <div className="poop-list">
                {orderedMembers.map((member) => {
                  const profile = data.profiles[member];
                  const entries = computed.todayPoops[member];
                  return (
                    <section className={`poop-person ${entries.length ? "done" : "waiting"}`} key={member}>
                      <Avatar profile={profile} size={52} />
                      <div className="poop-person-copy">
                        <strong>{profile.name}</strong>
                        {entries.length ? (
                          <div className="time-chips">
                            {entries.map((entry) => (
                              <span key={entry.id}>
                                {formatTime(entry.occurredAt)}
                                {member === viewer && (
                                  <button aria-label={`删除${formatTime(entry.occurredAt)}的记录`} onClick={() => removeEntry("poop", entry.id)}>×</button>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : <span className="not-yet">今天还没有</span>}
                      </div>
                      <span className="poop-status-badge">{entries.length ? `${entries.length}次 ✓` : "等待中"}</span>
                    </section>
                  );
                })}
              </div>
              <button className="poop-quick-button" onClick={() => openRecordModal("poop")}>＋ 我刚刚拉了粑粑</button>
            </article>

            <article className="echo-section pixel-panel">
              <div className="echo-heading"><span aria-hidden="true">📮</span><div><p className="eyebrow">TA的回声</p><h2>给我的小纸条</h2></div></div>
              {receivedReactions.length ? (
                <div className="echo-list">
                  {receivedReactions.map((reaction) => (
                    <div className={`echo-item ${reaction.kind}`} key={reaction.id}>
                      <span>{reaction.kind === "like" ? "⭐" : "💬"}</span>
                      <div><strong>{data.profiles[reaction.fromMember].name}</strong><p>{reaction.message}</p><small>{formatShortDate(reaction.createdAt)} {formatTime(reaction.createdAt)}</small></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="echo-empty"><span>💌</span><p>还没有新纸条，先去给TA一颗星星吧。</p></div>
              )}
            </article>
          </aside>
        </section>

        <section className="streak-section pixel-panel">
          <div className="streak-copy">
            <span className="calendar-icon" aria-hidden="true">▦</span>
            <div><p>双人连续打卡</p><strong>{computed.streak}<small>天</small></strong></div>
          </div>
          <div className="week-track">
            {computed.week.map((day) => (
              <div className={`day-star ${day.complete ? "complete" : ""} ${day.today ? "today" : ""}`} key={day.key}>
                <span>{day.complete ? "★" : "☆"}</span><small>{day.label}</small>
              </div>
            ))}
          </div>
          <div className="farm-strip">
            <img src="/farm-strip.webp" alt="两个人一起经营的温馨像素农场" width={1536} height={512} />
          </div>
        </section>

        <footer>
          <span>♥</span> 情侣小农场 · 数据每15秒自动同步
        </footer>
      </div>

      <nav className="mobile-actions" aria-label="快速记录">
        <button onClick={() => openRecordModal("weight")}><span>⚖</span>体重</button>
        <button onClick={() => openRecordModal("poop")}><span>💩</span>粑粑</button>
      </nav>

      {modal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <section className="record-modal pixel-panel" role="dialog" aria-modal="true" aria-labelledby="record-title">
            <button className="modal-close" aria-label="关闭" onClick={() => setModal(null)}>×</button>
            <span className="modal-icon" aria-hidden="true">{modal === "weight" ? "⚖" : "💩"}</span>
            <p className="eyebrow">{data.profiles[viewer].name}的记录</p>
            <h2 id="record-title">{modal === "weight" ? "种下一颗体重种子" : "报告一次粑粑时间"}</h2>
            <form onSubmit={submitRecord}>
              {modal === "weight" && (
                <label>
                  <span>体重（kg）</span>
                  <div className="weight-input-wrap">
                    <input
                      autoFocus
                      required
                      inputMode="decimal"
                      type="number"
                      min="25"
                      max="250"
                      step="0.1"
                      value={weightDraft}
                      onChange={(event) => setWeightDraft(event.target.value)}
                      placeholder="例如 68.4"
                    />
                    <b>kg</b>
                  </div>
                </label>
              )}
              <label>
                <span>{modal === "weight" ? "称重时间" : "粑粑时间"}</span>
                <input required type="datetime-local" value={timeDraft} onChange={(event) => setTimeDraft(event.target.value)} />
              </label>
              <button
                className={`save-button ${modal}`}
                type="button"
                disabled={saving || !timeDraft || (modal === "weight" && !weightDraft)}
                onClick={saveRecord}
              >
                {saving ? "正在保存…" : modal === "weight" ? "保存这次体重" : "完成粑粑打卡"}
              </button>
            </form>
            <p className="modal-note">如果刚刚点错了，保存后也可以删除。</p>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status"><span>✦</span>{toast}</div>}
    </main>
  );
}
