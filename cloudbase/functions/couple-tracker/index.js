/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require("node:crypto");
const cloudbase = require("@cloudbase/node-sdk");
const wxCloud = require("wx-server-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
wxCloud.init({ env: wxCloud.DYNAMIC_CURRENT_ENV });
const db = app.database();
const command = db.command;
const DAY = 24 * 60 * 60 * 1000;
const INVITE_LIFETIME = DAY;
const SESSION_LIFETIME = 30 * DAY;
const LOGIN_LOCK_TIME = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const COLLECTIONS = [
  "accounts",
  "sessions",
  "users",
  "couples",
  "couple_invites",
  "weight_entries",
  "poop_entries",
  "reactions",
  "anniversaries",
  "community_posts",
  "community_comments",
  "community_reactions",
  "community_follows",
  "community_reports",
  "community_blocks",
  "together_options",
  "together_decisions",
  "daily_checkins",
  "daily_answers",
  "membership_waitlist",
  "shared_memos",
  "notification_subscriptions",
  "notification_deliveries",
  "in_app_notifications",
  "content_moderations",
  "daily_sparks",
  "villages",
  "village_members",
  "village_invites",
];

const avatarChoices = [
  "🐣", "🐰", "🐻", "🐼", "🐱", "🐶", "🦊", "🐸",
  "🐹", "🐨", "🐯", "🦁", "🐮", "🐷", "🐵", "🐧",
  "🦄", "🦋", "🐝", "🐙", "🦖", "🌻", "🍓", "🍑",
];
const colorChoices = ["#7457ff", "#ef5b8f", "#148bc8", "#2f9e62", "#d97706", "#b453c6"];
const anniversaryIcons = ["💞", "🎂", "🌱", "✨", "🏠", "🎉"];
const communityTopics = ["daily", "question", "milestone", "fun"];
const communityStatKeys = ["togetherDays", "weeklyJointDays", "weeklyCheers", "farmVitality"];
const communityPrompts = [
  "最近一次被对方可爱到，是什么时候？",
  "如果今天一起放假，最想去哪里？",
  "分享一个只有你们俩懂的小暗号。",
  "对方最近做的哪件小事让你很暖？",
  "你们最想一起养成什么新习惯？",
  "第一次见面时，对方给你的印象是什么？",
  "给未来一年的你们留一句话吧。",
  "最近一起吃到最好吃的东西是什么？",
  "如果给你们的关系取一首歌名，会是什么？",
  "今天想认真夸对方哪一点？",
];
const togetherPrompts = [
  { text: "周末更想怎么过？", a: "出门逛逛", b: "宅家充电" },
  { text: "约会时更看重什么？", a: "好吃最重要", b: "氛围最重要" },
  { text: "突然多出一天假期？", a: "短途出发", b: "睡到自然醒" },
  { text: "收到惊喜更喜欢哪种？", a: "有用的小礼物", b: "用心的小安排" },
  { text: "今晚的快乐来源？", a: "一起吃好吃的", b: "一起看点什么" },
  { text: "发生小分歧时更希望？", a: "当场说清楚", b: "冷静后再聊" },
  { text: "旅行时你是哪一派？", a: "计划得明明白白", b: "走到哪玩到哪" },
  { text: "想一起养成哪个习惯？", a: "早点睡觉", b: "经常运动" },
  { text: "更心动的纪念方式？", a: "拍照留念", b: "写一段话" },
  { text: "今天更需要对方给你？", a: "一个抱抱", b: "一点独处空间" },
  { text: "一起做饭时你想负责？", a: "掌勺发挥", b: "洗切收尾" },
  { text: "下次约会想试试？", a: "没去过的新店", b: "熟悉的宝藏店" },
];
const moodLabels = ["有点低落", "需要抱抱", "普普通通", "心情不错", "开心冒泡"];
const decisionModes = ["classic", "fresh", "budget"];
const optionBudgets = ["¥", "¥¥", "¥¥¥"];
const sharedMemoKinds = ["memo", "task", "event"];
const sharedMemoCategories = ["daily", "date", "home", "shopping", "important", "other"];
const sharedMemoRecurrences = ["none", "daily", "weekly", "monthly"];
const notificationTemplateKeys = ["shared_memo", "partner_activity", "health_reminder", "anniversary"];
const WECHAT_MEMO_TEMPLATE_ID = "7yUYdsTH-aJGkSxaFaMu7LLxkGTChtD6WoJVg6LGcuE";
const notificationPreferenceKeys = ["health", "interaction", "tasks", "rituals", "village"];
const notificationPreferenceByType = {
  weight: "health",
  poop: "health",
  health_reminder: "health",
  anniversary_reminder: "rituals",
  reaction: "interaction",
  nudge: "interaction",
  memo_created: "tasks",
  memo_completed: "tasks",
  decision_created: "tasks",
  decision_resolved: "tasks",
  mood_checkin: "rituals",
  daily_answer: "rituals",
  spark_completed: "rituals",
  village_like: "village",
  village_comment: "village",
};
const dailySparkPrompts = [
  { icon: "💬", title: "认真夸对方一句", detail: "不要只说好看，夸一件今天具体的小事。" },
  { icon: "📷", title: "交换今天的一张照片", detail: "天空、晚饭或路边的小花都可以。" },
  { icon: "🤗", title: "送出一个 20 秒抱抱", detail: "如果不在身边，就发一条认真想念的信息。" },
  { icon: "🚶", title: "一起散步 10 分钟", detail: "边走边聊，十分钟里先不看手机。" },
  { icon: "🎵", title: "分享一首今天的歌", detail: "告诉对方，哪一句最像你此刻的心情。" },
  { icon: "🍜", title: "一起决定下一顿吃什么", detail: "各提一个候选，再用“相伴”里的抽签决定。" },
  { icon: "🫶", title: "问一句“今天累不累”", detail: "先听完，不急着替对方解决问题。" },
  { icon: "✨", title: "回忆一个共同的瞬间", detail: "说说当时你最喜欢对方的哪个细节。" },
  { icon: "🧹", title: "替对方完成一件小事", detail: "收拾桌面、带杯水，越小越容易坚持。" },
  { icon: "🌙", title: "约好今晚的睡觉时间", detail: "互相催促早点休息，明天精神更好。" },
  { icon: "📝", title: "写下一件共同期待", detail: "放进小本本，给未来的约会留个位置。" },
  { icon: "😄", title: "讲一件今天的好笑小事", detail: "让对方知道你今天经历了什么。" },
];
const defaultNotificationPreferences = {
  inApp: true,
  wechat: true,
  quietHours: { enabled: true, start: "23:00", end: "08:00" },
  events: {
    health: true,
    interaction: true,
    tasks: true,
    rituals: true,
    village: true,
  },
};
const activityPushCooldowns = {
  weight: 30 * 60 * 1000,
  poop: 60 * 60 * 1000,
  reaction: 5 * 60 * 1000,
  nudge: 15 * 60 * 1000,
  memo_created: 5 * 60 * 1000,
  memo_completed: 5 * 60 * 1000,
  decision_created: 5 * 60 * 1000,
  decision_resolved: 5 * 60 * 1000,
  mood_checkin: 30 * 60 * 1000,
  daily_answer: 30 * 60 * 1000,
};
const nudgePresets = {
  weight: { icon: "⚖️", title: "称重小提醒", body: "体重秤在等你来打卡啦" },
  poop: { icon: "🚽", title: "记录小提醒", body: "今天的如厕记录别忘啦" },
  task: { icon: "✅", title: "待办小提醒", body: "共同小本本里还有事情等你" },
  water: { icon: "🥤", title: "喝水小提醒", body: "先喝口水，再继续忙吧" },
  rest: { icon: "🌙", title: "休息小提醒", body: "别太累啦，记得早点休息" },
  hug: { icon: "🤗", title: "抱抱派送中", body: "你的伴侣给你送来一个抱抱" },
};
const VILLAGE_MEMBER_LIMIT = 24;
const FOUNDER_TRIAL_DAYS = 7;
const praiseMessages = [
  "今天也很棒，奖励一颗星星！",
  "稳稳记录的人最厉害啦。",
  "给认真生活的你点个赞！",
];
const teaseMessages = [
  "田地小喇叭：快来打卡啦！",
  "体重秤和小马桶都等困了。",
  "今日份轻轻嘲讽已经送达！",
];
const defaultReminderSettings = {
  weight: { enabled: false, time: "08:00", days: [0, 1, 2, 3, 4, 5, 6] },
  poop: { enabled: false, time: "20:30", days: [0, 1, 2, 3, 4, 5, 6] },
  anniversary: { enabled: true, advanceDays: [7, 1, 0] },
};

function normalizeNotificationPreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  const quietHours = source.quietHours && typeof source.quietHours === "object" ? source.quietHours : {};
  const events = source.events && typeof source.events === "object" ? source.events : {};
  const normalizedEvents = {};
  for (const key of notificationPreferenceKeys) {
    normalizedEvents[key] = events[key] !== false;
  }
  return {
    inApp: source.inApp !== false,
    wechat: source.wechat !== false,
    quietHours: {
      enabled: quietHours.enabled !== false,
      start: normalizeClockTime(quietHours.start, defaultNotificationPreferences.quietHours.start),
      end: normalizeClockTime(quietHours.end, defaultNotificationPreferences.quietHours.end),
    },
    events: normalizedEvents,
  };
}

function response(status, data) {
  return { status, data };
}

function jsonError(message, status = 400, code = "BAD_REQUEST") {
  return response(status, { error: message, code });
}

function cleanText(value, maximum = 24) {
  return String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maximum);
}

function parseOccurrence(value) {
  const timestamp = typeof value === "number" ? value : Number(value);
  const now = Date.now();
  if (!Number.isFinite(timestamp)) return null;
  if (timestamp > now + 5 * 60 * 1000 || timestamp < now - 30 * DAY) return null;
  return Math.round(timestamp);
}

function parseSharedDueAt(value, required = false) {
  if (value === null || value === undefined || value === "") return required ? null : undefined;
  const timestamp = Number(value);
  const now = Date.now();
  if (!Number.isFinite(timestamp)) return null;
  if (timestamp < now - 5 * 365 * DAY || timestamp > now + 10 * 365 * DAY) return null;
  return Math.round(timestamp);
}

function parseDateString(value, allowFuture = true) {
  const date = cleanText(value, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    year < 1900
    || year > 2100
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null;
  if (!allowFuture && timestamp > Date.now() + DAY) return null;
  return date;
}

function normalizeClockTime(value, fallback) {
  const time = cleanText(value, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback;
}

function normalizeWeekdays(value) {
  if (!Array.isArray(value)) return [...defaultReminderSettings.weight.days];
  const days = [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  return days.length ? days.sort((left, right) => left - right) : [...defaultReminderSettings.weight.days];
}

function normalizeAdvanceDays(value) {
  if (!Array.isArray(value)) return [...defaultReminderSettings.anniversary.advanceDays];
  const days = [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 30))];
  return days.length ? days.sort((left, right) => right - left) : [...defaultReminderSettings.anniversary.advanceDays];
}

function normalizeReminderSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const weight = source.weight && typeof source.weight === "object" ? source.weight : {};
  const poop = source.poop && typeof source.poop === "object" ? source.poop : {};
  const anniversary = source.anniversary && typeof source.anniversary === "object" ? source.anniversary : {};
  return {
    weight: {
      enabled: Boolean(weight.enabled),
      time: normalizeClockTime(weight.time, defaultReminderSettings.weight.time),
      days: normalizeWeekdays(weight.days),
    },
    poop: {
      enabled: Boolean(poop.enabled),
      time: normalizeClockTime(poop.time, defaultReminderSettings.poop.time),
      days: normalizeWeekdays(poop.days),
    },
    anniversary: {
      enabled: anniversary.enabled !== false,
      advanceDays: normalizeAdvanceDays(anniversary.advanceDays),
    },
  };
}

function cleanCommunityText(value, maximum = 300) {
  return String(value || "")
    .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maximum);
}

function normalizePublicStats(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 32)).filter((item) => communityStatKeys.includes(item)))];
}

function normalizeCommunitySettings(couple) {
  return {
    enabled: Boolean(couple && couple.communityEnabled),
    bio: cleanCommunityText(couple && couple.communityBio, 80),
    publicStats: normalizePublicStats(couple && couple.communityPublicStats),
  };
}

function membershipState(couple, now = Date.now()) {
  const paidUntil = Number(couple && couple.membershipUntil) || 0;
  const trialUntil = Number(couple && couple.founderTrialUntil) || 0;
  const activeUntil = Math.max(paidUntil, trialUntil);
  const active = activeUntil > now;
  return {
    plan: active ? "plus" : "free",
    source: paidUntil > now ? "paid" : trialUntil > now ? "founder_trial" : "free",
    activeUntil: active ? activeUntil : null,
    trialAvailable: !couple?.founderTrialClaimedAt,
    waitlisted: Boolean(couple?.membershipWaitlistedAt),
    limits: {
      activeRestaurantOptions: active ? 50 : 8,
      decisionHistoryDays: active ? 180 : 14,
    },
  };
}

function membershipCatalog(couple) {
  return {
    current: membershipState(couple),
    productName: "心动会员",
    suggestedPrices: {
      monthly: 600,
      yearly: 4800,
      currency: "CNY",
    },
    features: [
      "餐厅候选池扩展到 50 个",
      "避开近期与按预算抽签",
      "180 天共同决定历史",
      "关系月报与会员主题（后续开放）",
    ],
    paymentReady: false,
    paymentNote: "微信支付商户接入完成后开放；当前可领取内测体验或登记首发优惠。",
  };
}

function normalizeBudget(value) {
  const budget = cleanText(value, 4);
  return optionBudgets.includes(budget) ? budget : "¥¥";
}

function publicTogetherOption(option) {
  return {
    id: option.id,
    label: cleanText(option.label, 20),
    cuisine: cleanText(option.cuisine, 10),
    budget: normalizeBudget(option.budget),
    note: cleanText(option.note, 30),
    createdBy: option.createdBy,
    createdAt: option.createdAt,
  };
}

function publicDecision(decision) {
  return {
    id: decision.id,
    optionId: decision.optionId,
    optionLabel: cleanText(decision.optionLabel, 20),
    cuisine: cleanText(decision.cuisine, 10),
    budget: normalizeBudget(decision.budget),
    mode: decisionModes.includes(decision.mode) ? decision.mode : "classic",
    status: ["pending", "confirmed", "vetoed"].includes(decision.status) ? decision.status : "pending",
    createdBy: decision.createdBy,
    confirmedByUids: Array.isArray(decision.confirmedByUids) ? decision.confirmedByUids.slice(0, 2) : [],
    vetoedBy: decision.vetoedBy || null,
    createdAt: decision.createdAt,
    updatedAt: decision.updatedAt || decision.createdAt,
  };
}

function normalizeAvatarFileId(value, uid, root = "avatars") {
  const fileId = cleanText(value, 512);
  if (!fileId) return null;
  const expectedPath = `/${root}/${uid}/`;
  if (!fileId.startsWith("cloud://") || !fileId.includes(expectedPath)) return undefined;
  return fileId;
}

function contentCheckStatus(result, allowSuccessWithoutSuggestion = false) {
  const payload = result && result.result && typeof result.result === "object" ? result.result : result;
  if (!payload || typeof payload !== "object") return "unavailable";
  const rawErrorCode = payload.errCode ?? payload.errcode ?? result.errCode ?? result.errcode;
  const errorCode = rawErrorCode === undefined ? null : Number(rawErrorCode);
  if (errorCode !== null && (!Number.isFinite(errorCode) || errorCode !== 0)) return "unavailable";
  const suggestion = cleanText(payload.suggest || result.suggest, 32).toLowerCase();
  if (suggestion) return suggestion === "pass" ? "pass" : "reject";
  const message = cleanText(payload.errMsg || payload.errmsg || result.errMsg || result.errmsg, 128).toLowerCase();
  if (allowSuccessWithoutSuggestion && (errorCode === 0 || /(^|:)ok$/.test(message))) return "pass";
  return "unavailable";
}

async function checkTextSafety(content, requestContext) {
  if (!requestContext || requestContext.channel !== "mini" || !requestContext.platformCaller.openId) {
    return jsonError("社区发布目前只支持微信小程序。", 403, "MINI_ONLY");
  }
  try {
    const result = await wxCloud.openapi.security.msgSecCheck({
      content,
      version: 2,
      scene: 2,
      openid: requestContext.platformCaller.openId,
    });
    const status = contentCheckStatus(result);
    if (status === "reject") {
      return jsonError("你发布的内容含违规信息。", 422, "CONTENT_UNSAFE");
    }
    if (status !== "pass") return jsonError("内容安全检查暂时没有响应，请稍后再试。", 503, "CONTENT_CHECK_UNAVAILABLE");
    return null;
  } catch (error) {
    console.error("Text safety check failed", error);
    return jsonError("内容安全检查暂时没有响应，请稍后再试。", 503, "CONTENT_CHECK_UNAVAILABLE");
  }
}

async function checkImageSafety(fileId, requestContext) {
  if (!requestContext || requestContext.channel !== "mini" || !requestContext.platformCaller.openId) {
    return jsonError("图片上传目前只支持微信小程序。", 403, "MINI_ONLY");
  }
  try {
    const downloaded = await wxCloud.downloadFile({ fileID: fileId });
    const fileContent = Buffer.from(downloaded.fileContent || []);
    if (!fileContent.length || fileContent.length > 1024 * 1024) {
      return jsonError("图片需要小于 1MB，请压缩后再试。", 413, "IMAGE_TOO_LARGE");
    }
    const isPng = fileContent.length >= 8
      && fileContent[0] === 0x89 && fileContent[1] === 0x50
      && fileContent[2] === 0x4e && fileContent[3] === 0x47;
    const isJpeg = fileContent.length >= 3
      && fileContent[0] === 0xff && fileContent[1] === 0xd8 && fileContent[2] === 0xff;
    if (!isPng && !isJpeg) {
      return jsonError("目前只支持 JPG 或 PNG 图片。", 415, "IMAGE_FORMAT_INVALID");
    }
    const result = await wxCloud.openapi.security.imgSecCheck({
      media: {
        contentType: isPng ? "image/png" : "image/jpeg",
        value: fileContent,
      },
    });
    const status = contentCheckStatus(result, true);
    if (status === "reject") {
      return jsonError("你发布的内容含违规信息。", 422, "IMAGE_UNSAFE");
    }
    if (status !== "pass") return jsonError("图片安全检查暂时没有响应，请稍后再试。", 503, "IMAGE_CHECK_UNAVAILABLE");
    return null;
  } catch (error) {
    console.error("Image safety check failed", error);
    return jsonError("图片安全检查暂时没有响应，请稍后再试。", 503, "IMAGE_CHECK_UNAVAILABLE");
  }
}

async function removeUploadedFile(fileId) {
  if (!fileId || typeof wxCloud.deleteFile !== "function") return;
  try {
    await wxCloud.deleteFile({ fileList: [fileId] });
  } catch (error) {
    console.warn("Uploaded file cleanup failed", { fileId, error });
  }
}

function shouldDiscardRejectedImage(result) {
  const code = result && result.data && result.data.code;
  return ["IMAGE_UNSAFE", "IMAGE_TOO_LARGE", "IMAGE_FORMAT_INVALID"].includes(code);
}

async function checkMiniPublishedText(content, requestContext) {
  const normalized = cleanCommunityText(content, 500);
  if (!normalized || requestContext?.channel !== "mini") return null;
  return checkTextSafety(normalized, requestContext);
}

function moderationDocumentId(fileId) {
  return `moderation_${sha256(fileId).slice(0, 48)}`;
}

