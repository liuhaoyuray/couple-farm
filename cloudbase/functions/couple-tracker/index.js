/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require("node:crypto");
const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
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
];

const avatarChoices = ["🐣", "🐰", "🐻", "🐼", "🐱", "🐶", "🦊", "🐸"];
const colorChoices = ["#7457ff", "#ef5b8f", "#148bc8", "#2f9e62", "#d97706", "#b453c6"];
const praiseMessages = [
  "今天也很棒，奖励一颗星星！",
  "稳稳记录的人最厉害啦。",
  "给认真生活的你点个赞！",
];
const teaseMessages = [
  "农场小喇叭：快来打卡啦！",
  "体重秤和小马桶都等困了。",
  "今日份轻轻嘲讽已经送达！",
];

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

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get();
  } catch (error) {
    if (!isMissingCollection(error)) throw error;
    if (typeof db.createCollection !== "function") throw error;
    await db.createCollection(name);
  }
}

let schemaReady;

function ensureCollections() {
  if (!schemaReady) {
    schemaReady = Promise.all(COLLECTIONS.map(ensureCollection)).catch((error) => {
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
    let query = db.collection(name).where(condition);
    for (const [field, direction] of orders) query = query.orderBy(field, direction);
    const pageSize = Math.min(100, maximum - documents.length);
    const result = await query.skip(documents.length).limit(pageSize).get();
    const page = Array.isArray(result.data) ? result.data : [];
    documents.push(...page);
    if (page.length < pageSize) break;
  }
  return documents.map(normalizeDocument).filter(Boolean);
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

function publicUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    nickname: user.nickname,
    avatar: user.avatar,
    color: user.color,
    profileComplete: Boolean(user.profileComplete),
    coupleId: user.coupleId || null,
    createdAt: user.createdAt,
  };
}

async function getOrCreateUser(identity) {
  let user = await getDocument("users", identity.uid);
  if (user) return user;

  const now = Date.now();
  const fields = {
    uid: identity.uid,
    nickname: "农场新朋友",
    avatar: stableChoice(identity.uid, avatarChoices),
    color: stableChoice(`${identity.uid}:color`, colorChoices),
    profileComplete: false,
    coupleId: null,
    authProvider: identity.authProvider || "password",
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
    viewer: publicUser(user),
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
  return response(200, { sessionToken, viewer: publicUser(user) });
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
  return response(200, { sessionToken, viewer: publicUser(user) });
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

async function readDashboard(user) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const { couple, partner } = relationship;
  const now = Date.now();
  const [weights, poops, reactions] = await Promise.all([
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
  ]);

  return response(200, {
    viewer: publicUser(user),
    partner: publicUser(partner),
    couple: { id: couple.id, createdAt: couple.createdAt },
    weights,
    poops,
    reactions,
    serverTime: now,
  });
}

async function bootstrap(user) {
  if (!user.coupleId) {
    return response(200, {
      viewer: publicUser(user),
      partner: null,
      couple: null,
      serverTime: Date.now(),
    });
  }
  const dashboard = await readDashboard(user);
  if (dashboard.status === 409 && dashboard.data.code === "PAIRING_REQUIRED") {
    const refreshed = await getDocument("users", user.uid);
    return response(200, {
      viewer: publicUser(refreshed),
      partner: null,
      couple: null,
      serverTime: Date.now(),
    });
  }
  return dashboard;
}

async function updateProfile(user, payload) {
  const nickname = cleanText(payload.nickname, 12);
  const avatar = cleanText(payload.avatar, 4);
  if (nickname.length < 1) return jsonError("昵称至少需要一个字。", 400, "NICKNAME_REQUIRED");
  if (!avatarChoices.includes(avatar)) return jsonError("请选择农场里提供的头像。", 400, "AVATAR_INVALID");
  const updated = await updateDocument("users", user.uid, {
    nickname,
    avatar,
    profileComplete: true,
    updatedAt: Date.now(),
  });
  return response(200, { viewer: publicUser(updated) });
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
    createdAt: now,
    updatedAt: now,
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
  await updateDocument("couples", couple.id, {
    status: "ended",
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
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const weightKg = Number(payload.weightKg);
  const recordedAt = parseOccurrence(payload.occurredAt);
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 250) {
    return jsonError("请输入 25 到 250 千克之间的体重。", 400, "WEIGHT_INVALID");
  }
  if (!recordedAt) return jsonError("记录时间不正确，请重新选择。", 400, "TIME_INVALID");
  const entry = await addDocument("weight_entries", {
    coupleId: relationship.couple.id,
    ownerUid: user.uid,
    weightKg: Math.round(weightKg * 10) / 10,
    recordedAt,
    createdAt: Date.now(),
  });
  return response(201, { entry });
}

async function addPoop(user, payload) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const occurredAt = parseOccurrence(payload.occurredAt);
  if (!occurredAt) return jsonError("记录时间不正确，请重新选择。", 400, "TIME_INVALID");
  const entry = await addDocument("poop_entries", {
    coupleId: relationship.couple.id,
    ownerUid: user.uid,
    occurredAt,
    createdAt: Date.now(),
  });
  return response(201, { entry });
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
  return response(201, { reaction });
}

async function removeOwnedDocument(user, collectionName, id) {
  const relationship = await requireCouple(user);
  if (relationship.error) return relationship.error;
  const documentId = cleanText(id, 128);
  if (!documentId) return jsonError("没有找到这条记录。", 404, "RECORD_NOT_FOUND");
  const document = await getDocument(collectionName, documentId);
  if (!document || document.ownerUid !== user.uid || document.coupleId !== relationship.couple.id) {
    return jsonError("只能删除自己在当前关系里的记录。", 403, "RECORD_FORBIDDEN");
  }
  await db.collection(collectionName).doc(documentId).remove();
  return response(200, { ok: true });
}

async function handleAction(user, action, payload) {
  switch (action) {
    case "bootstrap": return bootstrap(user);
    case "get-dashboard": return readDashboard(user);
    case "update-profile": return updateProfile(user, payload);
    case "create-invite": return createInvite(user);
    case "accept-invite": return acceptInvite(user, payload);
    case "unbind": return unbind(user);
    case "add-weight": return addWeight(user, payload);
    case "add-poop": return addPoop(user, payload);
    case "react": return react(user, payload);
    case "delete-weight": return removeOwnedDocument(user, "weight_entries", payload.id);
    case "delete-poop": return removeOwnedDocument(user, "poop_entries", payload.id);
    default: return jsonError("没有认出这个操作。", 405, "ACTION_UNKNOWN");
  }
}

exports.main = async function main(event = {}) {
  const action = cleanText(event.action || (event.payload && event.payload.action), 48).toLowerCase();
  if (action === "health") {
    return response(200, {
      ok: true,
      service: "couple-tracker",
      version: "formal-v1",
      serverTime: Date.now(),
    });
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
    if (event.channel === "mini" && platformCaller.openId) {
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
    return await handleAction(user, action, payload);
  } catch (error) {
    console.error("couple-tracker cloud function failed", {
      platformUid: platformCaller.uid,
      action,
      error,
    });
    return jsonError("小农场暂时打了个盹，请稍后再刷新一次。", 500, "INTERNAL_ERROR");
  }
};
