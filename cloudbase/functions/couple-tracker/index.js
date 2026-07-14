/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require("node:crypto");
const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const command = db.command;
const DAY = 24 * 60 * 60 * 1000;

const members = {
  chicken: {
    id: "chicken",
    name: "鸡包蛋",
    shortName: "鸡包蛋",
    color: "#7457ff",
    pale: "#eee9ff",
    avatar: "/avatar-chicken-egg.webp",
  },
  poopy: {
    id: "poopy",
    name: "拉粑臭",
    shortName: "拉粑臭",
    color: "#ef5b8f",
    pale: "#fff0f6",
    avatar: "/avatar-poopy.webp",
  },
};

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

function jsonError(message, status = 400) {
  return response(status, { error: message });
}

function getEnvironment(context, key) {
  if (process.env[key]) return process.env[key];
  try {
    const parsed = cloudbase.parseContext(context);
    return parsed && parsed.environ ? parsed.environ[key] : undefined;
  } catch {
    return undefined;
  }
}

function tokenMatches(actual, expected) {
  if (!actual || !expected) return false;
  const left = Buffer.from(String(actual));
  const right = Buffer.from(String(expected));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function authorize(event, context) {
  const token = typeof event.token === "string" ? event.token : "";
  if (tokenMatches(token, getEnvironment(context, "CHICKEN_TOKEN"))) return "chicken";
  if (tokenMatches(token, getEnvironment(context, "POOPY_TOKEN"))) return "poopy";
  return null;
}

function otherMember(member) {
  return member === "chicken" ? "poopy" : "chicken";
}

function randomMessage(kind) {
  const choices = kind === "like" ? praiseMessages : teaseMessages;
  return choices[Math.floor(Math.random() * choices.length)];
}

function parseOccurrence(value) {
  const timestamp = typeof value === "number" ? value : Number(value);
  const now = Date.now();
  if (!Number.isFinite(timestamp)) return null;
  if (timestamp > now + 5 * 60 * 1000 || timestamp < now - 30 * DAY) return null;
  return Math.round(timestamp);
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
    schemaReady = Promise.all([
      ensureCollection("weight_entries"),
      ensureCollection("poop_entries"),
      ensureCollection("reactions"),
    ]).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

function normalizeDocument(document) {
  const fields = { ...document };
  const id = fields._id;
  delete fields._id;
  delete fields._openid;
  return { id, ...fields };
}

async function queryAll(name, condition, orders, maximum = 500) {
  const documents = [];
  while (documents.length < maximum) {
    let query = db.collection(name).where(condition);
    for (const [field, direction] of orders) {
      query = query.orderBy(field, direction);
    }
    const pageSize = Math.min(100, maximum - documents.length);
    const result = await query.skip(documents.length).limit(pageSize).get();
    const page = Array.isArray(result.data) ? result.data : [];
    documents.push(...page);
    if (page.length < pageSize) break;
  }
  return documents.map(normalizeDocument);
}

async function addDocument(name, fields) {
  const result = await db.collection(name).add(fields);
  const id = result.id || result._id || (Array.isArray(result.ids) ? result.ids[0] : undefined);
  return { id, ...fields };
}

async function removeOwnedDocument(name, id, viewer) {
  const documentId = String(id || "").trim();
  if (!documentId) return false;
  const result = await db.collection(name).doc(documentId).get();
  const document = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!document || document.member !== viewer) return false;
  await db.collection(name).doc(documentId).remove();
  return true;
}

async function readDashboard(viewer) {
  const now = Date.now();
  const [weights, poops, reactions] = await Promise.all([
    queryAll(
      "weight_entries",
      { recordedAt: command.gte(now - 190 * DAY) },
      [["recordedAt", "asc"]],
      500,
    ),
    queryAll(
      "poop_entries",
      { occurredAt: command.gte(now - 45 * DAY) },
      [["occurredAt", "asc"]],
      500,
    ),
    queryAll(
      "reactions",
      { createdAt: command.gte(now - 30 * DAY) },
      [["createdAt", "desc"]],
      40,
    ),
  ]);

  return response(200, {
    viewer,
    profiles: members,
    weights,
    poops,
    reactions,
    serverTime: now,
  });
}

async function handleAction(viewer, payload) {
  const action = String(payload.action || "");
  const now = Date.now();

  if (action === "add-weight") {
    const weightKg = Number(payload.weightKg);
    const recordedAt = parseOccurrence(payload.occurredAt);
    if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 250) {
      return jsonError("请输入25到250千克之间的体重。");
    }
    if (!recordedAt) return jsonError("记录时间不正确，请重新选择。");
    const entry = await addDocument("weight_entries", {
      member: viewer,
      weightKg: Math.round(weightKg * 10) / 10,
      recordedAt,
      createdAt: now,
    });
    return response(201, { entry });
  }

  if (action === "add-poop") {
    const occurredAt = parseOccurrence(payload.occurredAt);
    if (!occurredAt) return jsonError("记录时间不正确，请重新选择。");
    const entry = await addDocument("poop_entries", {
      member: viewer,
      occurredAt,
      createdAt: now,
    });
    return response(201, { entry });
  }

  if (action === "react") {
    const kind = payload.kind === "like" ? "like" : payload.kind === "tease" ? "tease" : null;
    if (!kind) return jsonError("没有认出这次互动，再点一次试试吧。");
    const reaction = await addDocument("reactions", {
      fromMember: viewer,
      toMember: otherMember(viewer),
      kind,
      message: randomMessage(kind),
      createdAt: now,
    });
    return response(201, { reaction });
  }

  if (action === "delete-weight" || action === "delete-poop") {
    const collection = action === "delete-weight" ? "weight_entries" : "poop_entries";
    const removed = await removeOwnedDocument(collection, payload.id, viewer);
    if (!removed) return jsonError("没有找到这条记录。", 404);
    return response(200, { ok: true });
  }

  return jsonError("没有认出这个操作。");
}

exports.main = async function main(event = {}, context = {}) {
  const viewer = authorize(event, context);
  if (!viewer) return jsonError("这条入口链接无效，请使用属于你的专属链接。", 401);

  try {
    await ensureCollections();
    if (event.method === "GET") return await readDashboard(viewer);
    if (event.method === "POST") return await handleAction(viewer, event.payload || {});
    return jsonError("没有认出这个请求。", 405);
  } catch (error) {
    console.error("couple-tracker cloud function failed", {
      viewer,
      method: event.method,
      action: event.payload && event.payload.action,
      error,
    });
    return jsonError("小农场暂时打了个盹，请稍后再刷新一次。", 500);
  }
};