async function ensureImageModerated(user, fileId, kind, requestContext) {
  const id = moderationDocumentId(fileId);
  const existing = await getDocument("content_moderations", id);
  if (
    existing
    && existing.ownerUid === user.uid
    && existing.fileId === fileId
    && existing.status === "pass"
  ) return null;

  const imageError = await checkImageSafety(fileId, requestContext);
  if (imageError) {
    if (shouldDiscardRejectedImage(imageError)) await removeUploadedFile(fileId);
    await setDocument("content_moderations", id, {
      ownerUid: user.uid,
      fileId,
      kind: cleanText(kind, 24),
      status: imageError.data?.code === "IMAGE_UNSAFE" ? "reject" : "error",
      resultCode: cleanText(imageError.data?.code, 48),
      scannedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return imageError;
  }

  const now = Date.now();
  await setDocument("content_moderations", id, {
    ownerUid: user.uid,
    fileId,
    kind: cleanText(kind, 24),
    status: "pass",
    scannedAt: now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  return null;
}

async function moderateUpload(user, payload, requestContext) {
  const kind = payload.kind === "avatar" ? "avatar" : payload.kind === "community" ? "community" : null;
  if (!kind) return jsonError("没有认出图片使用场景。", 400, "MODERATION_KIND_INVALID");
  const root = kind === "avatar" ? "avatars" : "community";
  const fileId = normalizeAvatarFileId(payload.fileId, user.uid, root);
  if (!fileId) return jsonError("图片文件地址不正确，请重新选择。", 400, "IMAGE_FILE_INVALID");
  const safetyError = await ensureImageModerated(user, fileId, kind, requestContext);
  if (safetyError) return safetyError;
  return response(200, { ok: true, status: "pass", fileId });
}

function currentCommunityPrompt(now = Date.now()) {
  const index = Math.floor(now / DAY) % communityPrompts.length;
  return { id: `prompt-${Math.floor(now / DAY)}`, text: communityPrompts[index] };
}

function randomMessage(kind) {
  const choices = kind === "like" ? praiseMessages : teaseMessages;
  return choices[Math.floor(Math.random() * choices.length)];
}

function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString("hex");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString("hex");
}

function safeEqualHex(left, right) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(String(left), "hex");
  const rightBuffer = Buffer.from(String(right), "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeUsername(value) {
  return cleanText(value, 24).toLowerCase();
}

function validateCredentials(username, password) {
  if (!/^[a-z][a-z0-9_-]{2,23}$/i.test(username)) {
    return "账号需要 3 到 24 位，以字母开头，只能包含字母、数字、下划线或短横线。";
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 64) {
    return "密码需要 8 到 64 位。";
  }
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
    return "密码需要同时包含字母和数字。";
  }
  return null;
}

function accountId(username) {
  return `account_${sha256(username)}`;
}

function sessionId(token) {
  return `session_${sha256(token)}`;
}

function recoveryHash(code) {
  return sha256(String(code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase());
}

function randomInviteCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function stableChoice(uid, choices) {
  const digest = crypto.createHash("sha256").update(uid).digest();
  return choices[digest[0] % choices.length];
}

function isMissingCollection(error) {
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  return /collection.*not.*exist|DATABASE_COLLECTION_NOT_EXIST|-502005/i.test(message);
}

function isExistingCollection(error) {
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  return /collection.*already.*exist|DATABASE_COLLECTION_EXIST|-502002/i.test(message);
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get();
  } catch (error) {
    if (!isMissingCollection(error)) throw error;
    if (typeof db.createCollection !== "function") throw error;
    try {
      await db.createCollection(name);
    } catch (createError) {
      if (!isExistingCollection(createError)) throw createError;
    }
  }
}

let schemaReady;

async function prepareCollections() {
  for (const name of COLLECTIONS) await ensureCollection(name);
}

function ensureCollections() {
  if (!schemaReady) {
    schemaReady = prepareCollections().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

function normalizeDocument(document) {
  if (!document) return null;
  const fields = { ...document };
  const id = fields._id;
  delete fields._id;
  delete fields._openid;
  return { id, ...fields };
}

async function getDocument(name, id) {
  const result = await db.collection(name).doc(String(id)).get();
  const document = Array.isArray(result.data) ? result.data[0] : result.data;
  return normalizeDocument(document);
}

async function setDocument(name, id, fields) {
  await db.collection(name).doc(String(id)).set(fields);
  return { id: String(id), ...fields };
}

async function updateDocument(name, id, fields) {
  await db.collection(name).doc(String(id)).update(fields);
  const document = await getDocument(name, id);
  return document || { id: String(id), ...fields };
}

async function addDocument(name, fields) {
  const result = await db.collection(name).add(fields);
  const id = result.id || result._id || (Array.isArray(result.ids) ? result.ids[0] : undefined);
  return { id, ...fields };
}

async function queryAll(name, condition, orders, maximum = 500) {
  const documents = [];
  while (documents.length < maximum) {
    let query = db.collection(name);
    if (condition && Object.keys(condition).length > 0) query = query.where(condition);
    for (const [field, direction] of orders) query = query.orderBy(field, direction);
    const pageSize = Math.min(100, maximum - documents.length);
    const result = await query.skip(documents.length).limit(pageSize).get();
    const page = Array.isArray(result.data) ? result.data : [];
    documents.push(...page);
    if (page.length < pageSize) break;
  }
  return documents.map(normalizeDocument).filter(Boolean);
}

function errorDetails(error) {
  return {
    name: cleanText(error?.name || "Error", 64),
    message: cleanText(error?.message || error?.errMsg || String(error || "Unknown error"), 240),
    code: cleanText(error?.code || error?.errCode || "", 64) || null,
  };
}

async function bestEffortQuery(name, condition, orders, maximum, warnings, stage) {
  try {
    return await queryAll(name, condition, orders, maximum);
  } catch (error) {
    const warning = cleanText(stage || name, 48);
    warnings.push(warning);
    console.warn("community feed partial query", { stage: warning, ...errorDetails(error) });
    return [];
  }
}

function getPlatformCaller() {
  try {
    const userInfo = app.auth().getUserInfo() || {};
    const uid = cleanText(userInfo.uid || userInfo.openId || userInfo.openid, 128);
    if (!uid) return null;
    return {
      uid,
      openId: cleanText(userInfo.openId || userInfo.openid, 128) || null,
      appId: cleanText(userInfo.appId, 128) || null,
    };
  } catch (error) {
    console.error("Unable to read CloudBase caller identity", error);
    return null;
  }
}

function publicUser(user, includePrivate = false) {
  if (!user) return null;
  const result = {
    uid: user.uid,
    nickname: user.nickname,
    avatar: user.avatar,
    avatarFileId: cleanText(user.avatarFileId, 512) || null,
    color: user.color,
    profileComplete: Boolean(user.profileComplete),
    coupleId: user.coupleId || null,
    createdAt: user.createdAt,
  };
  if (includePrivate) {
    result.reminders = normalizeReminderSettings(user.reminders);
    result.notificationPreferences = normalizeNotificationPreferences(user.notificationPreferences);
  }
  return result;
}

function publicCouple(couple) {
  if (!couple) return null;
  return {
    id: couple.id,
    farmName: cleanText(couple.farmName, 16) || "我们俩的小田地",
    togetherSince: parseDateString(couple.togetherSince, false),
    createdAt: couple.createdAt,
    updatedAt: couple.updatedAt || couple.createdAt,
    updatedBy: couple.updatedBy || null,
    community: normalizeCommunitySettings(couple),
    membership: membershipState(couple),
  };
}

function weeklyCouplePulse(couple, weights, poops, reactions, memos, now = Date.now()) {
  const since = now - 7 * DAY;
  const activityDays = new Map(couple.memberUids.map((uid) => [uid, new Set()]));
  for (const item of weights) {
    if (Number(item.recordedAt) >= since && activityDays.has(item.ownerUid)) {
      activityDays.get(item.ownerUid).add(dateKeyUtc(item.recordedAt));
    }
  }
  for (const item of poops) {
    if (Number(item.occurredAt) >= since && activityDays.has(item.ownerUid)) {
      activityDays.get(item.ownerUid).add(dateKeyUtc(item.occurredAt));
    }
  }
  const [firstDays = new Set(), secondDays = new Set()] = [...activityDays.values()];
  const jointDays = [...firstDays].filter((day) => secondDays.has(day)).length;
  const cheers = reactions.filter((item) => Number(item.createdAt) >= since).length;
  const completedTasks = memos.filter((item) => (
    item.status === "completed" && Number(item.completedAt) >= since
  )).length;
  const score = Math.min(100, jointDays * 12 + Math.min(cheers, 10) * 3 + Math.min(completedTasks, 6) * 7);
  const suggestion = jointDays === 0
    ? "今天一起完成一次小打卡，点亮本周第一格。"
    : cheers === 0
      ? "给对方送个赞或抱抱，让记录也有回应。"
      : completedTasks === 0
        ? "在共同小本本完成一件小事，本周会更有成就感。"
        : "你们这周配合得不错，继续保持这份小默契。";
  return { jointDays, cheers, completedTasks, score, suggestion };
}

async function getOrCreateUser(identity) {
  let user = await getDocument("users", identity.uid);
  if (user) return user;

  const now = Date.now();
  const fields = {
    uid: identity.uid,
    nickname: "田地新朋友",
    avatar: stableChoice(identity.uid, avatarChoices),
    avatarFileId: null,
    color: stableChoice(`${identity.uid}:color`, colorChoices),
    profileComplete: false,
    coupleId: null,
    authProvider: identity.authProvider || "password",
    reminders: normalizeReminderSettings(),
    notificationPreferences: normalizeNotificationPreferences(),
    createdAt: now,
    updatedAt: now,
  };
  user = await setDocument("users", identity.uid, fields);
  return user;
}

async function createSession(uid, platformCaller) {
  const token = randomId(32);
  const now = Date.now();
  await setDocument("sessions", sessionId(token), {
    uid,
    platformUidHash: sha256(platformCaller.uid),
    createdAt: now,
    lastUsedAt: now,
    expiresAt: now + SESSION_LIFETIME,
    revokedAt: null,
  });
  return token;
}

async function resolveSession(token, platformCaller) {
  const rawToken = cleanText(token, 128);
  if (!/^[a-f0-9]{64}$/.test(rawToken)) return null;
  const session = await getDocument("sessions", sessionId(rawToken));
  if (!session || session.revokedAt || session.expiresAt < Date.now()) return null;
  if (session.platformUidHash !== sha256(platformCaller.uid)) {
    // A copied token may be used on another browser, but only after an explicit
    // password login on that browser creates a fresh session. This limits damage
    // from tokens accidentally copied out of local storage.
    return null;
  }
  if (Date.now() - session.lastUsedAt > DAY) {
    await updateDocument("sessions", session.id, { lastUsedAt: Date.now() });
  }
  return { uid: session.uid, authProvider: "password", session };
}

async function revokeUserSessions(uid) {
  const sessions = await queryAll("sessions", { uid }, [], 100);
  await Promise.all(sessions.map((session) => updateDocument("sessions", session.id, {
    revokedAt: Date.now(),
  })));
}

async function registerAccount(platformCaller, payload) {
  const username = normalizeUsername(payload.username);
  const password = typeof payload.password === "string" ? payload.password : "";
  const validationError = validateCredentials(username, password);
  if (validationError) return jsonError(validationError, 400, "CREDENTIALS_INVALID");
  const id = accountId(username);
  if (await getDocument("accounts", id)) {
    return jsonError("这个账号已经被注册了，直接登录即可。", 409, "USERNAME_TAKEN");
  }

  const now = Date.now();
  const uid = `acct_${randomId(16)}`;
  const salt = randomId(16);
  const recoveryCode = `${randomInviteCode()}-${randomInviteCode()}`;
  await setDocument("accounts", id, {
    username,
    uid,
    passwordSalt: salt,
    passwordHash: passwordHash(password, salt),
    recoveryHash: recoveryHash(recoveryCode),
    failedAttempts: 0,
    lockUntil: null,
    createdAt: now,
    updatedAt: now,
  });
  const user = await getOrCreateUser({ uid, authProvider: "password" });
  const sessionToken = await createSession(uid, platformCaller);
  return response(201, {
    sessionToken,
    recoveryCode,
    viewer: publicUser(user, true),
  });
}

async function loginAccount(platformCaller, payload) {
  const username = normalizeUsername(payload.username);
  const password = typeof payload.password === "string" ? payload.password : "";
  const id = accountId(username);
  const account = await getDocument("accounts", id);
  const now = Date.now();

  // Always perform a scrypt calculation so unknown accounts and wrong passwords
  // take a comparable amount of time.
  const salt = account ? account.passwordSalt : "00000000000000000000000000000000";
  const actualHash = passwordHash(password, salt);
  if (account && account.lockUntil && account.lockUntil > now) {
    return jsonError("连续输错次数太多，请 15 分钟后再试。", 429, "LOGIN_LOCKED");
  }
  if (!account || !safeEqualHex(actualHash, account.passwordHash)) {
    if (account) {
      const failedAttempts = Number(account.failedAttempts || 0) + 1;
      await updateDocument("accounts", id, {
        failedAttempts,
        lockUntil: failedAttempts >= MAX_LOGIN_FAILURES ? now + LOGIN_LOCK_TIME : null,
        updatedAt: now,
      });
    }
    return jsonError("账号或密码不正确。", 401, "LOGIN_FAILED");
  }

  await updateDocument("accounts", id, { failedAttempts: 0, lockUntil: null, updatedAt: now });
  const user = await getOrCreateUser({ uid: account.uid, authProvider: "password" });
  const sessionToken = await createSession(account.uid, platformCaller);
  return response(200, { sessionToken, viewer: publicUser(user, true) });
}

async function recoverAccount(platformCaller, payload) {
  const username = normalizeUsername(payload.username);
  const recoveryCode = cleanText(payload.recoveryCode, 32);
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
  const validationError = validateCredentials(username, newPassword);
  if (validationError) return jsonError(validationError, 400, "CREDENTIALS_INVALID");
  const id = accountId(username);
  const account = await getDocument("accounts", id);
  if (!account || !safeEqualHex(recoveryHash(recoveryCode), account.recoveryHash)) {
    return jsonError("账号或恢复码不正确。", 401, "RECOVERY_FAILED");
  }
  const salt = randomId(16);
  await updateDocument("accounts", id, {
    passwordSalt: salt,
    passwordHash: passwordHash(newPassword, salt),
    failedAttempts: 0,
    lockUntil: null,
    updatedAt: Date.now(),
  });
  await revokeUserSessions(account.uid);
  const sessionToken = await createSession(account.uid, platformCaller);
  const user = await getOrCreateUser({ uid: account.uid, authProvider: "password" });
  return response(200, { sessionToken, viewer: publicUser(user, true) });
}

async function requireCouple(user) {
  if (!user.coupleId) return { error: jsonError("先和伴侣完成绑定，再来一起记录吧。", 409, "PAIRING_REQUIRED") };
  const couple = await getDocument("couples", user.coupleId);
  if (!couple || couple.status !== "active" || !couple.memberUids.includes(user.uid)) {
    await updateDocument("users", user.uid, { coupleId: null, updatedAt: Date.now() });
    return { error: jsonError("这段情侣关系已经失效，请重新绑定。", 409, "PAIRING_REQUIRED") };
  }
  const partnerUid = couple.memberUids.find((uid) => uid !== user.uid);
  if (!partnerUid) return { error: jsonError("情侣关系数据不完整，请重新绑定。", 409, "PAIRING_INVALID") };
  const partner = await getDocument("users", partnerUid);
  if (!partner) return { error: jsonError("暂时找不到伴侣账号，请稍后重试。", 409, "PARTNER_MISSING") };
  return { couple, partner };
}

function soloSpaceId(uid) {
  return `solo_${sha256(String(uid)).slice(0, 40)}`;
}

async function migrateSoloRecords(uid, coupleId) {
  const soloId = soloSpaceId(uid);
  const [weights, poops] = await Promise.all([
    queryAll("weight_entries", { ownerUid: uid }, [], 500),
    queryAll("poop_entries", { ownerUid: uid }, [], 500),
  ]);
  const pendingWeights = weights.filter((item) => item.coupleId === soloId);
  const pendingPoops = poops.filter((item) => item.coupleId === soloId);
  await Promise.all([
    ...pendingWeights.map((item) => updateDocument("weight_entries", item.id, {
      coupleId,
      migratedAt: Date.now(),
    })),
    ...pendingPoops.map((item) => updateDocument("poop_entries", item.id, {
      coupleId,
      migratedAt: Date.now(),
    })),
  ]);
  return pendingWeights.length + pendingPoops.length;
}

async function readSoloDashboard(user) {
  const now = Date.now();
  const spaceId = soloSpaceId(user.uid);
  const [allWeights, allPoops, notificationSummaryData] = await Promise.all([
    queryAll("weight_entries", { ownerUid: user.uid }, [], 500),
    queryAll("poop_entries", { ownerUid: user.uid }, [], 500),
    notificationSummary(user),
  ]);
  const weights = allWeights
    .filter((item) => item.coupleId === spaceId && item.recordedAt >= now - 190 * DAY)
    .sort((left, right) => left.recordedAt - right.recordedAt);
  const poops = allPoops
    .filter((item) => item.coupleId === spaceId && item.occurredAt >= now - 45 * DAY)
    .sort((left, right) => left.occurredAt - right.occurredAt);
  return response(200, {
    mode: "solo",
    viewer: publicUser(user, true),
    partner: null,
    couple: null,
    weights,
    poops,
    reactions: [],
    anniversaries: [],
    sharedMemos: [],
    notificationSummary: notificationSummaryData,
    serverTime: now,
  });
}

async function recordSpaceForUser(user) {
  if (!user.coupleId) return { id: soloSpaceId(user.uid), couple: null, partner: null };
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship;
  return { id: relationship.couple.id, couple: relationship.couple, partner: relationship.partner };
}

async function readDashboard(user) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const { couple, partner } = relationship;
  await Promise.all([
    migrateSoloRecords(user.uid, couple.id),
    migrateSoloRecords(partner.uid, couple.id),
  ]);
  const now = Date.now();
  const [weights, poops, reactions, anniversaries, sharedMemoDocuments, notificationSummaryData, dailySpark] = await Promise.all([
    queryAll(
      "weight_entries",
      { coupleId: couple.id, recordedAt: command.gte(now - 190 * DAY) },
      [["recordedAt", "asc"]],
      500,
    ),
    queryAll(
      "poop_entries",
      { coupleId: couple.id, occurredAt: command.gte(now - 45 * DAY) },
      [["occurredAt", "asc"]],
      500,
    ),
    queryAll(
      "reactions",
      { coupleId: couple.id, createdAt: command.gte(now - 30 * DAY) },
      [["createdAt", "desc"]],
      60,
    ),
    queryAll(
      "anniversaries",
      { coupleId: couple.id },
      [["date", "asc"]],
      50,
    ),
    queryAll("shared_memos", { coupleId: couple.id }, [], 120),
    notificationSummary(user, couple.id),
    readDailySpark(couple, now),
  ]);

  const sharedMemos = sharedMemoDocuments
    .filter((memo) => memo.status !== "deleted")
    .map((memo) => publicSharedMemo(memo, couple))
    .filter((memo) => memo.status === "open")
    .sort((left, right) => {
      if (left.dueAt === null && right.dueAt !== null) return 1;
      if (left.dueAt !== null && right.dueAt === null) return -1;
      return (left.dueAt || left.updatedAt) - (right.dueAt || right.updatedAt);
    })
    .slice(0, 8);

  return response(200, {
    viewer: publicUser(user, true),
    partner: publicUser(partner),
    couple: publicCouple(couple),
    weights,
    poops,
    reactions,
    anniversaries,
    sharedMemos,
    weeklyPulse: weeklyCouplePulse(couple, weights, poops, reactions, sharedMemoDocuments, now),
    dailySpark,
    notificationSummary: notificationSummaryData,
    serverTime: now,
  });
}

async function bootstrap(user) {
  if (!user.coupleId) {
    return readSoloDashboard(user);
  }
  const dashboard = await readDashboard(user);
  if (dashboard.status === 409 && dashboard.data.code === "PAIRING_REQUIRED") {
    const refreshed = await getDocument("users", user.uid);
    return readSoloDashboard(refreshed);
  }
  return dashboard;
}

async function updateProfile(user, payload, requestContext) {
  const nickname = cleanText(payload.nickname, 12);
  const avatar = cleanText(payload.avatar, 4);
  const color = cleanText(payload.color, 7);
  if (nickname.length < 1) return jsonError("昵称至少需要一个字。", 400, "NICKNAME_REQUIRED");
  if (!avatarChoices.includes(avatar)) return jsonError("请选择田地里提供的头像。", 400, "AVATAR_INVALID");
  if (color && !colorChoices.includes(color)) return jsonError("请选择田地里提供的代表色。", 400, "COLOR_INVALID");
  const nicknameSafetyError = await checkMiniPublishedText(nickname, requestContext);
  if (nicknameSafetyError) return nicknameSafetyError;

  const fields = {
    nickname,
    avatar,
    color: color || user.color,
    profileComplete: true,
    updatedAt: Date.now(),
  };
  if (Object.prototype.hasOwnProperty.call(payload, "avatarFileId")) {
    const avatarFileId = normalizeAvatarFileId(payload.avatarFileId, user.uid);
    if (avatarFileId === undefined) return jsonError("头像文件地址不正确，请重新选择。", 400, "AVATAR_FILE_INVALID");
    if (avatarFileId && avatarFileId !== user.avatarFileId) {
      const imageError = await ensureImageModerated(user, avatarFileId, "avatar", requestContext);
      if (imageError) return imageError;
    }
    fields.avatarFileId = avatarFileId;
  }
  const updated = await updateDocument("users", user.uid, fields);
  return response(200, { viewer: publicUser(updated, true) });
}

async function updateCoupleSettings(user, payload, requestContext) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const fields = { updatedAt: Date.now(), updatedBy: user.uid };

  if (Object.prototype.hasOwnProperty.call(payload, "farmName")) {
    const farmName = cleanText(payload.farmName, 16);
    if (farmName.length < 2) return jsonError("田地名称至少需要两个字。", 400, "FARM_NAME_INVALID");
    const safetyError = await checkMiniPublishedText(farmName, requestContext);
    if (safetyError) return safetyError;
    fields.farmName = farmName;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "togetherSince")) {
    const togetherSince = payload.togetherSince ? parseDateString(payload.togetherSince, false) : null;
    if (payload.togetherSince && !togetherSince) {
      return jsonError("在一起日期不正确，不能晚于今天。", 400, "TOGETHER_DATE_INVALID");
    }
    fields.togetherSince = togetherSince;
  }

  const updated = await updateDocument("couples", relationship.couple.id, fields);
  return response(200, { couple: publicCouple(updated) });
}

async function updateReminderSettings(user, payload) {
  const reminders = normalizeReminderSettings(payload.reminders || payload);
  const updated = await updateDocument("users", user.uid, {
    reminders,
    updatedAt: Date.now(),
  });
  return response(200, { reminders: normalizeReminderSettings(updated.reminders) });
}

function anniversaryFields(payload) {
  const title = cleanText(payload.title, 16);
  const date = parseDateString(payload.date, true);
  const icon = cleanText(payload.icon, 4) || "💞";
  const note = cleanText(payload.note, 40);
  if (title.length < 2) return { error: jsonError("纪念日名称至少需要两个字。", 400, "ANNIVERSARY_TITLE_INVALID") };
  if (!date) return { error: jsonError("请选择正确的纪念日日期。", 400, "ANNIVERSARY_DATE_INVALID") };
  if (!anniversaryIcons.includes(icon)) return { error: jsonError("请选择提供的纪念日图标。", 400, "ANNIVERSARY_ICON_INVALID") };
  return {
    title,
    date,
    icon,
    note,
    repeatsYearly: payload.repeatsYearly !== false,
  };
}

async function addAnniversary(user, payload, requestContext) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const fields = anniversaryFields(payload);
  if (fields.error) return fields.error;
  const safetyError = await checkMiniPublishedText(`${fields.title}\n${fields.note}`, requestContext);
  if (safetyError) return safetyError;
  const now = Date.now();
  const anniversary = await addDocument("anniversaries", {
    coupleId: relationship.couple.id,
    ...fields,
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: now,
    updatedAt: now,
  });
  return response(201, { anniversary });
}

async function updateAnniversary(user, payload, requestContext) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const id = cleanText(payload.id, 128);
  const current = id ? await getDocument("anniversaries", id) : null;
  if (!current || current.coupleId !== relationship.couple.id) {
    return jsonError("没有找到这个纪念日。", 404, "ANNIVERSARY_NOT_FOUND");
  }
  const fields = anniversaryFields({ ...current, ...payload });
  if (fields.error) return fields.error;
  const safetyError = await checkMiniPublishedText(`${fields.title}\n${fields.note}`, requestContext);
  if (safetyError) return safetyError;
  const anniversary = await updateDocument("anniversaries", id, {
    ...fields,
    updatedBy: user.uid,
    updatedAt: Date.now(),
  });
  return response(200, { anniversary });
}

async function deleteAnniversary(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const id = cleanText(payload.id, 128);
  const current = id ? await getDocument("anniversaries", id) : null;
  if (!current || current.coupleId !== relationship.couple.id) {
    return jsonError("没有找到这个纪念日。", 404, "ANNIVERSARY_NOT_FOUND");
  }
  await db.collection("anniversaries").doc(id).remove();
  return response(200, { ok: true });
}

function normalizeMemoAssignee(value, couple) {
  const assignee = cleanText(value, 128);
  if (assignee === "both") return "both";
  return Array.isArray(couple.memberUids) && couple.memberUids.includes(assignee) ? assignee : "both";
}

function publicSharedMemo(memo, couple) {
  const completedByUids = Array.isArray(memo.completedByUids)
    ? [...new Set(memo.completedByUids.filter((uid) => couple.memberUids.includes(uid)))]
    : [];
  const assignee = normalizeMemoAssignee(memo.assignee, couple);
  const requiredUids = assignee === "both" ? couple.memberUids : [assignee];
  const completed = requiredUids.every((uid) => completedByUids.includes(uid));
  return {
    id: memo.id,
    kind: sharedMemoKinds.includes(memo.kind) ? memo.kind : "memo",
    title: cleanText(memo.title, 30),
    note: cleanText(memo.note, 200),
    location: cleanText(memo.location, 20),
    category: sharedMemoCategories.includes(memo.category) ? memo.category : "other",
    dueAt: Number.isFinite(Number(memo.dueAt)) ? Number(memo.dueAt) : null,
    assignee,
    recurrence: sharedMemoRecurrences.includes(memo.recurrence) ? memo.recurrence : "none",
    reminderEnabled: Boolean(memo.reminderEnabled),
    remindAt: Number.isFinite(Number(memo.remindAt)) ? Number(memo.remindAt) : null,
    completedByUids,
    completed,
    status: completed ? "completed" : memo.status === "archived" ? "archived" : "open",
    createdBy: memo.createdBy,
    updatedBy: memo.updatedBy || memo.createdBy,
    createdAt: Number(memo.createdAt) || Date.now(),
    updatedAt: Number(memo.updatedAt) || Number(memo.createdAt) || Date.now(),
  };
}

function sharedMemoFields(payload, couple, current = null) {
  const kind = sharedMemoKinds.includes(payload.kind) ? payload.kind : current?.kind || "memo";
  const title = cleanText(payload.title ?? current?.title, 30);
  const note = cleanText(payload.note ?? current?.note, 200);
  const location = cleanText(payload.location ?? current?.location, 20);
  const category = sharedMemoCategories.includes(payload.category) ? payload.category : current?.category || "other";
  const assignee = normalizeMemoAssignee(payload.assignee ?? current?.assignee, couple);
  const recurrence = sharedMemoRecurrences.includes(payload.recurrence)
    ? payload.recurrence
    : current?.recurrence || "none";
  const dueAtParsed = parseSharedDueAt(payload.dueAt ?? current?.dueAt, false);
  const dueAt = dueAtParsed === undefined ? null : dueAtParsed;
  const reminderEnabled = Boolean(payload.reminderEnabled ?? current?.reminderEnabled) && Boolean(dueAt);
  const remindAtParsed = parseSharedDueAt(payload.remindAt ?? current?.remindAt, false);
  let remindAt = reminderEnabled && remindAtParsed !== undefined ? remindAtParsed : null;
  if (reminderEnabled && remindAt === null) remindAt = Math.max(Date.now(), dueAt - 60 * 60 * 1000);
  if (title.length < 1) return { error: jsonError("给这件事起个名字吧。", 400, "MEMO_TITLE_REQUIRED") };
  if (dueAtParsed === null) return { error: jsonError("日期时间不正确，请重新选择。", 400, "MEMO_DUE_INVALID") };
  if (remindAtParsed === null || (remindAt && dueAt && remindAt > dueAt)) {
    return { error: jsonError("提醒时间需要早于事项时间。", 400, "MEMO_REMINDER_INVALID") };
  }
  if (recurrence !== "none" && !dueAt) {
    return { error: jsonError("重复事项需要先设置日期时间。", 400, "MEMO_RECURRENCE_REQUIRES_DUE") };
  }
  return { kind, title, note, location, category, assignee, recurrence, dueAt, reminderEnabled, remindAt };
}

function nextRecurringTimestamp(timestamp, recurrence) {
  const date = new Date(timestamp);
  if (recurrence === "daily") date.setDate(date.getDate() + 1);
  if (recurrence === "weekly") date.setDate(date.getDate() + 7);
  if (recurrence === "monthly") date.setMonth(date.getMonth() + 1);
  return date.getTime();
}

async function sharedNotebook(user) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const documents = await queryAll("shared_memos", { coupleId: relationship.couple.id }, [], 300);
  const items = documents
    .filter((memo) => memo.status !== "deleted")
    .map((memo) => publicSharedMemo(memo, relationship.couple))
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "open" ? -1 : 1;
      if (left.dueAt === null && right.dueAt !== null) return 1;
      if (left.dueAt !== null && right.dueAt === null) return -1;
      return (left.dueAt || right.updatedAt) - (right.dueAt || left.updatedAt);
    });
  const grants = await queryAll("notification_subscriptions", { userUid: user.uid }, [], 100);
  return response(200, {
    items,
    notification: {
      availableQuota: grants.filter((grant) => grant.active !== false && Number(grant.remainingQuota) > 0).length,
      configured: true,
      templateId: WECHAT_MEMO_TEMPLATE_ID,
    },
    serverTime: Date.now(),
  });
}

async function createSharedMemo(user, payload, requestContext) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const fields = sharedMemoFields(payload, relationship.couple);
  if (fields.error) return fields.error;
  const safetyError = await checkMiniPublishedText(`${fields.title}\n${fields.note}\n${fields.location}`, requestContext);
  if (safetyError) return safetyError;
  const now = Date.now();
  const memo = await addDocument("shared_memos", {
    coupleId: relationship.couple.id,
    ...fields,
    completedByUids: [],
    status: "open",
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: now,
    updatedAt: now,
  });
  if (fields.assignee === "both" || fields.assignee === relationship.partner.uid) {
    await bestEffortPartnerNotification(user, relationship, {
      type: "memo_created",
      icon: fields.kind === "event" ? "📅" : fields.kind === "task" ? "✅" : "📝",
      title: fields.assignee === relationship.partner.uid ? "有一件事交给你" : "共同小本本有新内容",
      body: `${cleanText(user.nickname, 10)} 新增了：${cleanText(fields.title, 20)}`,
      targetTab: "notebook",
      referenceId: memo.id,
    });
  }
  return response(201, { item: publicSharedMemo(memo, relationship.couple) });
}

async function updateSharedMemo(user, payload, requestContext) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const id = cleanText(payload.id, 128);
  const current = id ? await getDocument("shared_memos", id) : null;
  if (!current || current.coupleId !== relationship.couple.id || current.status === "deleted") {
    return jsonError("没有找到这条共同事项。", 404, "MEMO_NOT_FOUND");
  }
  if (current.status === "completed") return jsonError("已完成的事项不能直接修改，请新建一条。", 409, "MEMO_COMPLETED");
  const fields = sharedMemoFields(payload, relationship.couple, current);
  if (fields.error) return fields.error;
  const safetyError = await checkMiniPublishedText(`${fields.title}\n${fields.note}\n${fields.location}`, requestContext);
  if (safetyError) return safetyError;
  const updated = await updateDocument("shared_memos", id, {
    ...fields,
    updatedBy: user.uid,
    updatedAt: Date.now(),
  });
  return response(200, { item: publicSharedMemo(updated, relationship.couple) });
}

async function toggleSharedMemo(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const id = cleanText(payload.id, 128);
  const current = id ? await getDocument("shared_memos", id) : null;
  if (!current || current.coupleId !== relationship.couple.id || current.status === "deleted") {
    return jsonError("没有找到这条共同事项。", 404, "MEMO_NOT_FOUND");
  }
  const assignee = normalizeMemoAssignee(current.assignee, relationship.couple);
  if (assignee !== "both" && assignee !== user.uid) {
    return jsonError("这件事分配给了伴侣，需要由 TA 完成。", 403, "MEMO_ASSIGNEE_REQUIRED");
  }
  const completedBy = new Set(Array.isArray(current.completedByUids) ? current.completedByUids : []);
  if (current.status === "completed" && current.recurrence !== "none") {
    return jsonError("重复事项已生成下一次，不需要撤销。", 409, "MEMO_RECURRENCE_ADVANCED");
  }
  const wasCompletedByViewer = completedBy.has(user.uid);
  if (wasCompletedByViewer) completedBy.delete(user.uid);
  else completedBy.add(user.uid);
  const completedByUids = [...completedBy].filter((uid) => relationship.couple.memberUids.includes(uid));
  const requiredUids = assignee === "both" ? relationship.couple.memberUids : [assignee];
  const completed = requiredUids.every((uid) => completedByUids.includes(uid));
  const now = Date.now();
  const updated = await updateDocument("shared_memos", id, {
    completedByUids,
    status: completed ? "completed" : "open",
    completedAt: completed ? now : null,
    updatedBy: user.uid,
    updatedAt: now,
  });
  let nextItem = null;
  if (completed && current.recurrence !== "none" && Number.isFinite(Number(current.dueAt))) {
    const dueAt = nextRecurringTimestamp(Number(current.dueAt), current.recurrence);
    const remindOffset = current.remindAt && current.dueAt ? Number(current.dueAt) - Number(current.remindAt) : null;
    const nextId = `memo_${sha256(`${current.id}:${dueAt}`).slice(0, 40)}`;
    const nextFields = {
      ...current,
      coupleId: relationship.couple.id,
      dueAt,
      remindAt: remindOffset === null ? null : dueAt - remindOffset,
      completedByUids: [],
      status: "open",
      previousMemoId: current.id,
      createdBy: current.createdBy,
      updatedBy: user.uid,
      createdAt: now,
      updatedAt: now,
    };
    delete nextFields.id;
    delete nextFields.completedAt;
    delete nextFields.reminderSentAt;
    delete nextFields.reminderSentToUids;
    nextItem = await setDocument("shared_memos", nextId, nextFields);
  }
  if (!wasCompletedByViewer) {
    await bestEffortPartnerNotification(user, relationship, {
      type: "memo_completed",
      icon: "✅",
      title: completed ? "共同事项完成啦" : "伴侣完成了一小步",
      body: `${cleanText(user.nickname, 10)} 完成了：${cleanText(current.title, 20)}`,
      targetTab: "notebook",
      referenceId: `${current.id}:${user.uid}`,
    });
  }
  return response(200, {
    item: publicSharedMemo(updated, relationship.couple),
    nextItem: nextItem ? publicSharedMemo(nextItem, relationship.couple) : null,
  });
}

async function deleteSharedMemo(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const id = cleanText(payload.id, 128);
  const current = id ? await getDocument("shared_memos", id) : null;
  if (!current || current.coupleId !== relationship.couple.id || current.status === "deleted") {
    return jsonError("没有找到这条共同事项。", 404, "MEMO_NOT_FOUND");
  }
  if (current.createdBy !== user.uid) return jsonError("只有创建人可以删除这条事项。", 403, "MEMO_DELETE_FORBIDDEN");
  await updateDocument("shared_memos", id, {
    status: "deleted",
    deletedBy: user.uid,
    deletedAt: Date.now(),
    updatedAt: Date.now(),
  });
  return response(200, { ok: true });
}

async function saveSubscriptionConsent(user, payload, requestContext) {
  const templateKey = cleanText(payload.templateKey, 32);
  const templateId = cleanText(payload.templateId, 128);
  if (!notificationTemplateKeys.includes(templateKey) || !templateId) {
    return jsonError("订阅消息模板不正确。", 400, "SUBSCRIPTION_TEMPLATE_INVALID");
  }
  if (notificationTemplateKeys.includes(templateKey) && templateId !== WECHAT_MEMO_TEMPLATE_ID) {
    return jsonError("日程提醒模板已经更新，请刷新后重新授权。", 409, "SUBSCRIPTION_TEMPLATE_OUTDATED");
  }
  if (!requestContext?.platformCaller?.openId || requestContext.channel !== "mini") {
    return jsonError("订阅消息只能从微信小程序开启。", 403, "SUBSCRIPTION_MINI_ONLY");
  }
  const accepted = payload.result === "accept" || payload.result === "acceptWithAudio";
  if (!accepted) return jsonError("这次没有获得提醒授权。", 409, "SUBSCRIPTION_NOT_ACCEPTED");
  const now = Date.now();
  const id = `subscription_${sha256(`${user.uid}:${templateId}:${now}:${randomId(4)}`).slice(0, 48)}`;
  await setDocument("notification_subscriptions", id, {
    userUid: user.uid,
    openId: requestContext.platformCaller.openId,
    templateKey,
    templateId,
    remainingQuota: 1,
    active: true,
    acceptedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return response(201, { ok: true, remainingQuota: await notificationQuota(user.uid) });
}

function formatWechatReminderTime(timestamp) {
  const date = new Date(Number(timestamp) + 8 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}年${month}月${day}日 ${hour}:${minute}`;
}

function chinaClockMinutes(timestamp = Date.now()) {
  const date = new Date(Number(timestamp) + 8 * 60 * 60 * 1000);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function chinaDateParts(timestamp = Date.now()) {
  const shifted = new Date(Number(timestamp) + 8 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  return {
    year,
    month,
    day,
    weekday: shifted.getUTCDay(),
    key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    start: Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000,
  };
}

function reminderWindowOpen(rule, now = Date.now(), graceMinutes = 179) {
  if (!rule?.enabled) return false;
  const today = chinaDateParts(now);
  if (!Array.isArray(rule.days) || !rule.days.includes(today.weekday)) return false;
  const current = chinaClockMinutes(now);
  const scheduled = clockValueMinutes(rule.time);
  return current >= scheduled && current <= scheduled + graceMinutes;
}

function anniversaryDaysAway(anniversary, now = Date.now()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanText(anniversary.date, 10));
  if (!match) return null;
  const today = chinaDateParts(now);
  const originalYear = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let year = anniversary.repeatsYearly === false ? originalYear : today.year;
  let occurrence = Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000;
  if (anniversary.repeatsYearly !== false && occurrence < today.start) {
    year += 1;
    occurrence = Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000;
  }
  return Math.round((occurrence - today.start) / DAY);
}

function clockValueMinutes(value) {
  const [hour, minute] = normalizeClockTime(value, "00:00").split(":").map(Number);
  return hour * 60 + minute;
}

function isNotificationQuietTime(preferences, timestamp = Date.now()) {
  const quiet = normalizeNotificationPreferences(preferences).quietHours;
  if (!quiet.enabled) return false;
  const current = chinaClockMinutes(timestamp);
  const start = clockValueMinutes(quiet.start);
  const end = clockValueMinutes(quiet.end);
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function publicNotification(item) {
  return {
    id: item.id,
    type: cleanText(item.type, 32),
    icon: cleanText(item.icon, 4) || "💌",
    title: cleanText(item.title, 30),
    body: cleanText(item.body, 80),
    actorUid: item.actorUid,
    actorNickname: cleanText(item.actorNickname, 20) || "我的伴侣",
    targetTab: cleanText(item.targetTab, 24) || "farm",
    referenceId: cleanText(item.referenceId, 128) || null,
    read: Boolean(item.readAt),
    readAt: Number(item.readAt) || null,
    wechatStatus: cleanText(item.wechatStatus, 24) || "not_requested",
    createdAt: Number(item.createdAt) || Date.now(),
  };
}

async function notificationQuota(userUid) {
  const grants = await queryAll("notification_subscriptions", { userUid }, [], 100);
  return grants.filter((grant) => (
    grant.active !== false
    && grant.templateId === WECHAT_MEMO_TEMPLATE_ID
    && Number(grant.remainingQuota) > 0
    && grant.openId
  )).length;
}

async function availableNotificationGrant(userUid) {
  const grants = await queryAll("notification_subscriptions", { userUid }, [], 100);
  return grants
    .filter((item) => item.active !== false)
    .filter((item) => item.templateId === WECHAT_MEMO_TEMPLATE_ID)
    .filter((item) => Number(item.remainingQuota) > 0 && item.openId)
    .sort((left, right) => Number(left.acceptedAt) - Number(right.acceptedAt))[0] || null;
}

async function activityPushRateLimited(notification) {
  const cooldown = Number(activityPushCooldowns[notification.type] || 0);
  if (!cooldown) return false;
  const recent = await queryAll("in_app_notifications", {
    recipientUid: notification.recipientUid,
    type: notification.type,
  }, [], 80);
  return recent.some((item) => (
    item.id !== notification.id
    && item.wechatStatus === "sent"
    && Number(item.wechatSentAt) > Date.now() - cooldown
  ));
}

async function sendActivityNotification(notification, recipient, preferences, source = "event") {
  if (!normalizeNotificationPreferences(preferences).wechat) return { status: "disabled" };
  if (isNotificationQuietTime(preferences)) return { status: "pending" };
  if (await activityPushRateLimited(notification)) return { status: "rate_limited" };
  const grant = await availableNotificationGrant(recipient.uid);
  if (!grant) return { status: "no_quota" };

  const deliveryId = `activity_delivery_${sha256(`${notification.id}:${WECHAT_MEMO_TEMPLATE_ID}`).slice(0, 44)}`;
  const existing = await getDocument("notification_deliveries", deliveryId);
  if (existing?.status === "sent") return { status: "already_sent", sentAt: existing.sentAt };
  const now = Date.now();
  await setDocument("notification_deliveries", deliveryId, {
    notificationId: notification.id,
    coupleId: notification.coupleId,
    userUid: recipient.uid,
    grantId: grant.id,
    templateId: WECHAT_MEMO_TEMPLATE_ID,
    status: "sending",
    source: cleanText(source, 32),
    attempts: Number(existing?.attempts || 0) + 1,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });

  try {
    await wxCloud.openapi.subscribeMessage.send({
      touser: grant.openId,
      templateId: WECHAT_MEMO_TEMPLATE_ID,
      page: "pages/index/index",
      miniprogramState: reminderMiniProgramState(),
      lang: "zh_CN",
      data: {
        thing2: { value: cleanText(notification.body || notification.title, 20) || "伴侣有一条新动态" },
        time6: { value: formatWechatReminderTime(notification.createdAt) },
        thing10: { value: cleanText(notification.location, 20) || "我们俩的小田地" },
        thing17: { value: cleanText(notification.actorNickname, 20) || "我的伴侣" },
      },
    });
    const sentAt = Date.now();
    await Promise.all([
      updateDocument("notification_deliveries", deliveryId, {
        status: "sent",
        sentAt,
        updatedAt: sentAt,
      }),
      updateDocument("notification_subscriptions", grant.id, {
        remainingQuota: Math.max(0, Number(grant.remainingQuota) - 1),
        active: Number(grant.remainingQuota) > 1,
        lastUsedAt: sentAt,
        updatedAt: sentAt,
      }),
    ]);
    return { status: "sent", sentAt };
  } catch (error) {
    const failedAt = Date.now();
    await Promise.all([
      updateDocument("notification_deliveries", deliveryId, {
        status: "failed",
        error: errorDetails(error),
        updatedAt: failedAt,
      }),
      updateDocument("notification_subscriptions", grant.id, {
        remainingQuota: 0,
        active: false,
        lastFailedAt: failedAt,
        updatedAt: failedAt,
      }),
    ]);
    console.warn("partner activity notification delivery failed", {
      notificationId: notification.id,
      ...errorDetails(error),
    });
    return { status: "failed" };
  }
}

async function createNotificationForRecipient(user, couple, recipient, details) {
  if (!recipient || recipient.uid === user.uid) return null;
  const type = cleanText(details.type, 32);
  const preferenceKey = notificationPreferenceByType[type];
  const preferences = normalizeNotificationPreferences(recipient.notificationPreferences);
  if (!preferenceKey || preferences.events[preferenceKey] === false) return null;
  const referenceId = cleanText(details.referenceId, 128) || randomId(8);
  const id = `notice_${sha256(`${couple.id}:${recipient.uid}:${type}:${referenceId}`).slice(0, 44)}`;
  const existing = await getDocument("in_app_notifications", id);
  if (existing) return publicNotification(existing);
  const now = Date.now();
  const notification = await setDocument("in_app_notifications", id, {
    coupleId: couple.id,
    recipientUid: recipient.uid,
    actorUid: user.uid,
    actorNickname: cleanText(user.nickname, 20),
    type,
    icon: cleanText(details.icon, 4) || "💌",
    title: cleanText(details.title, 30),
    body: cleanText(details.body, 80),
    location: cleanText(details.location || couple.farmName, 20),
    targetTab: cleanText(details.targetTab, 24) || "farm",
    referenceId,
    visible: preferences.inApp,
    readAt: preferences.inApp ? null : now,
    wechatStatus: preferences.wechat ? "preparing" : "disabled",
    createdAt: now,
    updatedAt: now,
  });
  if (preferences.wechat) {
    const delivery = await sendActivityNotification(notification, recipient, preferences, "partner-event");
    await updateDocument("in_app_notifications", id, {
      wechatStatus: delivery.status,
      wechatSentAt: delivery.sentAt || null,
      updatedAt: Date.now(),
    });
  }
  return publicNotification(await getDocument("in_app_notifications", id));
}

function notificationSpaceId(user) {
  return user.coupleId || soloSpaceId(user.uid);
}

async function createSystemNotification(recipient, details, source = "scheduled") {
  const type = cleanText(details.type, 32);
  const preferenceKey = notificationPreferenceByType[type];
  const preferences = normalizeNotificationPreferences(recipient.notificationPreferences);
  if (!preferenceKey || preferences.events[preferenceKey] === false) return null;
  const spaceId = notificationSpaceId(recipient);
  const referenceId = cleanText(details.referenceId, 128) || randomId(8);
  const id = `notice_${sha256(`${spaceId}:${recipient.uid}:${type}:${referenceId}`).slice(0, 44)}`;
  const existing = await getDocument("in_app_notifications", id);
  if (existing) return publicNotification(existing);
  const now = Date.now();
  const notification = await setDocument("in_app_notifications", id, {
    coupleId: spaceId,
    recipientUid: recipient.uid,
    actorUid: "system",
    actorNickname: "小田地",
    type,
    icon: cleanText(details.icon, 4) || "🔔",
    title: cleanText(details.title, 30),
    body: cleanText(details.body, 80),
    location: cleanText(details.location, 20) || "我们俩的小田地",
    targetTab: cleanText(details.targetTab, 24) || "farm",
    referenceId,
    visible: preferences.inApp,
    readAt: preferences.inApp ? null : now,
    wechatStatus: preferences.wechat ? "preparing" : "disabled",
    createdAt: now,
    updatedAt: now,
  });
  if (preferences.wechat) {
    const delivery = await sendActivityNotification(notification, recipient, preferences, source);
    await updateDocument("in_app_notifications", id, {
      wechatStatus: delivery.status,
      wechatSentAt: delivery.sentAt || null,
      updatedAt: Date.now(),
    });
  }
  return publicNotification(await getDocument("in_app_notifications", id));
}

async function createPartnerNotification(user, relationship, details) {
  return createNotificationForRecipient(user, relationship.couple, relationship.partner, details);
}

async function bestEffortPartnerNotification(user, relationship, details) {
  try {
    return await createPartnerNotification(user, relationship, details);
  } catch (error) {
    console.warn("partner notification skipped", { type: details.type, ...errorDetails(error) });
    return null;
  }
}

async function bestEffortNotificationsForCouple(user, couple, details) {
  try {
    const recipients = await Promise.all((couple.memberUids || [])
      .filter((uid) => uid !== user.uid)
      .map((uid) => getDocument("users", uid)));
    return await Promise.all(recipients
      .filter(Boolean)
      .map((recipient) => createNotificationForRecipient(user, couple, recipient, details)));
  } catch (error) {
    console.warn("couple notification skipped", { type: details.type, ...errorDetails(error) });
    return [];
  }
}

async function notificationSummary(user, coupleId) {
  const spaceId = coupleId || notificationSpaceId(user);
  const [documents, availableQuota] = await Promise.all([
    queryAll("in_app_notifications", { recipientUid: user.uid, coupleId: spaceId }, [], 120),
    notificationQuota(user.uid),
  ]);
  return {
    unreadCount: documents.filter((item) => item.visible !== false && !item.readAt).length,
    availableQuota,
  };
}

async function notificationCenter(user) {
  const spaceId = notificationSpaceId(user);
  const [documents, availableQuota] = await Promise.all([
    queryAll("in_app_notifications", {
      recipientUid: user.uid,
      coupleId: spaceId,
    }, [], 200),
    notificationQuota(user.uid),
  ]);
  const items = documents
    .filter((item) => item.visible !== false)
    .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
    .slice(0, 80)
    .map(publicNotification);
  return response(200, {
    items,
    unreadCount: items.filter((item) => !item.read).length,
    notification: {
      availableQuota,
      configured: true,
      templateId: WECHAT_MEMO_TEMPLATE_ID,
    },
    preferences: normalizeNotificationPreferences(user.notificationPreferences),
    serverTime: Date.now(),
  });
}

async function markNotificationRead(user, payload) {
  const spaceId = notificationSpaceId(user);
  const now = Date.now();
  if (payload.all === true) {
    const documents = await queryAll("in_app_notifications", {
      recipientUid: user.uid,
      coupleId: spaceId,
    }, [], 200);
    await Promise.all(documents
      .filter((item) => item.visible !== false && !item.readAt)
      .map((item) => updateDocument("in_app_notifications", item.id, { readAt: now, updatedAt: now })));
    return response(200, { ok: true, updated: documents.filter((item) => !item.readAt).length });
  }
  const id = cleanText(payload.id, 128);
  const item = id ? await getDocument("in_app_notifications", id) : null;
  if (!item || item.recipientUid !== user.uid || item.coupleId !== spaceId) {
    return jsonError("没有找到这条消息。", 404, "NOTIFICATION_NOT_FOUND");
  }
  await updateDocument("in_app_notifications", id, { readAt: now, updatedAt: now });
  return response(200, { ok: true, updated: 1 });
}

async function updateNotificationPreferences(user, payload) {
  const preferences = normalizeNotificationPreferences(payload.preferences || payload);
  const updated = await updateDocument("users", user.uid, {
    notificationPreferences: preferences,
    updatedAt: Date.now(),
  });
  return response(200, { preferences: normalizeNotificationPreferences(updated.notificationPreferences) });
}

async function dispatchPendingActivityNotifications(source = "timer") {
  const pending = await queryAll("in_app_notifications", { wechatStatus: "pending" }, [], 200);
  let sent = 0;
  let failed = 0;
  let expired = 0;
  for (const item of pending
    .sort((left, right) => Number(left.createdAt) - Number(right.createdAt))
    .slice(0, 30)) {
    if (Number(item.createdAt) < Date.now() - DAY) {
      await updateDocument("in_app_notifications", item.id, { wechatStatus: "expired", updatedAt: Date.now() });
      expired += 1;
      continue;
    }
    const recipient = await getDocument("users", item.recipientUid);
    if (!recipient) continue;
    const preferences = normalizeNotificationPreferences(recipient.notificationPreferences);
    if (isNotificationQuietTime(preferences)) continue;
    const delivery = await sendActivityNotification(item, recipient, preferences, source);
    await updateDocument("in_app_notifications", item.id, {
      wechatStatus: delivery.status,
      wechatSentAt: delivery.sentAt || null,
      updatedAt: Date.now(),
    });
    if (delivery.status === "sent") sent += 1;
    else if (delivery.status === "failed") failed += 1;
  }
  return { scanned: pending.length, sent, failed, expired };
}

function reminderMiniProgramState() {
  const state = cleanText(process.env.WECHAT_MINIPROGRAM_STATE, 16);
  return ["developer", "trial", "formal"].includes(state) ? state : "trial";
}

async function sendMemoReminder(memo, couple, targetUid, source) {
  const deliveryId = `delivery_${sha256(`${memo.id}:${targetUid}:${WECHAT_MEMO_TEMPLATE_ID}`).slice(0, 48)}`;
  const existing = await getDocument("notification_deliveries", deliveryId);
  if (existing?.status === "sent") return { status: "already-sent" };
  if (existing?.status === "sending" && existing.updatedAt > Date.now() - 2 * 60 * 1000) {
    return { status: "in-progress" };
  }
  const grants = await queryAll("notification_subscriptions", { userUid: targetUid }, [], 100);
  const grant = grants
    .filter((item) => item.active !== false)
    .filter((item) => item.templateId === WECHAT_MEMO_TEMPLATE_ID)
    .filter((item) => Number(item.remainingQuota) > 0 && item.openId)
    .sort((left, right) => left.acceptedAt - right.acceptedAt)[0];
  if (!grant) return { status: "no-quota" };

  const now = Date.now();
  await setDocument("notification_deliveries", deliveryId, {
    memoId: memo.id,
    coupleId: couple.id,
    userUid: targetUid,
    grantId: grant.id,
    templateId: WECHAT_MEMO_TEMPLATE_ID,
    status: "sending",
    source: cleanText(source, 32),
    attempts: Number(existing?.attempts || 0) + 1,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });

  try {
    const publisher = await getDocument("users", memo.createdBy);
    await wxCloud.openapi.subscribeMessage.send({
      touser: grant.openId,
      templateId: WECHAT_MEMO_TEMPLATE_ID,
      page: "pages/index/index",
      miniprogramState: reminderMiniProgramState(),
      lang: "zh_CN",
      data: {
        thing2: { value: cleanText(memo.title, 20) || "共同事项提醒" },
        time6: { value: formatWechatReminderTime(memo.dueAt) },
        thing10: { value: cleanText(memo.location, 20) || "未填写" },
        thing17: { value: cleanText(publisher?.nickname, 20) || "我的伴侣" },
      },
    });
    await Promise.all([
      updateDocument("notification_deliveries", deliveryId, {
        status: "sent",
        sentAt: Date.now(),
        updatedAt: Date.now(),
      }),
      updateDocument("notification_subscriptions", grant.id, {
        remainingQuota: Math.max(0, Number(grant.remainingQuota) - 1),
        active: Number(grant.remainingQuota) > 1,
        lastUsedAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ]);
    return { status: "sent" };
  } catch (error) {
    await updateDocument("notification_deliveries", deliveryId, {
      status: "failed",
      error: errorDetails(error),
      updatedAt: Date.now(),
    });
    console.warn("memo reminder delivery failed", {
      memoId: memo.id,
      source: cleanText(source, 32),
      ...errorDetails(error),
    });
    return { status: "failed" };
  }
}

async function dispatchDueReminders(source = "timer") {
  const now = Date.now();
  const openMemos = await queryAll("shared_memos", { status: "open" }, [], 500);
  const dueMemos = openMemos
    .filter((memo) => memo.reminderEnabled)
    .filter((memo) => Number.isFinite(Number(memo.remindAt)) && Number(memo.remindAt) <= now)
    .filter((memo) => Number.isFinite(Number(memo.dueAt)) && Number(memo.dueAt) >= now - 12 * 60 * 60 * 1000)
    .sort((left, right) => Number(left.remindAt) - Number(right.remindAt))
    .slice(0, 20);
  let sent = 0;
  let failed = 0;
  let withoutQuota = 0;
  for (const memo of dueMemos) {
    const couple = await getDocument("couples", memo.coupleId);
    if (!couple || couple.status !== "active") continue;
    const assignee = normalizeMemoAssignee(memo.assignee, couple);
    const targetUids = assignee === "both" ? couple.memberUids : [assignee];
    const delivered = new Set(Array.isArray(memo.reminderSentToUids) ? memo.reminderSentToUids : []);
    for (const targetUid of targetUids.filter((uid) => !delivered.has(uid))) {
      const result = await sendMemoReminder(memo, couple, targetUid, source);
      if (result.status === "sent" || result.status === "already-sent") {
        delivered.add(targetUid);
        if (result.status === "sent") sent += 1;
      } else if (result.status === "no-quota") withoutQuota += 1;
      else if (result.status === "failed") failed += 1;
    }
    const allDelivered = targetUids.every((uid) => delivered.has(uid));
    await updateDocument("shared_memos", memo.id, {
      reminderSentToUids: [...delivered],
      reminderSentAt: allDelivered ? Date.now() : null,
      updatedAt: Date.now(),
    });
  }
  return { ok: true, scanned: dueMemos.length, sent, failed, withoutQuota };
}

let reminderSweepPromise;
let lastReminderSweepAt = 0;

function maybeDispatchDueReminders(source, force = false) {
  const now = Date.now();
  if (!force && lastReminderSweepAt > now - 60 * 1000) {
    return reminderSweepPromise || Promise.resolve({ ok: true, skipped: true });
  }
  if (!reminderSweepPromise) {
    lastReminderSweepAt = now;
    reminderSweepPromise = dispatchDueReminders(source).finally(() => {
      reminderSweepPromise = undefined;
    });
  }
  return reminderSweepPromise;
}

async function dispatchScheduledUserReminders(source = "timer", now = Date.now()) {
  const users = await queryAll("users", {}, [], 500);
  const today = chinaDateParts(now);
  const currentMinutes = chinaClockMinutes(now);
  let scanned = 0;
  let created = 0;
  let skippedBecauseDone = 0;

  for (const user of users.filter((item) => item && item.uid && item.profileComplete !== false)) {
    const reminders = normalizeReminderSettings(user.reminders);
    const spaceId = notificationSpaceId(user);
    const dayEnd = today.start + DAY;

    for (const kind of ["weight", "poop"]) {
      const rule = reminders[kind];
      if (!reminderWindowOpen(rule, now)) continue;
      scanned += 1;
      const collectionName = kind === "weight" ? "weight_entries" : "poop_entries";
      const timestampKey = kind === "weight" ? "recordedAt" : "occurredAt";
      const records = await queryAll(collectionName, { ownerUid: user.uid }, [], 500);
      const alreadyDone = records.some((item) => (
        item.coupleId === spaceId
        && Number(item[timestampKey]) >= today.start
        && Number(item[timestampKey]) < dayEnd
      ));
      if (alreadyDone) {
        skippedBecauseDone += 1;
        continue;
      }
      const notice = await createSystemNotification(user, {
        type: "health_reminder",
        icon: kind === "weight" ? "⚖️" : "🚽",
        title: kind === "weight" ? "今天还没有称重" : "今天还没有记录如厕",
        body: kind === "weight" ? "到称重时间啦，记录后就不再提醒" : "到记录时间啦，今天记过就不再提醒",
        targetTab: "farm",
        referenceId: `${kind}:${today.key}`,
      }, source);
      if (notice) created += 1;
    }

    if (
      user.coupleId
      && reminders.anniversary.enabled
      && currentMinutes >= 9 * 60
      && currentMinutes <= 11 * 60 + 59
    ) {
      const anniversaries = await queryAll("anniversaries", { coupleId: user.coupleId }, [], 80);
      for (const anniversary of anniversaries) {
        const daysAway = anniversaryDaysAway(anniversary, now);
        if (!reminders.anniversary.advanceDays.includes(daysAway)) continue;
        scanned += 1;
        const when = daysAway === 0 ? "就是今天" : daysAway === 1 ? "就在明天" : `还有 ${daysAway} 天`;
        const notice = await createSystemNotification(user, {
          type: "anniversary_reminder",
          icon: cleanText(anniversary.icon, 4) || "💞",
          title: cleanText(anniversary.title, 24) || "纪念日提醒",
          body: `${cleanText(anniversary.title, 12)}${when}，别忘了准备一点心意`,
          targetTab: "anniversaries",
          referenceId: `${anniversary.id}:${today.key}:${daysAway}`,
        }, source);
        if (notice) created += 1;
      }
    }
  }
  return { scanned, created, skippedBecauseDone, users: users.length };
}

function dailySparkDefinition(couple, now = Date.now()) {
  const date = chinaDateParts(now).key;
  const digest = sha256(`${couple.id}:${date}`);
  const prompt = dailySparkPrompts[Number.parseInt(digest.slice(0, 8), 16) % dailySparkPrompts.length];
  return {
    id: `spark_${sha256(`${couple.id}:${date}`).slice(0, 44)}`,
    date,
    ...prompt,
  };
}

async function readDailySpark(couple, now = Date.now()) {
  const definition = dailySparkDefinition(couple, now);
  const document = await getDocument("daily_sparks", definition.id);
  const completedByUids = Array.isArray(document?.completedByUids)
    ? document.completedByUids.filter((uid) => couple.memberUids.includes(uid))
    : [];
  return {
    ...definition,
    completedByUids,
    bothCompleted: couple.memberUids.every((uid) => completedByUids.includes(uid)),
  };
}

async function completeDailySpark(user) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const current = await readDailySpark(relationship.couple);
  const completedByUids = [...new Set([...current.completedByUids, user.uid])];
  const newlyCompleted = !current.completedByUids.includes(user.uid);
  const now = Date.now();
  await setDocument("daily_sparks", current.id, {
    coupleId: relationship.couple.id,
    date: current.date,
    icon: current.icon,
    title: current.title,
    detail: current.detail,
    completedByUids,
    createdAt: now,
    updatedAt: now,
  });
  if (newlyCompleted) {
    await bestEffortPartnerNotification(user, relationship, {
      type: "spark_completed",
      icon: "✨",
      title: "今日心动任务有进展",
      body: `${cleanText(user.nickname, 10)} 完成了：${cleanText(current.title, 18)}`,
      targetTab: "farm",
      referenceId: `${current.id}:${user.uid}`,
    });
  }
  return response(200, {
    spark: {
      ...current,
      completedByUids,
      bothCompleted: relationship.couple.memberUids.every((uid) => completedByUids.includes(uid)),
    },
  });
}

async function createInvite(user) {
  if (!user.profileComplete) return jsonError("先给自己取个昵称，再邀请伴侣吧。", 409, "PROFILE_REQUIRED");
  if (user.coupleId) return jsonError("你已经绑定伴侣了。", 409, "ALREADY_PAIRED");

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomInviteCode();
    if (await getDocument("couple_invites", code)) continue;
    const now = Date.now();
    await setDocument("couple_invites", code, {
      code,
      createdBy: user.uid,
      creatorNickname: user.nickname,
      status: "active",
      createdAt: now,
      expiresAt: now + INVITE_LIFETIME,
      usedBy: null,
      coupleId: null,
    });
    return response(201, { code, expiresAt: now + INVITE_LIFETIME });
  }
  return jsonError("配对码生成失败，请再试一次。", 500, "INVITE_GENERATION_FAILED");
}

async function acceptInvite(user, payload) {
  if (!user.profileComplete) return jsonError("先给自己取个昵称，再接受邀请吧。", 409, "PROFILE_REQUIRED");
  if (user.coupleId) return jsonError("你已经绑定伴侣了。", 409, "ALREADY_PAIRED");
  const code = cleanText(payload.code, 8).toUpperCase();
  if (code.length !== 8) return jsonError("请输入完整的 8 位配对码。", 400, "INVITE_INVALID");

  const invite = await getDocument("couple_invites", code);
  if (!invite || invite.status !== "active") return jsonError("这个配对码不存在或已经使用。", 404, "INVITE_NOT_FOUND");
  if (invite.expiresAt < Date.now()) {
    await updateDocument("couple_invites", code, { status: "expired" });
    return jsonError("这个配对码已经过期，请让伴侣重新生成。", 410, "INVITE_EXPIRED");
  }
  if (invite.createdBy === user.uid) return jsonError("不能和自己绑定，把配对码发给伴侣吧。", 400, "SELF_PAIRING");

  const creator = await getDocument("users", invite.createdBy);
  if (!creator || creator.coupleId) {
    await updateDocument("couple_invites", code, { status: "invalid" });
    return jsonError("邀请人的关系状态已经改变，请重新生成配对码。", 409, "CREATOR_UNAVAILABLE");
  }
  const latestUser = await getDocument("users", user.uid);
  if (!latestUser || latestUser.coupleId) return jsonError("你的关系状态已经改变，请刷新页面。", 409, "ALREADY_PAIRED");

  const now = Date.now();
  const coupleId = `couple_${randomId(10)}`;
  await setDocument("couples", coupleId, {
    memberUids: [creator.uid, user.uid],
    status: "active",
    farmName: cleanText(`${creator.nickname}和${user.nickname}的小田地`, 16),
    togetherSince: null,
    communityEnabled: false,
    communityBio: "",
    communityPublicStats: [],
    communityStats: null,
    founderTrialClaimedAt: null,
    founderTrialUntil: null,
    membershipPlan: "free",
    membershipUntil: null,
    membershipWaitlistedAt: null,
    createdAt: now,
    updatedAt: now,
    updatedBy: user.uid,
    endedAt: null,
    endedBy: null,
  });

  try {
    await updateDocument("users", creator.uid, { coupleId, updatedAt: now });
    await updateDocument("users", user.uid, { coupleId, updatedAt: now });
    await updateDocument("couple_invites", code, {
      status: "used",
      usedBy: user.uid,
      coupleId,
      usedAt: now,
    });
  } catch (error) {
    await updateDocument("couples", coupleId, { status: "setup_failed", updatedAt: Date.now() }).catch(() => {});
    throw error;
  }

  const refreshedUser = await getDocument("users", user.uid);
  return bootstrap(refreshedUser);
}

async function unbind(user) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const { couple, partner } = relationship;
  const now = Date.now();
  await detachCoupleFromVillage(couple, user.uid);
  await updateDocument("couples", couple.id, {
    status: "ended",
    communityEnabled: false,
    endedAt: now,
    endedBy: user.uid,
    updatedAt: now,
  });
  await Promise.all([
    updateDocument("users", user.uid, { coupleId: null, updatedAt: now }),
    updateDocument("users", partner.uid, { coupleId: null, updatedAt: now }),
  ]);
  return response(200, { ok: true });
}

async function addWeight(user, payload) {
  const space = await recordSpaceForUser(user);
  if (space.error) return space.error;
  const weightKg = Number(payload.weightKg);
  const recordedAt = parseOccurrence(payload.occurredAt);
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 250) {
    return jsonError("请输入 25 到 250 千克之间的体重。", 400, "WEIGHT_INVALID");
  }
  if (!recordedAt) return jsonError("记录时间不正确，请重新选择。", 400, "TIME_INVALID");
  const entry = await addDocument("weight_entries", {
    coupleId: space.id,
    ownerUid: user.uid,
    weightKg: Math.round(weightKg * 10) / 10,
    recordedAt,
    createdAt: Date.now(),
  });
  if (space.couple && recordedAt >= Date.now() - 12 * 60 * 60 * 1000) {
    await bestEffortPartnerNotification(user, space, {
      type: "weight",
      icon: "⚖️",
      title: "伴侣完成了称重",
      body: `${cleanText(user.nickname, 10)} 完成了称重打卡`,
      targetTab: "trends",
      referenceId: entry.id,
    });
  }
  return response(201, { entry });
}

async function addPoop(user, payload) {
  const space = await recordSpaceForUser(user);
  if (space.error) return space.error;
  const occurredAt = parseOccurrence(payload.occurredAt);
  if (!occurredAt) return jsonError("记录时间不正确，请重新选择。", 400, "TIME_INVALID");
  const entry = await addDocument("poop_entries", {
    coupleId: space.id,
    ownerUid: user.uid,
    occurredAt,
    createdAt: Date.now(),
  });
  if (space.couple && occurredAt >= Date.now() - 12 * 60 * 60 * 1000) {
    await bestEffortPartnerNotification(user, space, {
      type: "poop",
      icon: "🚽",
      title: "伴侣完成了记录",
      body: `${cleanText(user.nickname, 10)} 完成了一次如厕记录`,
      targetTab: "trends",
      referenceId: entry.id,
    });
  }
  return response(201, { entry });
}

async function updateWeight(user, payload) {
  const space = await recordSpaceForUser(user);
  if (space.error) return space.error;
  const id = cleanText(payload.id, 128);
  const current = id ? await getDocument("weight_entries", id) : null;
  if (!current || current.ownerUid !== user.uid || current.coupleId !== space.id) {
    return jsonError("只能修改自己的体重记录。", 403, "RECORD_FORBIDDEN");
  }
  const weightKg = Number(payload.weightKg);
  const recordedAt = parseOccurrence(payload.occurredAt);
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 250) {
    return jsonError("请输入 25 到 250 千克之间的体重。", 400, "WEIGHT_INVALID");
  }
  if (!recordedAt) return jsonError("记录时间不正确，请重新选择。", 400, "TIME_INVALID");
  const entry = await updateDocument("weight_entries", id, {
    weightKg: Math.round(weightKg * 10) / 10,
    recordedAt,
    updatedAt: Date.now(),
  });
  return response(200, { entry });
}

async function updatePoop(user, payload) {
  const space = await recordSpaceForUser(user);
  if (space.error) return space.error;
  const id = cleanText(payload.id, 128);
  const current = id ? await getDocument("poop_entries", id) : null;
  if (!current || current.ownerUid !== user.uid || current.coupleId !== space.id) {
    return jsonError("只能修改自己的如厕记录。", 403, "RECORD_FORBIDDEN");
  }
  const occurredAt = parseOccurrence(payload.occurredAt);
  if (!occurredAt) return jsonError("记录时间不正确，请重新选择。", 400, "TIME_INVALID");
  const entry = await updateDocument("poop_entries", id, {
    occurredAt,
    updatedAt: Date.now(),
  });
  return response(200, { entry });
}

async function removeDocuments(name, documents) {
  await Promise.all(documents.map((document) => db.collection(name).doc(document.id).remove()));
}

async function clearMyRecords(user) {
  const [weights, poops, sentReactions, receivedReactions, checkins, answers, sentNotifications, receivedNotifications] = await Promise.all([
    queryAll("weight_entries", { ownerUid: user.uid }, [], 500),
    queryAll("poop_entries", { ownerUid: user.uid }, [], 500),
    queryAll("reactions", { fromUserUid: user.uid }, [], 500),
    queryAll("reactions", { toUserUid: user.uid }, [], 500),
    queryAll("daily_checkins", { userUid: user.uid }, [], 500),
    queryAll("daily_answers", { userUid: user.uid }, [], 500),
    queryAll("in_app_notifications", { actorUid: user.uid }, [], 500),
    queryAll("in_app_notifications", { recipientUid: user.uid }, [], 500),
  ]);
  const reactions = [...new Map([...sentReactions, ...receivedReactions].map((item) => [item.id, item])).values()];
  const notifications = [...new Map([...sentNotifications, ...receivedNotifications].map((item) => [item.id, item])).values()];
  await Promise.all([
    removeDocuments("weight_entries", weights),
    removeDocuments("poop_entries", poops),
    removeDocuments("reactions", reactions),
    removeDocuments("daily_checkins", checkins),
    removeDocuments("daily_answers", answers),
    removeDocuments("in_app_notifications", notifications),
  ]);
  return response(200, {
    ok: true,
    deleted: weights.length + poops.length + reactions.length + checkins.length + answers.length + notifications.length,
  });
}

async function deleteIdentity(user) {
  await clearMyRecords(user);
  if (user.coupleId) await unbind(user);
  const [accounts, sessions, subscriptions, deliveries] = await Promise.all([
    queryAll("accounts", { uid: user.uid }, [], 20),
    queryAll("sessions", { uid: user.uid }, [], 100),
    queryAll("notification_subscriptions", { userUid: user.uid }, [], 100),
    queryAll("notification_deliveries", { userUid: user.uid }, [], 500),
  ]);
  await Promise.all([
    removeDocuments("accounts", accounts),
    removeDocuments("sessions", sessions),
    removeDocuments("notification_subscriptions", subscriptions),
    removeDocuments("notification_deliveries", deliveries),
    db.collection("users").doc(user.uid).remove(),
  ]);
  return response(200, { ok: true });
}

async function react(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const kind = payload.kind === "like" ? "like" : payload.kind === "tease" ? "tease" : null;
  if (!kind) return jsonError("没有认出这次互动，再点一次试试吧。", 400, "REACTION_INVALID");
  const reaction = await addDocument("reactions", {
    coupleId: relationship.couple.id,
    fromUserUid: user.uid,
    toUserUid: relationship.partner.uid,
    kind,
    message: randomMessage(kind),
    createdAt: Date.now(),
  });
  await bestEffortPartnerNotification(user, relationship, {
    type: kind === "like" ? "reaction" : "nudge",
    icon: kind === "like" ? "💗" : "📣",
    title: kind === "like" ? "收到一颗小红心" : "收到一次轻轻催促",
    body: kind === "like" ? `${cleanText(user.nickname, 10)} 给你点了个赞` : reaction.message,
    targetTab: "inbox",
    referenceId: reaction.id,
  });
  return response(201, { reaction });
}

async function sendNudge(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const presetKey = Object.prototype.hasOwnProperty.call(nudgePresets, payload.preset)
    ? payload.preset
    : "task";
  const recent = await queryAll("reactions", {
    coupleId: relationship.couple.id,
    fromUserUid: user.uid,
    toUserUid: relationship.partner.uid,
  }, [], 80);
  if (recent.some((item) => (
    item.kind === "tease"
    && item.nudgePreset === presetKey
    && Number(item.createdAt) > Date.now() - 15 * 60 * 1000
  ))) {
    return jsonError("同一种提醒刚刚送过啦，15 分钟后再催一次吧。", 429, "NUDGE_RATE_LIMITED");
  }
  const preset = nudgePresets[presetKey];
  const now = Date.now();
  const reaction = await addDocument("reactions", {
    coupleId: relationship.couple.id,
    fromUserUid: user.uid,
    toUserUid: relationship.partner.uid,
    kind: "tease",
    nudgePreset: presetKey,
    message: preset.body,
    createdAt: now,
  });
  await bestEffortPartnerNotification(user, relationship, {
    type: "nudge",
    icon: preset.icon,
    title: preset.title,
    body: preset.body,
    targetTab: presetKey === "task" ? "notebook" : "farm",
    referenceId: reaction.id,
  });
  return response(201, { reaction, preset: presetKey });
}

async function removeOwnedDocument(user, collectionName, id) {
  const space = await recordSpaceForUser(user);
  if (space.error) return space.error;
  const documentId = cleanText(id, 128);
  if (!documentId) return jsonError("没有找到这条记录。", 404, "RECORD_NOT_FOUND");
  const document = await getDocument(collectionName, documentId);
  if (!document || document.ownerUid !== user.uid || document.coupleId !== space.id) {
    return jsonError("只能删除自己当前田地里的记录。", 403, "RECORD_FORBIDDEN");
  }
  await db.collection(collectionName).doc(documentId).remove();
  return response(200, { ok: true });
}

function togetherDate(value) {
  return parseDateString(value, true) || dateKeyUtc(Date.now());
}

function togetherPromptForDate(date) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  const dayNumber = Number.isFinite(timestamp) ? Math.floor(timestamp / DAY) : Math.floor(Date.now() / DAY);
  const index = Math.abs(dayNumber) % togetherPrompts.length;
  return { id: `daily-${index}`, ...togetherPrompts[index] };
}

async function togetherHub(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const { couple, partner } = relationship;
  const date = togetherDate(payload.date);
  const prompt = togetherPromptForDate(date);
  const [optionDocuments, decisionDocuments, checkinDocuments, answerDocuments] = await Promise.all([
    queryAll("together_options", { coupleId: couple.id }, [], 80),
    queryAll("together_decisions", { coupleId: couple.id }, [], 220),
    queryAll("daily_checkins", { coupleId: couple.id, date }, [], 4),
    queryAll("daily_answers", { coupleId: couple.id, date, promptId: prompt.id }, [], 4),
  ]);
  const membership = membershipCatalog(couple);
  const historyFloor = Date.now() - membership.current.limits.decisionHistoryDays * DAY;
  const options = optionDocuments
    .filter((option) => option.active !== false)
    .sort((left, right) => right.createdAt - left.createdAt)
    .map(publicTogetherOption);
  const decisions = decisionDocuments
    .filter((decision) => decision.createdAt >= historyFloor)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 40)
    .map(publicDecision);
  const viewerAnswer = answerDocuments.find((answer) => answer.userUid === user.uid) || null;
  const partnerAnswer = answerDocuments.find((answer) => answer.userUid === partner.uid) || null;

  return response(200, {
    date,
    options,
    decisions,
    currentDecision: decisions.find((decision) => decision.status === "pending") || null,
    checkins: checkinDocuments.map((checkin) => ({
      userUid: checkin.userUid,
      mood: Math.max(1, Math.min(5, Number(checkin.mood) || 3)),
      moodLabel: moodLabels[Math.max(0, Math.min(4, (Number(checkin.mood) || 3) - 1))],
      energy: Math.max(1, Math.min(5, Number(checkin.energy) || 3)),
      note: cleanText(checkin.note, 40),
      updatedAt: checkin.updatedAt || checkin.createdAt,
    })),
    prompt: {
      ...prompt,
      viewerChoice: viewerAnswer ? viewerAnswer.choice : null,
      partnerChoice: viewerAnswer && partnerAnswer ? partnerAnswer.choice : null,
      partnerAnswered: Boolean(partnerAnswer),
      matched: viewerAnswer && partnerAnswer ? viewerAnswer.choice === partnerAnswer.choice : null,
    },
    membership,
  });
}

async function addTogetherOption(user, payload, requestContext) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const label = cleanText(payload.label, 20);
  const cuisine = cleanText(payload.cuisine, 10);
  const note = cleanText(payload.note, 30);
  if (label.length < 2) return jsonError("候选餐厅至少需要两个字。", 400, "OPTION_LABEL_INVALID");
  const safetyError = await checkMiniPublishedText(`${label}\n${cuisine}\n${note}`, requestContext);
  if (safetyError) return safetyError;
  const existing = await queryAll("together_options", { coupleId: relationship.couple.id }, [], 80);
  const active = existing.filter((option) => option.active !== false);
  const membership = membershipState(relationship.couple);
  if (active.length >= membership.limits.activeRestaurantOptions) {
    return jsonError(
      membership.plan === "plus" ? "候选池已经装满 50 家啦。" : "免费候选池最多 8 家，可领取心动会员体验继续添加。",
      409,
      "OPTION_LIMIT_REACHED",
    );
  }
  if (active.some((option) => cleanText(option.label, 20).toLowerCase() === label.toLowerCase())) {
    return jsonError("这家店已经在候选池里了。", 409, "OPTION_DUPLICATE");
  }
  const now = Date.now();
  const option = await addDocument("together_options", {
    coupleId: relationship.couple.id,
    type: "restaurant",
    label,
    cuisine,
    budget: normalizeBudget(payload.budget),
    note,
    active: true,
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
  });
  return response(201, { option: publicTogetherOption(option) });
}

async function archiveTogetherOption(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const id = cleanText(payload.id, 128);
  const option = id ? await getDocument("together_options", id) : null;
  if (!option || option.coupleId !== relationship.couple.id || option.active === false) {
    return jsonError("没有找到这个候选餐厅。", 404, "OPTION_NOT_FOUND");
  }
  await updateDocument("together_options", id, { active: false, archivedBy: user.uid, updatedAt: Date.now() });
  return response(200, { ok: true });
}

async function spinTogetherDecision(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const { couple } = relationship;
  const mode = decisionModes.includes(payload.mode) ? payload.mode : "classic";
  const membership = membershipState(couple);
  if (mode !== "classic" && membership.plan !== "plus") {
    return jsonError("这个抽签模式属于心动会员，可以先领取 7 天内测体验。", 403, "MEMBERSHIP_REQUIRED");
  }
  const [optionDocuments, decisionDocuments] = await Promise.all([
    queryAll("together_options", { coupleId: couple.id }, [], 80),
    queryAll("together_decisions", { coupleId: couple.id }, [], 100),
  ]);
  if (decisionDocuments.some((decision) => decision.status === "pending")) {
    return jsonError("先确认或否决当前结果，再抽下一家吧。", 409, "DECISION_PENDING");
  }
  let candidates = optionDocuments.filter((option) => option.active !== false);
  if (mode === "budget") {
    const budget = normalizeBudget(payload.budget);
    candidates = candidates.filter((option) => normalizeBudget(option.budget) === budget);
  }
  if (!candidates.length) return jsonError("候选池里还没有符合条件的餐厅。", 409, "NO_OPTIONS");
  if (mode === "fresh") {
    const recentIds = new Set(decisionDocuments
      .filter((decision) => decision.createdAt >= Date.now() - 7 * DAY)
      .map((decision) => decision.optionId));
    const fresh = candidates.filter((option) => !recentIds.has(option.id));
    if (fresh.length) candidates = fresh;
  }
  const selected = candidates[crypto.randomInt(candidates.length)];
  const now = Date.now();
  const decision = await addDocument("together_decisions", {
    coupleId: couple.id,
    optionId: selected.id,
    optionLabel: selected.label,
    cuisine: selected.cuisine,
    budget: normalizeBudget(selected.budget),
    mode,
    status: "pending",
    createdBy: user.uid,
    confirmedByUids: [user.uid],
    vetoedBy: null,
    createdAt: now,
    updatedAt: now,
  });
  await bestEffortPartnerNotification(user, relationship, {
    type: "decision_created",
    icon: "🎲",
    title: "等你一起确认",
    body: `${cleanText(user.nickname, 10)} 抽中了${cleanText(selected.label, 16)}`,
    targetTab: "together",
    referenceId: decision.id,
  });
  return response(201, { decision: publicDecision(decision) });
}

async function respondTogetherDecision(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const id = cleanText(payload.id, 128);
  const action = payload.response === "confirm" ? "confirm" : payload.response === "veto" ? "veto" : null;
  if (!action) return jsonError("没有认出这次选择。", 400, "DECISION_RESPONSE_INVALID");
  const decision = id ? await getDocument("together_decisions", id) : null;
  if (!decision || decision.coupleId !== relationship.couple.id) {
    return jsonError("没有找到这次共同决定。", 404, "DECISION_NOT_FOUND");
  }
  if (decision.status !== "pending") return jsonError("这次决定已经结束啦。", 409, "DECISION_FINISHED");
  const now = Date.now();
  if (action === "veto") {
    const updated = await updateDocument("together_decisions", id, {
      status: "vetoed",
      vetoedBy: user.uid,
      updatedAt: now,
    });
    await bestEffortPartnerNotification(user, relationship, {
      type: "decision_resolved",
      icon: "🙈",
      title: "这次重新抽一家",
      body: `${cleanText(user.nickname, 10)} 想换一个选择`,
      targetTab: "together",
      referenceId: `${decision.id}:veto:${user.uid}`,
    });
    return response(200, { decision: publicDecision(updated) });
  }
  const confirmedByUids = [...new Set([...(decision.confirmedByUids || []), user.uid])]
    .filter((uid) => relationship.couple.memberUids.includes(uid));
  const status = relationship.couple.memberUids.every((uid) => confirmedByUids.includes(uid)) ? "confirmed" : "pending";
  const updated = await updateDocument("together_decisions", id, { confirmedByUids, status, updatedAt: now });
  await bestEffortPartnerNotification(user, relationship, {
    type: "decision_resolved",
    icon: status === "confirmed" ? "🍽️" : "🤝",
    title: status === "confirmed" ? "共同决定确认啦" : "伴侣也点了确认",
    body: status === "confirmed"
      ? `${cleanText(decision.optionLabel, 16)}，就这么定啦`
      : `${cleanText(user.nickname, 10)} 等你一起确认`,
    targetTab: "together",
    referenceId: `${decision.id}:confirm:${user.uid}`,
  });
  return response(200, { decision: publicDecision(updated) });
}

async function saveDailyCheckin(user, payload, requestContext) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const date = togetherDate(payload.date);
  const mood = Number(payload.mood);
  const energy = Number(payload.energy);
  if (!Number.isInteger(mood) || mood < 1 || mood > 5 || !Number.isInteger(energy) || energy < 1 || energy > 5) {
    return jsonError("请选择今天的心情和能量。", 400, "CHECKIN_INVALID");
  }
  const note = cleanText(payload.note, 40);
  const safetyError = await checkMiniPublishedText(note, requestContext);
  if (safetyError) return safetyError;
  const now = Date.now();
  const id = `checkin_${sha256(`${relationship.couple.id}:${date}:${user.uid}`)}`;
  const existing = await getDocument("daily_checkins", id);
  await setDocument("daily_checkins", id, {
    coupleId: relationship.couple.id,
    userUid: user.uid,
    date,
    mood,
    energy,
    note,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  if (!existing) {
    await bestEffortPartnerNotification(user, relationship, {
      type: "mood_checkin",
      icon: "🌤️",
      title: "伴侣完成了今日心情",
      body: `${cleanText(user.nickname, 10)} 来田地报到啦`,
      targetTab: "together",
      referenceId: id,
    });
  }
  return response(200, { ok: true });
}

async function answerDailyQuestion(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const date = togetherDate(payload.date);
  const prompt = togetherPromptForDate(date);
  const choice = payload.choice === "a" ? "a" : payload.choice === "b" ? "b" : null;
  if (!choice) return jsonError("请选择一个答案。", 400, "ANSWER_INVALID");
  const now = Date.now();
  const id = `answer_${sha256(`${relationship.couple.id}:${date}:${prompt.id}:${user.uid}`)}`;
  await setDocument("daily_answers", id, {
    coupleId: relationship.couple.id,
    userUid: user.uid,
    date,
    promptId: prompt.id,
    choice,
    createdAt: now,
    updatedAt: now,
  });
  await bestEffortPartnerNotification(user, relationship, {
    type: "daily_answer",
    icon: "💭",
    title: "今日默契题有新答案",
    body: `${cleanText(user.nickname, 10)} 已经答题，等你揭晓`,
    targetTab: "together",
    referenceId: id,
  });
  return response(200, { ok: true });
}

async function claimFounderTrial(user) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const current = membershipState(relationship.couple);
  if (!current.trialAvailable) return jsonError("这片田地已经领取过内测体验啦。", 409, "TRIAL_ALREADY_CLAIMED");
  const now = Date.now();
  const founderTrialUntil = now + FOUNDER_TRIAL_DAYS * DAY;
  const couple = await updateDocument("couples", relationship.couple.id, {
    founderTrialClaimedAt: now,
    founderTrialUntil,
    updatedAt: now,
    updatedBy: user.uid,
  });
  return response(200, { membership: membershipCatalog(couple) });
}

async function joinMembershipWaitlist(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const now = Date.now();
  const plan = payload.plan === "yearly" ? "yearly" : "monthly";
  const id = `waitlist_${relationship.couple.id}`;
  await setDocument("membership_waitlist", id, {
    coupleId: relationship.couple.id,
    requestedBy: user.uid,
    plan,
    source: "miniprogram_v0.4",
    createdAt: now,
    updatedAt: now,
  });
  const couple = await updateDocument("couples", relationship.couple.id, {
    membershipWaitlistedAt: now,
    membershipWaitlistedPlan: plan,
    updatedAt: now,
    updatedBy: user.uid,
  });
  return response(200, { membership: membershipCatalog(couple) });
}

function communityAuthorSnapshot(user, couple) {
  return {
    authorUid: user.uid,
    authorNickname: user.nickname,
    authorAvatar: user.avatar,
    authorAvatarFileId: cleanText(user.avatarFileId, 512) || null,
    authorColor: user.color,
    authorCoupleId: couple.id,
    farmName: couple.farmName,
  };
}

function dateKeyUtc(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function publicCommunityStats(couple) {
  const settings = normalizeCommunitySettings(couple);
  const stats = couple.communityStats || {};
  const labels = {
    togetherDays: ["相伴", "天"],
    weeklyJointDays: ["本周共同打卡", "天"],
    weeklyCheers: ["本周互相回应", "次"],
    farmVitality: ["田地活力", "点"],
  };
  return settings.publicStats.map((key) => ({
    key,
    label: labels[key][0],
    value: Math.max(0, Number(stats[key]) || 0),
    suffix: labels[key][1],
  }));
}

async function refreshCommunityStats(couple) {
  const now = Date.now();
  const since = now - 7 * DAY;
  const [weights, poops, cheers] = await Promise.all([
    queryAll("weight_entries", { coupleId: couple.id }, [], 500),
    queryAll("poop_entries", { coupleId: couple.id }, [], 500),
    queryAll("reactions", { coupleId: couple.id }, [], 500),
  ]);
  const activityByMember = new Map(couple.memberUids.map((uid) => [uid, new Set()]));
  for (const entry of weights) {
    if (entry.recordedAt >= since && activityByMember.has(entry.ownerUid)) {
      activityByMember.get(entry.ownerUid).add(dateKeyUtc(entry.recordedAt));
    }
  }
  for (const entry of poops) {
    if (entry.occurredAt >= since && activityByMember.has(entry.ownerUid)) {
      activityByMember.get(entry.ownerUid).add(dateKeyUtc(entry.occurredAt));
    }
  }
  const [firstDays = new Set(), secondDays = new Set()] = [...activityByMember.values()];
  const weeklyJointDays = [...firstDays].filter((key) => secondDays.has(key)).length;
  const weeklyCheers = cheers.filter((item) => item.createdAt >= since).length;
  const togetherTimestamp = couple.togetherSince ? Date.parse(`${couple.togetherSince}T00:00:00Z`) : NaN;
  const togetherDays = Number.isFinite(togetherTimestamp)
    ? Math.max(1, Math.floor((now - togetherTimestamp) / DAY) + 1)
    : 0;
  const totalActiveDays = firstDays.size + secondDays.size;
  const farmVitality = weeklyJointDays * 18 + Math.min(weeklyCheers, 14) * 3 + Math.min(totalActiveDays, 14) * 2;
  const communityStats = { togetherDays, weeklyJointDays, weeklyCheers, farmVitality, updatedAt: now };
  const updated = await updateDocument("couples", couple.id, { communityStats, updatedAt: now });
  return updated;
}

async function maybeRefreshCommunityStats(couple, force = false) {
  const updatedAt = Number(couple.communityStats && couple.communityStats.updatedAt) || 0;
  if (!force && updatedAt > Date.now() - 10 * 60 * 1000) return couple;
  return refreshCommunityStats(couple);
}

async function updateCommunitySettings(user, payload, requestContext) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const enabled = Boolean(payload.enabled);
  const bio = cleanCommunityText(payload.bio, 80);
  const publicStats = normalizePublicStats(payload.publicStats);
  if (enabled && bio) {
    const safetyError = await checkTextSafety(bio, requestContext);
    if (safetyError) return safetyError;
  }
  const updated = await updateDocument("couples", relationship.couple.id, {
    communityEnabled: enabled,
    communityBio: bio,
    communityPublicStats: publicStats,
    updatedBy: user.uid,
    updatedAt: Date.now(),
  });
  const withStats = enabled ? await maybeRefreshCommunityStats(updated, true) : updated;
  return response(200, {
    settings: normalizeCommunitySettings(withStats),
    stats: publicCommunityStats(withStats),
  });
}

async function communityRateLimited(collectionName, userUid, windowMs, maximum) {
  const recent = await queryAll(collectionName, { authorUid: userUid }, [], 300);
  const threshold = Date.now() - windowMs;
  return recent.filter((item) => item.createdAt >= threshold && item.status !== "deleted").length >= maximum;
}

async function communityFeed(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const mode = payload.mode === "following" ? "following" : "all";
  const warnings = [];
  let viewerCouple = relationship.couple;
  if (normalizeCommunitySettings(viewerCouple).enabled) {
    try {
      viewerCouple = await maybeRefreshCommunityStats(viewerCouple);
    } catch (error) {
      warnings.push("viewer-stats");
      console.warn("community viewer stats refresh skipped", { stage: "viewer-stats", ...errorDetails(error) });
    }
  }
  const [couples, posts, comments, viewerLikes, follows, blocks] = await Promise.all([
    bestEffortQuery("couples", {}, [], 200, warnings, "couples"),
    bestEffortQuery("community_posts", {}, [], 120, warnings, "posts"),
    bestEffortQuery("community_comments", {}, [], 240, warnings, "comments"),
    bestEffortQuery("community_reactions", { fromCoupleId: viewerCouple.id }, [], 200, warnings, "likes"),
    bestEffortQuery("community_follows", { fromCoupleId: viewerCouple.id }, [], 200, warnings, "follows"),
    bestEffortQuery("community_blocks", { fromCoupleId: viewerCouple.id }, [], 200, warnings, "blocks"),
  ]);
  if (!couples.some((couple) => couple.id === viewerCouple.id)) couples.push(viewerCouple);
  const enabledCouples = new Map(couples
    .filter((couple) => couple.status === "active" && couple.communityEnabled)
    .map((couple) => [couple.id, couple]));
  const blockedIds = new Set(blocks.filter((item) => item.active !== false).map((item) => item.toCoupleId));
  const followedIds = new Set(follows.filter((item) => item.active !== false).map((item) => item.toCoupleId));
  const likedPostIds = new Set(viewerLikes.filter((item) => item.active !== false).map((item) => item.postId));
  const visiblePosts = posts
    .filter((post) => post.status === "published")
    .filter((post) => enabledCouples.has(post.authorCoupleId))
    .filter((post) => !blockedIds.has(post.authorCoupleId))
    .filter((post) => mode !== "following" || followedIds.has(post.authorCoupleId) || post.authorCoupleId === viewerCouple.id)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 40);
  const visiblePostIds = new Set(visiblePosts.map((post) => post.id));
  const commentsByPost = new Map();
  for (const comment of comments
    .filter((item) => item.status === "published" && visiblePostIds.has(item.postId))
    .filter((item) => enabledCouples.has(item.authorCoupleId) && !blockedIds.has(item.authorCoupleId))
    .sort((left, right) => left.createdAt - right.createdAt)) {
    const list = commentsByPost.get(comment.postId) || [];
    list.push(comment);
    commentsByPost.set(comment.postId, list.slice(-8));
  }
  const hydratedPosts = visiblePosts.map((post) => ({
    ...post,
    likedByViewer: likedPostIds.has(post.id),
    followingFarm: followedIds.has(post.authorCoupleId),
    ownFarm: post.authorCoupleId === viewerCouple.id,
    comments: commentsByPost.get(post.id) || [],
  }));
  const leaderboard = [...enabledCouples.values()]
    .filter((couple) => !blockedIds.has(couple.id))
    .map((couple) => ({
      coupleId: couple.id,
      farmName: couple.farmName,
      bio: cleanCommunityText(couple.communityBio, 80),
      stats: publicCommunityStats(couple),
      vitality: Number(couple.communityStats && couple.communityStats.farmVitality) || 0,
      following: followedIds.has(couple.id),
      ownFarm: couple.id === viewerCouple.id,
    }))
    .sort((left, right) => right.vitality - left.vitality)
    .slice(0, 12);
  return response(200, {
    mode,
    prompt: currentCommunityPrompt(),
    settings: normalizeCommunitySettings(viewerCouple),
    stats: publicCommunityStats(viewerCouple),
    posts: hydratedPosts,
    leaderboard,
    serviceState: warnings.length ? "degraded" : "healthy",
    warningCount: warnings.length,
  });
}

async function createCommunityPost(user, payload, requestContext) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  if (!relationship.couple.communityEnabled) {
    return jsonError("先开启你们的社区田地名片，再来发动态吧。", 409, "COMMUNITY_DISABLED");
  }
  if (await communityRateLimited("community_posts", user.uid, 15 * 60 * 1000, 5)) {
    return jsonError("发得有点快啦，歇一会儿再来村口聊。", 429, "POST_RATE_LIMITED");
  }
  const content = cleanCommunityText(payload.content, 300);
  if (content.length < 2) return jsonError("动态至少写两个字。", 400, "POST_CONTENT_INVALID");
  const topic = communityTopics.includes(payload.topic) ? payload.topic : "daily";
  const safetyError = await checkTextSafety(content, requestContext);
  if (safetyError) return safetyError;
  const imageFileId = normalizeAvatarFileId(payload.imageFileId, user.uid, "community");
  if (imageFileId === undefined) return jsonError("动态图片地址不正确，请重新选择。", 400, "POST_IMAGE_INVALID");
  if (imageFileId) {
    const imageError = await ensureImageModerated(user, imageFileId, "community", requestContext);
    if (imageError) return imageError;
  }
  const updatedCouple = await maybeRefreshCommunityStats(relationship.couple, true);
  const settings = normalizeCommunitySettings(updatedCouple);
  const shareStatKey = settings.publicStats.includes(payload.shareStatKey) ? payload.shareStatKey : null;
  const shareStat = shareStatKey
    ? publicCommunityStats(updatedCouple).find((item) => item.key === shareStatKey) || null
    : null;
  const now = Date.now();
  const post = await addDocument("community_posts", {
    ...communityAuthorSnapshot(user, updatedCouple),
    content,
    topic,
    promptId: cleanText(payload.promptId, 64) || null,
    imageFileId,
    shareStat,
    likeCount: 0,
    commentCount: 0,
    reportCount: 0,
    status: "published",
    createdAt: now,
    updatedAt: now,
  });
  return response(201, { post });
}

async function toggleCommunityLike(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  if (!relationship.couple.communityEnabled) {
    return jsonError("先开启社区田地名片，才能给别人送花。", 409, "COMMUNITY_DISABLED");
  }
  const postId = cleanText(payload.postId, 128);
  const post = postId ? await getDocument("community_posts", postId) : null;
  if (!post || post.status !== "published") return jsonError("这条动态已经不在村口了。", 404, "POST_NOT_FOUND");
  const authorCouple = await getDocument("couples", post.authorCoupleId);
  if (!authorCouple || authorCouple.status !== "active" || !authorCouple.communityEnabled) {
    return jsonError("这条动态已经不在村口了。", 404, "POST_NOT_FOUND");
  }
  const id = `like_${sha256(`${relationship.couple.id}:${postId}`)}`;
  const current = await getDocument("community_reactions", id);
  const active = !(current && current.active !== false);
  await setDocument("community_reactions", id, {
    postId,
    fromCoupleId: relationship.couple.id,
    active,
    createdAt: current ? current.createdAt : Date.now(),
    updatedAt: Date.now(),
  });
  const likes = await queryAll("community_reactions", { postId }, [], 2000);
  const likeCount = likes.filter((item) => item.active !== false).length;
  await updateDocument("community_posts", postId, { likeCount, updatedAt: Date.now() });
  return response(200, { active, likeCount });
}

async function addCommunityComment(user, payload, requestContext) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  if (!relationship.couple.communityEnabled) {
    return jsonError("先开启社区田地名片，才能参与留言。", 409, "COMMUNITY_DISABLED");
  }
  if (await communityRateLimited("community_comments", user.uid, 10 * 60 * 1000, 12)) {
    return jsonError("留言有点快啦，稍等一会儿。", 429, "COMMENT_RATE_LIMITED");
  }
  const postId = cleanText(payload.postId, 128);
  const post = postId ? await getDocument("community_posts", postId) : null;
  if (!post || post.status !== "published") return jsonError("这条动态已经不在村口了。", 404, "POST_NOT_FOUND");
  const authorCouple = await getDocument("couples", post.authorCoupleId);
  if (!authorCouple || authorCouple.status !== "active" || !authorCouple.communityEnabled) {
    return jsonError("这条动态已经不在村口了。", 404, "POST_NOT_FOUND");
  }
  const content = cleanCommunityText(payload.content, 120);
  if (!content) return jsonError("写点内容再留言吧。", 400, "COMMENT_CONTENT_INVALID");
  const safetyError = await checkTextSafety(content, requestContext);
  if (safetyError) return safetyError;
  const now = Date.now();
  const comment = await addDocument("community_comments", {
    ...communityAuthorSnapshot(user, relationship.couple),
    postId,
    content,
    status: "published",
    reportCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const comments = await queryAll("community_comments", { postId }, [], 2000);
  const commentCount = comments.filter((item) => item.status === "published").length;
  await updateDocument("community_posts", postId, { commentCount, updatedAt: now });
  return response(201, { comment, commentCount });
}

async function deleteCommunityContent(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const type = payload.type === "comment" ? "comment" : "post";
  const collectionName = type === "post" ? "community_posts" : "community_comments";
  const id = cleanText(payload.id, 128);
  const item = id ? await getDocument(collectionName, id) : null;
  if (!item) return jsonError("没有找到这条社区内容。", 404, "COMMUNITY_CONTENT_NOT_FOUND");
  const canDelete = type === "post"
    ? item.authorCoupleId === relationship.couple.id
    : item.authorUid === user.uid || item.authorCoupleId === relationship.couple.id;
  if (!canDelete) return jsonError("只能删除自己田地发布的内容。", 403, "COMMUNITY_CONTENT_FORBIDDEN");
  await updateDocument(collectionName, id, { status: "deleted", deletedAt: Date.now(), deletedBy: user.uid });
  if (type === "post" && item.imageFileId) await removeUploadedFile(item.imageFileId);
  if (type === "comment") {
    const post = await getDocument("community_posts", item.postId);
    if (post) {
      const comments = await queryAll("community_comments", { postId: post.id }, [], 2000);
      await updateDocument("community_posts", post.id, {
        commentCount: comments.filter((comment) => comment.status === "published").length,
        updatedAt: Date.now(),
      });
    }
  }
  return response(200, { ok: true });
}

async function toggleCommunityFollow(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  if (!relationship.couple.communityEnabled) {
    return jsonError("先开启社区田地名片，才能关注其他田地。", 409, "COMMUNITY_DISABLED");
  }
  const toCoupleId = cleanText(payload.coupleId, 128);
  if (!toCoupleId || toCoupleId === relationship.couple.id) {
    return jsonError("不能关注自己的田地。", 400, "FOLLOW_INVALID");
  }
  const target = await getDocument("couples", toCoupleId);
  if (!target || target.status !== "active" || !target.communityEnabled) {
    return jsonError("这片田地暂时没有开放社区名片。", 404, "COMMUNITY_FARM_NOT_FOUND");
  }
  const blockId = `block_${sha256(`${relationship.couple.id}:${toCoupleId}`)}`;
  const block = await getDocument("community_blocks", blockId);
  if (block && block.active !== false) {
    return jsonError("请先取消屏蔽，再关注这片田地。", 409, "COMMUNITY_FARM_BLOCKED");
  }
  const id = `follow_${sha256(`${relationship.couple.id}:${toCoupleId}`)}`;
  const current = await getDocument("community_follows", id);
  const active = !(current && current.active !== false);
  await setDocument("community_follows", id, {
    fromCoupleId: relationship.couple.id,
    toCoupleId,
    active,
    createdAt: current ? current.createdAt : Date.now(),
    updatedAt: Date.now(),
  });
  return response(200, { active });
}

async function reportCommunityContent(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const type = payload.type === "comment" ? "comment" : "post";
  const collectionName = type === "post" ? "community_posts" : "community_comments";
  const id = cleanText(payload.id, 128);
  const item = id ? await getDocument(collectionName, id) : null;
  if (!item || item.status !== "published") return jsonError("这条内容已经不存在。", 404, "COMMUNITY_CONTENT_NOT_FOUND");
  if (item.authorCoupleId === relationship.couple.id) return jsonError("不能举报自己田地的内容。", 400, "REPORT_SELF");
  const reasons = ["spam", "abuse", "privacy", "unsafe", "other"];
  const reason = reasons.includes(payload.reason) ? payload.reason : "other";
  const reportId = `report_${sha256(`${relationship.couple.id}:${type}:${id}`)}`;
  if (await getDocument("community_reports", reportId)) return jsonError("这条内容已经举报过了。", 409, "ALREADY_REPORTED");
  await setDocument("community_reports", reportId, {
    fromCoupleId: relationship.couple.id,
    targetCoupleId: item.authorCoupleId,
    targetType: type,
    targetId: id,
    reason,
    status: "pending",
    createdAt: Date.now(),
  });
  const reportCount = Number(item.reportCount || 0) + 1;
  await updateDocument(collectionName, id, {
    reportCount,
    status: reportCount >= 3 ? "review" : "published",
    updatedAt: Date.now(),
  });
  return response(201, { ok: true });
}

async function blockCommunityFarm(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const toCoupleId = cleanText(payload.coupleId, 128);
  if (!toCoupleId || toCoupleId === relationship.couple.id) {
    return jsonError("不能屏蔽自己的田地。", 400, "BLOCK_INVALID");
  }
  const target = await getDocument("couples", toCoupleId);
  if (!target || target.status !== "active" || !target.communityEnabled) {
    return jsonError("这片田地暂时没有开放社区名片。", 404, "COMMUNITY_FARM_NOT_FOUND");
  }
  const id = `block_${sha256(`${relationship.couple.id}:${toCoupleId}`)}`;
  await setDocument("community_blocks", id, {
    fromCoupleId: relationship.couple.id,
    toCoupleId,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const followId = `follow_${sha256(`${relationship.couple.id}:${toCoupleId}`)}`;
  const follow = await getDocument("community_follows", followId);
  if (follow && follow.active !== false) {
    await updateDocument("community_follows", followId, { active: false, updatedAt: Date.now() });
  }
  return response(200, { ok: true });
}

function villageMemberId(villageId, coupleId) {
  return `village_member_${sha256(`${villageId}:${coupleId}`).slice(0, 44)}`;
}

function publicVillage(village) {
  if (!village) return null;
  return {
    id: village.id,
    name: cleanCommunityText(village.name, 16),
    description: cleanCommunityText(village.description, 80),
    ownerCoupleId: village.ownerCoupleId,
    inviteCode: cleanText(village.inviteCode, 8),
    inviteExpiresAt: Number(village.inviteExpiresAt) || null,
    memberCount: Math.max(0, Number(village.memberCount) || 0),
    createdAt: village.createdAt,
    updatedAt: village.updatedAt || village.createdAt,
  };
}

async function activeVillageMembership(couple) {
  if (!couple) return null;
  if (couple.villageId) {
    const direct = await getDocument("village_members", villageMemberId(couple.villageId, couple.id));
    if (direct?.status === "active") return direct;
  }
  const memberships = await queryAll("village_members", { coupleId: couple.id }, [], 30);
  const active = memberships.find((item) => item.status === "active") || null;
  if (active && couple.villageId !== active.villageId) {
    await updateDocument("couples", couple.id, { villageId: active.villageId, updatedAt: Date.now() });
  }
  return active;
}

async function requireVillage(user) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship;
  const membership = await activeVillageMembership(relationship.couple);
  if (!membership) return { error: jsonError("先创建或加入一个熟人村庄。", 409, "VILLAGE_REQUIRED") };
  const village = await getDocument("villages", membership.villageId);
  if (!village || village.status !== "active") {
    await updateDocument("village_members", membership.id, { status: "inactive", updatedAt: Date.now() });
    await updateDocument("couples", relationship.couple.id, { villageId: null, updatedAt: Date.now() });
    return { error: jsonError("这个村庄已经结束，请创建或加入新的村庄。", 410, "VILLAGE_INACTIVE") };
  }
  return { ...relationship, membership, village };
}

async function villageMemberSnapshots(villageId) {
  const memberships = await queryAll("village_members", { villageId }, [], VILLAGE_MEMBER_LIMIT + 10);
  const activeMemberships = memberships
    .filter((item) => item.status === "active")
    .sort((left, right) => left.joinedAt - right.joinedAt);
  const snapshots = [];
  for (const membership of activeMemberships) {
    const couple = await getDocument("couples", membership.coupleId);
    if (!couple || couple.status !== "active") continue;
    const users = (await Promise.all(couple.memberUids.map((uid) => getDocument("users", uid)))).filter(Boolean);
    snapshots.push({
      coupleId: couple.id,
      farmName: couple.farmName,
      role: membership.role === "owner" ? "owner" : "member",
      joinedAt: membership.joinedAt,
      people: users.map((person) => publicUser(person)),
    });
  }
  return snapshots;
}

async function villageHubData(user, relationship, membership, village) {
  const members = await villageMemberSnapshots(village.id);
  return response(200, {
    village: publicVillage({ ...village, memberCount: members.length }),
    membership: {
      role: membership.role === "owner" ? "owner" : "member",
      joinedAt: membership.joinedAt,
    },
    members,
    viewerCoupleId: relationship.couple.id,
    prompt: currentCommunityPrompt(),
  });
}

async function villageHub(user) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const membership = await activeVillageMembership(relationship.couple);
  if (!membership) {
    return response(200, {
      village: null,
      membership: null,
      members: [],
      viewerCoupleId: relationship.couple.id,
      prompt: currentCommunityPrompt(),
      legacyCommunity: {
        enabled: Boolean(relationship.couple.communityEnabled),
        reason: "旧村口依赖公开名片和陌生用户规模，0.6 已改为邀请码熟人村庄。",
      },
    });
  }
  const village = await getDocument("villages", membership.villageId);
  if (!village || village.status !== "active") {
    await updateDocument("village_members", membership.id, { status: "inactive", updatedAt: Date.now() });
    await updateDocument("couples", relationship.couple.id, { villageId: null, updatedAt: Date.now() });
    return response(200, {
      village: null,
      membership: null,
      members: [],
      viewerCoupleId: relationship.couple.id,
      prompt: currentCommunityPrompt(),
    });
  }
  return villageHubData(user, relationship, membership, village);
}

async function generateVillageInvite(villageId, createdBy) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomInviteCode();
    if (await getDocument("village_invites", code)) continue;
    const now = Date.now();
    const expiresAt = now + 30 * DAY;
    await setDocument("village_invites", code, {
      code,
      villageId,
      status: "active",
      useCount: 0,
      createdBy,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });
    return { code, expiresAt };
  }
  return null;
}

async function createVillage(user, payload, requestContext) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  if (await activeVillageMembership(relationship.couple)) {
    return jsonError("你们已经在一个村庄里了。", 409, "VILLAGE_ALREADY_JOINED");
  }
  const name = cleanCommunityText(payload.name, 16);
  const description = cleanCommunityText(payload.description, 80);
  if (name.length < 2) return jsonError("村庄名称至少需要两个字。", 400, "VILLAGE_NAME_INVALID");
  const safetyError = await checkTextSafety(`${name} ${description}`.trim(), requestContext);
  if (safetyError) return safetyError;
  const now = Date.now();
  const villageId = `village_${randomId(12)}`;
  const invite = await generateVillageInvite(villageId, user.uid);
  if (!invite) return jsonError("村庄邀请码生成失败，请稍后重试。", 500, "VILLAGE_INVITE_FAILED");
  const village = await setDocument("villages", villageId, {
    name,
    description,
    ownerCoupleId: relationship.couple.id,
    inviteCode: invite.code,
    inviteExpiresAt: invite.expiresAt,
    memberCount: 1,
    status: "active",
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
  });
  const membership = await setDocument("village_members", villageMemberId(villageId, relationship.couple.id), {
    villageId,
    coupleId: relationship.couple.id,
    role: "owner",
    status: "active",
    joinedBy: user.uid,
    joinedAt: now,
    updatedAt: now,
  });
  await updateDocument("couples", relationship.couple.id, { villageId, updatedAt: now, updatedBy: user.uid });
  return villageHubData(user, relationship, membership, village);
}

async function joinVillage(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  if (await activeVillageMembership(relationship.couple)) {
    return jsonError("你们已经在一个村庄里了。", 409, "VILLAGE_ALREADY_JOINED");
  }
  const code = cleanText(payload.code, 8).toUpperCase();
  if (code.length !== 8) return jsonError("请输入完整的 8 位村庄邀请码。", 400, "VILLAGE_INVITE_INVALID");
  const invite = await getDocument("village_invites", code);
  if (!invite || invite.status !== "active") return jsonError("这个村庄邀请码不存在或已失效。", 404, "VILLAGE_INVITE_NOT_FOUND");
  if (invite.expiresAt < Date.now()) {
    await updateDocument("village_invites", code, { status: "expired", updatedAt: Date.now() });
    return jsonError("这个村庄邀请码已经过期，请让村长重新生成。", 410, "VILLAGE_INVITE_EXPIRED");
  }
  const village = await getDocument("villages", invite.villageId);
  if (!village || village.status !== "active") return jsonError("这个村庄已经结束。", 410, "VILLAGE_INACTIVE");
  const members = await villageMemberSnapshots(village.id);
  if (members.length >= VILLAGE_MEMBER_LIMIT) {
    return jsonError(`一个村庄最多容纳 ${VILLAGE_MEMBER_LIMIT} 对情侣。`, 409, "VILLAGE_FULL");
  }
  const now = Date.now();
  const membership = await setDocument("village_members", villageMemberId(village.id, relationship.couple.id), {
    villageId: village.id,
    coupleId: relationship.couple.id,
    role: "member",
    status: "active",
    joinedBy: user.uid,
    joinedAt: now,
    updatedAt: now,
  });
  const updatedVillage = await updateDocument("villages", village.id, {
    memberCount: members.length + 1,
    updatedAt: now,
  });
  await Promise.all([
    updateDocument("couples", relationship.couple.id, { villageId: village.id, updatedAt: now, updatedBy: user.uid }),
    updateDocument("village_invites", code, { useCount: Number(invite.useCount || 0) + 1, updatedAt: now }),
  ]);
  return villageHubData(user, relationship, membership, updatedVillage);
}

async function updateVillage(user, payload, requestContext) {
  const context = await requireVillage(user);
  if (context.error) return context.error;
  if (context.membership.role !== "owner") return jsonError("只有村长可以修改村庄资料。", 403, "VILLAGE_OWNER_REQUIRED");
  const name = cleanCommunityText(payload.name, 16);
  const description = cleanCommunityText(payload.description, 80);
  if (name.length < 2) return jsonError("村庄名称至少需要两个字。", 400, "VILLAGE_NAME_INVALID");
  const safetyError = await checkTextSafety(`${name} ${description}`.trim(), requestContext);
  if (safetyError) return safetyError;
  const village = await updateDocument("villages", context.village.id, {
    name,
    description,
    updatedAt: Date.now(),
    updatedBy: user.uid,
  });
  return villageHubData(user, context, context.membership, village);
}

async function regenerateVillageInvite(user) {
  const context = await requireVillage(user);
  if (context.error) return context.error;
  if (context.membership.role !== "owner") return jsonError("只有村长可以更换邀请码。", 403, "VILLAGE_OWNER_REQUIRED");
  if (context.village.inviteCode) {
    const oldInvite = await getDocument("village_invites", context.village.inviteCode);
    if (oldInvite) await updateDocument("village_invites", oldInvite.id, { status: "replaced", updatedAt: Date.now() });
  }
  const invite = await generateVillageInvite(context.village.id, user.uid);
  if (!invite) return jsonError("邀请码生成失败，请稍后重试。", 500, "VILLAGE_INVITE_FAILED");
  const village = await updateDocument("villages", context.village.id, {
    inviteCode: invite.code,
    inviteExpiresAt: invite.expiresAt,
    updatedAt: Date.now(),
    updatedBy: user.uid,
  });
  return villageHubData(user, context, context.membership, village);
}

async function detachCoupleFromVillage(couple, userUid) {
  const membership = await activeVillageMembership(couple);
  if (!membership) return { ok: true };
  const village = await getDocument("villages", membership.villageId);
  if (!village || village.status !== "active") {
    await updateDocument("village_members", membership.id, { status: "inactive", updatedAt: Date.now() });
    await updateDocument("couples", couple.id, { villageId: null, updatedAt: Date.now() });
    return { ok: true };
  }
  const memberships = await queryAll("village_members", { villageId: village.id }, [], VILLAGE_MEMBER_LIMIT + 10);
  const others = memberships
    .filter((item) => item.status === "active" && item.coupleId !== couple.id)
    .sort((left, right) => left.joinedAt - right.joinedAt);
  const now = Date.now();
  await updateDocument("village_members", membership.id, {
    status: "left",
    leftAt: now,
    leftBy: userUid,
    updatedAt: now,
  });
  await updateDocument("couples", couple.id, { villageId: null, updatedAt: now, updatedBy: userUid });
  if (!others.length) {
    await updateDocument("villages", village.id, { status: "archived", memberCount: 0, updatedAt: now });
    if (village.inviteCode) {
      const invite = await getDocument("village_invites", village.inviteCode);
      if (invite) await updateDocument("village_invites", invite.id, { status: "archived", updatedAt: now });
    }
    return { ok: true, archived: true };
  }
  const fields = { memberCount: others.length, updatedAt: now };
  if (village.ownerCoupleId === couple.id) {
    fields.ownerCoupleId = others[0].coupleId;
    await updateDocument("village_members", others[0].id, { role: "owner", updatedAt: now });
  }
  await updateDocument("villages", village.id, fields);
  return { ok: true, archived: false };
}

async function leaveVillage(user) {
  const context = await requireVillage(user);
  if (context.error) return context.error;
  await detachCoupleFromVillage(context.couple, user.uid);
  return response(200, { ok: true });
}

async function dissolveVillage(user) {
  const context = await requireVillage(user);
  if (context.error) return context.error;
  if (context.membership.role !== "owner") return jsonError("只有村长可以解散村庄。", 403, "VILLAGE_OWNER_REQUIRED");
  const memberships = await queryAll("village_members", { villageId: context.village.id }, [], VILLAGE_MEMBER_LIMIT + 10);
  const now = Date.now();
  for (const membership of memberships.filter((item) => item.status === "active")) {
    await updateDocument("village_members", membership.id, {
      status: "dissolved",
      leftAt: now,
      leftBy: user.uid,
      updatedAt: now,
    });
    const memberCouple = await getDocument("couples", membership.coupleId);
    if (memberCouple?.villageId === context.village.id) {
      await updateDocument("couples", memberCouple.id, { villageId: null, updatedAt: now, updatedBy: user.uid });
    }
  }
  await updateDocument("villages", context.village.id, {
    status: "dissolved",
    memberCount: 0,
    dissolvedAt: now,
    dissolvedBy: user.uid,
    updatedAt: now,
  });
  if (context.village.inviteCode) {
    const invite = await getDocument("village_invites", context.village.inviteCode);
    if (invite) await updateDocument("village_invites", invite.id, { status: "dissolved", updatedAt: now });
  }
  return response(200, { ok: true });
}

async function villageFeed(user) {
  const context = await requireVillage(user);
  if (context.error) return context.error;
  const warnings = [];
  const [memberships, posts, comments, reactions] = await Promise.all([
    bestEffortQuery("village_members", { villageId: context.village.id }, [], VILLAGE_MEMBER_LIMIT + 10, warnings, "members"),
    bestEffortQuery("community_posts", { villageId: context.village.id }, [], 160, warnings, "posts"),
    bestEffortQuery("community_comments", { villageId: context.village.id }, [], 320, warnings, "comments"),
    bestEffortQuery("community_reactions", { villageId: context.village.id }, [], 500, warnings, "reactions"),
  ]);
  const activeCoupleIds = new Set(memberships.filter((item) => item.status === "active").map((item) => item.coupleId));
  activeCoupleIds.add(context.couple.id);
  const likedPostIds = new Set(reactions
    .filter((item) => item.fromCoupleId === context.couple.id && item.active !== false)
    .map((item) => item.postId));
  const visiblePosts = posts
    .filter((post) => post.status === "published" && activeCoupleIds.has(post.authorCoupleId))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 60);
  const visiblePostIds = new Set(visiblePosts.map((post) => post.id));
  const commentsByPost = new Map();
  for (const comment of comments
    .filter((item) => item.status === "published" && visiblePostIds.has(item.postId))
    .filter((item) => activeCoupleIds.has(item.authorCoupleId))
    .sort((left, right) => left.createdAt - right.createdAt)) {
    const list = commentsByPost.get(comment.postId) || [];
    list.push(comment);
    commentsByPost.set(comment.postId, list.slice(-12));
  }
  return response(200, {
    village: publicVillage(context.village),
    prompt: currentCommunityPrompt(),
    posts: visiblePosts.map((post) => ({
      ...post,
      likedByViewer: likedPostIds.has(post.id),
      ownCouple: post.authorCoupleId === context.couple.id,
      comments: commentsByPost.get(post.id) || [],
    })),
    serviceState: warnings.length ? "degraded" : "healthy",
    warningCount: warnings.length,
  });
}

async function createVillagePost(user, payload, requestContext) {
  const context = await requireVillage(user);
  if (context.error) return context.error;
  if (await communityRateLimited("community_posts", user.uid, 15 * 60 * 1000, 5)) {
    return jsonError("发得有点快啦，歇一会儿再来村里聊。", 429, "POST_RATE_LIMITED");
  }
  const content = cleanCommunityText(payload.content, 300);
  if (content.length < 2) return jsonError("动态至少写两个字。", 400, "POST_CONTENT_INVALID");
  const topic = communityTopics.includes(payload.topic) ? payload.topic : "daily";
  const safetyError = await checkTextSafety(content, requestContext);
  if (safetyError) return safetyError;
  const imageFileId = normalizeAvatarFileId(payload.imageFileId, user.uid, "community");
  if (imageFileId === undefined) return jsonError("动态图片地址不正确，请重新选择。", 400, "POST_IMAGE_INVALID");
  if (imageFileId) {
    const imageError = await ensureImageModerated(user, imageFileId, "community", requestContext);
    if (imageError) return imageError;
  }
  const now = Date.now();
  const post = await addDocument("community_posts", {
    ...communityAuthorSnapshot(user, context.couple),
    villageId: context.village.id,
    content,
    topic,
    promptId: cleanText(payload.promptId, 64) || null,
    imageFileId,
    shareStat: null,
    likeCount: 0,
    commentCount: 0,
    reportCount: 0,
    status: "published",
    createdAt: now,
    updatedAt: now,
  });
  return response(201, { post });
}

async function toggleVillageLike(user, payload) {
  const context = await requireVillage(user);
  if (context.error) return context.error;
  const postId = cleanText(payload.postId, 128);
  const post = postId ? await getDocument("community_posts", postId) : null;
  if (!post || post.status !== "published" || post.villageId !== context.village.id) {
    return jsonError("这条动态已经不在村里了。", 404, "POST_NOT_FOUND");
  }
  const id = `village_like_${sha256(`${context.village.id}:${context.couple.id}:${postId}`).slice(0, 48)}`;
  const current = await getDocument("community_reactions", id);
  const active = !(current && current.active !== false);
  await setDocument("community_reactions", id, {
    villageId: context.village.id,
    postId,
    fromCoupleId: context.couple.id,
    active,
    createdAt: current?.createdAt || Date.now(),
    updatedAt: Date.now(),
  });
  const likes = await queryAll("community_reactions", { postId }, [], 2000);
  const likeCount = likes.filter((item) => item.active !== false).length;
  await updateDocument("community_posts", postId, { likeCount, updatedAt: Date.now() });
  if (active) {
    const authorCouple = await getDocument("couples", post.authorCoupleId);
    if (authorCouple?.status === "active") {
      await bestEffortNotificationsForCouple(user, authorCouple, {
        type: "village_like",
        icon: "🌸",
        title: "村庄动态收到小花",
        body: `${cleanText(context.couple.farmName, 12)} 给你们送了小花`,
        location: cleanText(context.village.name, 20),
        targetTab: "village",
        referenceId: `${postId}:${context.couple.id}`,
      });
    }
  }
  return response(200, { active, likeCount });
}

async function addVillageComment(user, payload, requestContext) {
  const context = await requireVillage(user);
  if (context.error) return context.error;
  if (await communityRateLimited("community_comments", user.uid, 10 * 60 * 1000, 12)) {
    return jsonError("留言有点快啦，稍等一会儿。", 429, "COMMENT_RATE_LIMITED");
  }
  const postId = cleanText(payload.postId, 128);
  const post = postId ? await getDocument("community_posts", postId) : null;
  if (!post || post.status !== "published" || post.villageId !== context.village.id) {
    return jsonError("这条动态已经不在村里了。", 404, "POST_NOT_FOUND");
  }
  const content = cleanCommunityText(payload.content, 120);
  if (!content) return jsonError("写点内容再留言吧。", 400, "COMMENT_CONTENT_INVALID");
  const safetyError = await checkTextSafety(content, requestContext);
  if (safetyError) return safetyError;
  const now = Date.now();
  const comment = await addDocument("community_comments", {
    ...communityAuthorSnapshot(user, context.couple),
    villageId: context.village.id,
    postId,
    content,
    status: "published",
    reportCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const comments = await queryAll("community_comments", { postId }, [], 2000);
  const commentCount = comments.filter((item) => item.status === "published").length;
  await updateDocument("community_posts", postId, { commentCount, updatedAt: now });
  const authorCouple = await getDocument("couples", post.authorCoupleId);
  if (authorCouple?.status === "active") {
    await bestEffortNotificationsForCouple(user, authorCouple, {
      type: "village_comment",
      icon: "💬",
      title: "村庄动态有新留言",
      body: `${cleanText(user.nickname, 10)}：${cleanText(content, 18)}`,
      location: cleanText(context.village.name, 20),
      targetTab: "village",
      referenceId: comment.id,
    });
  }
  return response(201, { comment, commentCount });
}

async function deleteVillageContent(user, payload) {
  const context = await requireVillage(user);
  if (context.error) return context.error;
  const type = payload.type === "comment" ? "comment" : "post";
  const collectionName = type === "post" ? "community_posts" : "community_comments";
  const id = cleanText(payload.id, 128);
  const item = id ? await getDocument(collectionName, id) : null;
  if (!item || item.villageId !== context.village.id) return jsonError("没有找到这条村庄内容。", 404, "VILLAGE_CONTENT_NOT_FOUND");
  const canDelete = type === "post"
    ? item.authorCoupleId === context.couple.id
    : item.authorUid === user.uid || item.authorCoupleId === context.couple.id;
  if (!canDelete) return jsonError("只能删除自己发布的内容。", 403, "VILLAGE_CONTENT_FORBIDDEN");
  await updateDocument(collectionName, id, { status: "deleted", deletedAt: Date.now(), deletedBy: user.uid });
  if (type === "post" && item.imageFileId) await removeUploadedFile(item.imageFileId);
  if (type === "comment") {
    const comments = await queryAll("community_comments", { postId: item.postId }, [], 2000);
    await updateDocument("community_posts", item.postId, {
      commentCount: comments.filter((comment) => comment.status === "published").length,
      updatedAt: Date.now(),
    });
  }
  return response(200, { ok: true });
}

async function reportVillageContent(user, payload) {
  const context = await requireVillage(user);
  if (context.error) return context.error;
  const type = payload.type === "comment" ? "comment" : "post";
  const collectionName = type === "post" ? "community_posts" : "community_comments";
  const id = cleanText(payload.id, 128);
  const item = id ? await getDocument(collectionName, id) : null;
  if (!item || item.villageId !== context.village.id || item.status !== "published") {
    return jsonError("这条内容已经不存在。", 404, "VILLAGE_CONTENT_NOT_FOUND");
  }
  if (item.authorCoupleId === context.couple.id) return jsonError("不能举报自己发布的内容。", 400, "REPORT_SELF");
  const reasons = ["spam", "abuse", "privacy", "unsafe", "other"];
  const reason = reasons.includes(payload.reason) ? payload.reason : "other";
  const reportId = `village_report_${sha256(`${context.village.id}:${context.couple.id}:${type}:${id}`).slice(0, 44)}`;
  if (await getDocument("community_reports", reportId)) return jsonError("这条内容已经举报过了。", 409, "ALREADY_REPORTED");
  await setDocument("community_reports", reportId, {
    villageId: context.village.id,
    fromCoupleId: context.couple.id,
    targetCoupleId: item.authorCoupleId,
    targetType: type,
    targetId: id,
    reason,
    status: "pending",
    createdAt: Date.now(),
  });
  const reportCount = Number(item.reportCount || 0) + 1;
  await updateDocument(collectionName, id, {
    reportCount,
    status: reportCount >= 3 ? "review" : "published",
    updatedAt: Date.now(),
  });
  return response(201, { ok: true });
}

async function handleAction(user, action, payload, requestContext) {
  switch (action) {
    case "bootstrap": return bootstrap(user);
    case "get-dashboard": return readDashboard(user);
    case "moderate-upload": return moderateUpload(user, payload, requestContext);
    case "update-profile": return updateProfile(user, payload, requestContext);
    case "update-couple-settings": return updateCoupleSettings(user, payload, requestContext);
    case "update-reminders": return updateReminderSettings(user, payload);
    case "create-invite": return createInvite(user);
    case "accept-invite": return acceptInvite(user, payload);
    case "unbind": return unbind(user);
    case "add-anniversary": return addAnniversary(user, payload, requestContext);
    case "update-anniversary": return updateAnniversary(user, payload, requestContext);
    case "delete-anniversary": return deleteAnniversary(user, payload);
    case "shared-notebook": return sharedNotebook(user);
    case "create-shared-memo": return createSharedMemo(user, payload, requestContext);
    case "update-shared-memo": return updateSharedMemo(user, payload, requestContext);
    case "toggle-shared-memo": return toggleSharedMemo(user, payload);
    case "delete-shared-memo": return deleteSharedMemo(user, payload);
    case "save-subscription-consent": return saveSubscriptionConsent(user, payload, requestContext);
    case "notification-center": return notificationCenter(user);
    case "mark-notification-read": return markNotificationRead(user, payload);
    case "update-notification-preferences": return updateNotificationPreferences(user, payload);
    case "add-weight": return addWeight(user, payload);
    case "add-poop": return addPoop(user, payload);
    case "update-weight": return updateWeight(user, payload);
    case "update-poop": return updatePoop(user, payload);
    case "react": return react(user, payload);
    case "send-nudge": return sendNudge(user, payload);
    case "complete-daily-spark": return completeDailySpark(user);
    case "delete-weight": return removeOwnedDocument(user, "weight_entries", payload.id);
    case "delete-poop": return removeOwnedDocument(user, "poop_entries", payload.id);
    case "clear-my-records": return clearMyRecords(user);
    case "delete-identity": return deleteIdentity(user);
    case "together-hub": return togetherHub(user, payload);
    case "add-together-option": return addTogetherOption(user, payload, requestContext);
    case "archive-together-option": return archiveTogetherOption(user, payload);
    case "spin-together-decision": return spinTogetherDecision(user, payload);
    case "respond-together-decision": return respondTogetherDecision(user, payload);
    case "save-daily-checkin": return saveDailyCheckin(user, payload, requestContext);
    case "answer-daily-question": return answerDailyQuestion(user, payload);
    case "claim-founder-trial": return claimFounderTrial(user);
    case "join-membership-waitlist": return joinMembershipWaitlist(user, payload);
    case "village-hub": return villageHub(user);
    case "create-village": return createVillage(user, payload, requestContext);
    case "join-village": return joinVillage(user, payload);
    case "update-village": return updateVillage(user, payload, requestContext);
    case "regenerate-village-invite": return regenerateVillageInvite(user);
    case "leave-village": return leaveVillage(user);
    case "dissolve-village": return dissolveVillage(user);
    case "village-feed": return villageFeed(user);
    case "create-village-post": return createVillagePost(user, payload, requestContext);
    case "toggle-village-like": return toggleVillageLike(user, payload);
    case "add-village-comment": return addVillageComment(user, payload, requestContext);
    case "delete-village-content": return deleteVillageContent(user, payload);
    case "report-village-content": return reportVillageContent(user, payload);
    case "community-feed": return communityFeed(user, payload);
    case "update-community-settings": return updateCommunitySettings(user, payload, requestContext);
    case "create-community-post": return createCommunityPost(user, payload, requestContext);
    case "toggle-community-like": return toggleCommunityLike(user, payload);
    case "add-community-comment": return addCommunityComment(user, payload, requestContext);
    case "delete-community-content": return deleteCommunityContent(user, payload);
    case "toggle-community-follow": return toggleCommunityFollow(user, payload);
    case "report-community-content": return reportCommunityContent(user, payload);
    case "block-community-farm": return blockCommunityFarm(user, payload);
    default: return jsonError("没有认出这个操作。", 405, "ACTION_UNKNOWN");
  }
}

exports.main = async function main(event = {}, context = {}) {
  const action = cleanText(event.action || (event.payload && event.payload.action), 48).toLowerCase();
  const timerTriggered = event.Type === "Timer" || event.type === "timer" || event.triggerName === "couple-reminders";
  if (timerTriggered) {
    try {
      await ensureCollections();
      const reminderResult = await maybeDispatchDueReminders("timer", true);
      const scheduled = await dispatchScheduledUserReminders("timer");
      const activity = await dispatchPendingActivityNotifications("timer");
      return response(200, { ...reminderResult, scheduled, activity });
    } catch (error) {
      console.error("scheduled reminder sweep failed", errorDetails(error));
      return response(500, { ok: false, code: "REMINDER_SWEEP_FAILED" });
    }
  }
  if (action === "health") {
    return response(200, {
      ok: true,
      service: "couple-tracker",
      version: "0.8.0",
      serverTime: Date.now(),
    });
  }

  if (action === "content-safety-health") {
    try {
      await ensureCollections();
      await queryAll("content_moderations", {}, [["updatedAt", "desc"]], 1);
      return response(200, {
        ok: true,
        service: "content-safety",
        version: "0.8.0",
        apis: ["security.msgSecCheck", "security.imgSecCheck"],
        coverage: [
          "avatar-image",
          "nickname",
          "farm-name",
          "anniversary",
          "shared-memo",
          "restaurant-option",
          "mood-note",
          "community-profile",
          "community-post-image-text",
          "community-comment",
          "village-profile",
          "village-post-image-text",
          "village-comment",
        ],
        rejectMessage: "你发布的内容含违规信息。",
        serverTime: Date.now(),
      });
    } catch (error) {
      const diagnosticId = cleanText(context.requestId, 64) || randomId(4);
      console.error("content safety health check failed", { diagnosticId, ...errorDetails(error) });
      return response(500, {
        error: "内容安全服务尚未准备好。",
        code: "CONTENT_SAFETY_HEALTH_FAILED",
        diagnosticId,
      });
    }
  }

  if (action === "community-health") {
    try {
      await ensureCollections();
      await Promise.all([
        queryAll("couples", {}, [], 1),
        queryAll("community_posts", {}, [["createdAt", "desc"]], 1),
        queryAll("community_comments", {}, [["createdAt", "desc"]], 1),
      ]);
      return response(200, {
        ok: true,
        service: "community",
        version: "0.8.0",
        serverTime: Date.now(),
      });
    } catch (error) {
      const diagnosticId = cleanText(context.requestId, 64) || randomId(4);
      console.error("community health check failed", { diagnosticId, error });
      return response(500, {
        error: "村口云端尚未准备好。",
        code: "COMMUNITY_HEALTH_FAILED",
        diagnosticId,
      });
    }
  }

  if (action === "village-health") {
    try {
      await ensureCollections();
      await Promise.all([
        queryAll("villages", {}, [], 1),
        queryAll("village_members", {}, [], 1),
        queryAll("village_invites", {}, [], 1),
      ]);
      return response(200, {
        ok: true,
        service: "village",
        version: "0.8.0",
        serverTime: Date.now(),
      });
    } catch (error) {
      const diagnosticId = cleanText(context.requestId, 64) || randomId(4);
      console.error("village health check failed", { diagnosticId, ...errorDetails(error) });
      return response(500, {
        error: "熟人村庄云端尚未准备好。",
        code: "VILLAGE_HEALTH_FAILED",
        diagnosticId,
      });
    }
  }

  if (action === "notification-health") {
    try {
      await ensureCollections();
      await Promise.all([
        queryAll("in_app_notifications", {}, [["createdAt", "desc"]], 1),
        queryAll("notification_subscriptions", {}, [], 1),
        queryAll("notification_deliveries", {}, [], 1),
      ]);
      return response(200, {
        ok: true,
        service: "notifications",
        version: "0.8.0",
        templateConfigured: Boolean(WECHAT_MEMO_TEMPLATE_ID),
        serverTime: Date.now(),
      });
    } catch (error) {
      const diagnosticId = cleanText(context.requestId, 64) || randomId(4);
      console.error("notification health check failed", { diagnosticId, ...errorDetails(error) });
      return response(500, {
        error: "情侣消息云端尚未准备好。",
        code: "NOTIFICATION_HEALTH_FAILED",
        diagnosticId,
      });
    }
  }

  const platformCaller = getPlatformCaller();
  if (!platformCaller) return jsonError("云端身份已失效，请刷新后重试。", 401, "PLATFORM_AUTH_REQUIRED");
  const payload = event.payload && typeof event.payload === "object" ? event.payload : event;
  try {
    await ensureCollections();
    if (action === "register") return await registerAccount(platformCaller, payload);
    if (action === "login") return await loginAccount(platformCaller, payload);
    if (action === "recover-account") return await recoverAccount(platformCaller, payload);

    let identity;
    if (event.channel === "mini" && platformCaller.openId && !event.sessionToken) {
      identity = {
        uid: `wx_${sha256(`${platformCaller.appId || "wechat"}:${platformCaller.openId}`).slice(0, 40)}`,
        authProvider: "wechat",
      };
    } else {
      identity = await resolveSession(event.sessionToken, platformCaller);
    }
    if (!identity) return jsonError("登录状态已失效，请重新登录。", 401, "AUTH_REQUIRED");

    if (action === "logout") {
      if (identity.session) {
        await updateDocument("sessions", identity.session.id, { revokedAt: Date.now() });
      }
      return response(200, { ok: true });
    }

    const user = await getOrCreateUser(identity);
    if (action === "bootstrap" && event.channel === "mini") {
      try {
        await maybeDispatchDueReminders("mini-bootstrap");
      } catch (error) {
        console.warn("opportunistic reminder sweep skipped", errorDetails(error));
      }
    }
    return await handleAction(user, action, payload, {
      channel: event.channel,
      platformCaller,
    });
  } catch (error) {
    const diagnosticId = cleanText(context.requestId, 64) || randomId(4);
    console.error("couple-tracker cloud function failed", {
      action,
      diagnosticId,
      ...errorDetails(error),
      stack: cleanText(error?.stack, 1000) || null,
    });
    return response(500, {
      error: "小田地暂时打了个盹，请稍后再刷新一次。",
      code: "INTERNAL_ERROR",
      diagnosticId,
    });
  }
};
