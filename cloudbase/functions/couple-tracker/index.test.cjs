/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

function createFakeCloudbase() {
  const collections = new Map();
  const readFailures = new Set();
  let nextId = 1;
  let caller = null;
  const command = {
    gte(value) {
      return { operation: "gte", value };
    },
  };

  function collectionApi(name) {
    const state = { condition: {}, orders: [], skip: 0, limit: 100 };
    const api = {
      where(condition) {
        if (!condition || Object.keys(condition).length === 0) throw new Error("EMPTY_WHERE_UNSUPPORTED");
        state.condition = condition;
        return api;
      },
      orderBy(field, direction) {
        state.orders.push([field, direction]);
        return api;
      },
      skip(value) {
        state.skip = value;
        return api;
      },
      limit(value) {
        state.limit = value;
        return api;
      },
      async get() {
        if (readFailures.has(name)) throw new Error(`SIMULATED_READ_FAILURE:${name}`);
        if (!collections.has(name)) throw new Error("DATABASE_COLLECTION_NOT_EXIST");
        let documents = [...collections.get(name).values()];
        documents = documents.filter((document) => Object.entries(state.condition).every(([field, expected]) => {
          if (expected && expected.operation === "gte") return document[field] >= expected.value;
          return document[field] === expected;
        }));
        for (const [field, direction] of state.orders) {
          documents.sort((left, right) => {
            const l = left[field];
            const r = right[field];
            const difference = typeof l === "number" && typeof r === "number"
              ? l - r
              : String(l).localeCompare(String(r));
            return direction === "desc" ? -difference : difference;
          });
        }
        return { data: documents.slice(state.skip, state.skip + state.limit).map((item) => ({ ...item })) };
      },
      async add(fields) {
        if (!collections.has(name)) throw new Error("DATABASE_COLLECTION_NOT_EXIST");
        const id = String(nextId++);
        collections.get(name).set(id, { _id: id, ...fields });
        return { id };
      },
      doc(id) {
        const documentId = String(id);
        return {
          async get() {
            const document = collections.get(name)?.get(documentId);
            return { data: document ? [{ ...document }] : [] };
          },
          async set(fields) {
            if (!collections.has(name)) throw new Error("DATABASE_COLLECTION_NOT_EXIST");
            collections.get(name).set(documentId, { _id: documentId, ...fields });
            return { updated: 1 };
          },
          async update(fields) {
            const document = collections.get(name)?.get(documentId);
            if (!document) throw new Error("DOCUMENT_NOT_FOUND");
            collections.get(name).set(documentId, { ...document, ...fields, _id: documentId });
            return { updated: 1 };
          },
          async remove() {
            collections.get(name)?.delete(documentId);
            return { deleted: 1 };
          },
        };
      },
    };
    return api;
  }

  const database = {
    command,
    collection: collectionApi,
    async createCollection(name) {
      if (!collections.has(name)) collections.set(name, new Map());
      return {};
    },
  };

  return {
    SYMBOL_CURRENT_ENV: "current",
    init() {
      return {
        database: () => database,
        auth: () => ({
          getUserInfo: () => caller ? { ...caller } : {},
        }),
        getTempFileURL: async ({ fileList }) => ({
          fileList: fileList.map((item) => {
            const fileID = typeof item === "string" ? item : item.fileID;
            return {
              fileID,
              tempFileURL: `https://media.example.invalid/${encodeURIComponent(fileID)}`,
              code: "SUCCESS",
            };
          }),
        }),
      };
    },
    setCaller(info) {
      caller = info;
    },
    setReadFailure(name, enabled) {
      if (enabled) readFailures.add(name);
      else readFailures.delete(name);
    },
  };
}

const originalLoad = Module._load;
const fakeCloudbase = createFakeCloudbase();
let textSafetyResponse = { result: { suggest: "pass" } };
let imageSafetyResponse = { result: { suggest: "pass" } };
const sentSubscriptionMessages = [];
const memoTemplateId = "7yUYdsTH-aJGkSxaFaMu7LLxkGTChtD6WoJVg6LGcuE";
const fakeWxCloud = {
  DYNAMIC_CURRENT_ENV: "current",
  init() {},
  downloadFile: async () => ({ fileContent: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]) }),
  openapi: {
    subscribeMessage: {
      send: async (payload) => {
        sentSubscriptionMessages.push(payload);
        return { errCode: 0, errMsg: "openapi.subscribeMessage.send:ok" };
      },
    },
    security: {
      msgSecCheck: async () => {
        if (textSafetyResponse instanceof Error) throw textSafetyResponse;
        return textSafetyResponse;
      },
      imgSecCheck: async () => {
        if (imageSafetyResponse instanceof Error) throw imageSafetyResponse;
        return imageSafetyResponse;
      },
    },
  },
};
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "@cloudbase/node-sdk") return fakeCloudbase;
  if (request === "wx-server-sdk") return fakeWxCloud;
  return originalLoad.call(this, request, parent, isMain);
};
const { main } = require("./index.js");
Module._load = originalLoad;

function invoke(platformUid, action, payload = {}, sessionToken, channel) {
  fakeCloudbase.setCaller(platformUid
    ? typeof platformUid === "object" ? platformUid : { uid: platformUid }
    : null);
  return main({ action, payload, sessionToken, channel });
}

let firstToken;
let secondToken;
let firstRecoveryCode;

test("exposes a credential-free deployment health check", async () => {
  const result = await invoke(null, "health");
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.service, "couple-tracker");
  assert.equal(result.data.version, "0.9.0");
});

test("verifies the community schema without a user session", async () => {
  const result = await invoke(null, "community-health");
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.service, "community");
  assert.equal(result.data.version, "0.9.0");
});

test("verifies the private village schema without a user session", async () => {
  const result = await invoke(null, "village-health");
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.service, "village");
  assert.equal(result.data.version, "0.9.0");
});

test("verifies the partner notification schema without a user session", async () => {
  const result = await invoke(null, "notification-health");
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.service, "notifications");
  assert.equal(result.data.version, "0.9.0");
  assert.equal(result.data.templateConfigured, true);
});

test("verifies the double-player game schema without a user session", async () => {
  const result = await invoke(null, "game-health");
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.service, "games");
  assert.equal(result.data.version, "0.9.0");
  assert.deepEqual(result.data.games, ["gomoku"]);
});

test("verifies the full UGC content-safety contract without a user session", async () => {
  const result = await invoke(null, "content-safety-health");
  assert.equal(result.status, 200);
  assert.equal(result.data.service, "content-safety");
  assert.equal(result.data.version, "0.9.0");
  assert.deepEqual(result.data.apis, ["security.msgSecCheck", "security.imgSecCheck"]);
  assert.ok(result.data.coverage.includes("avatar-image"));
  assert.ok(result.data.coverage.includes("village-post-image-text"));
  assert.equal(result.data.rejectMessage, "你发布的内容含违规信息。");
});

test("requires a CloudBase platform identity", async () => {
  const result = await invoke(null, "bootstrap");
  assert.equal(result.status, 401);
  assert.equal(result.data.code, "PLATFORM_AUTH_REQUIRED");
});

test("registers password accounts without storing plain-text passwords", async () => {
  const firstRegistration = await invoke("browser-a", "register", {
    username: "chicken_egg",
    password: "farmPass123",
  });
  assert.equal(firstRegistration.status, 201);
  assert.match(firstRegistration.data.sessionToken, /^[a-f0-9]{64}$/);
  assert.match(firstRegistration.data.recoveryCode, /^[2-9A-HJ-NP-Z]{8}-[2-9A-HJ-NP-Z]{8}$/);
  firstToken = firstRegistration.data.sessionToken;
  firstRecoveryCode = firstRegistration.data.recoveryCode;

  const duplicate = await invoke("browser-x", "register", {
    username: "CHICKEN_EGG",
    password: "anotherPass123",
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.code, "USERNAME_TAKEN");

  const secondRegistration = await invoke("browser-b", "register", {
    username: "poopy_friend",
    password: "farmPass456",
  });
  assert.equal(secondRegistration.status, 201);
  secondToken = secondRegistration.data.sessionToken;

  const copiedToken = await invoke("browser-b", "bootstrap", {}, firstToken);
  assert.equal(copiedToken.status, 401);

  const loggedIn = await invoke("browser-a-new", "login", {
    username: "chicken_egg",
    password: "farmPass123",
  });
  assert.equal(loggedIn.status, 200);
  assert.notEqual(loggedIn.data.sessionToken, firstToken);

  const recovered = await invoke("browser-a", "recover-account", {
    username: "chicken_egg",
    recoveryCode: firstRecoveryCode,
    newPassword: "newFarmPass789",
  });
  assert.equal(recovered.status, 200);
  const oldSession = await invoke("browser-a", "bootstrap", {}, firstToken);
  assert.equal(oldSession.status, 401);
  firstToken = recovered.data.sessionToken;
});

test("automatically creates a mini-program profile from verified OpenID", async () => {
  const mini = await invoke(
    { uid: "platform-mini-user", openId: "openid-123", appId: "wx-app" },
    "bootstrap",
    {},
    undefined,
    "mini",
  );
  assert.equal(mini.status, 200);
  assert.match(mini.data.viewer.uid, /^wx_[a-f0-9]{40}$/);
  assert.equal(mini.data.viewer.profileComplete, false);
});

test("moderates mini-program nicknames and uploaded images before publication", async () => {
  const caller = { uid: "platform-safety-user", openId: "openid-safety", appId: "wx-app" };
  const bootstrap = await invoke(caller, "bootstrap", {}, undefined, "mini");
  const uid = bootstrap.data.viewer.uid;

  textSafetyResponse = { result: { suggest: "risky" } };
  const unsafeNickname = await invoke(caller, "update-profile", {
    nickname: "违规昵称",
    avatar: "🐣",
  }, undefined, "mini");
  assert.equal(unsafeNickname.status, 422);
  assert.equal(unsafeNickname.data.code, "CONTENT_UNSAFE");
  assert.equal(unsafeNickname.data.error, "你发布的内容含违规信息。");
  textSafetyResponse = { result: { suggest: "pass" } };

  imageSafetyResponse = { result: { suggest: "risky" } };
  const unsafeImage = await invoke(caller, "moderate-upload", {
    kind: "avatar",
    fileId: `cloud://test.bucket/avatars/${uid}/unsafe.jpg`,
  }, undefined, "mini");
  assert.equal(unsafeImage.status, 422);
  assert.equal(unsafeImage.data.code, "IMAGE_UNSAFE");
  assert.equal(unsafeImage.data.error, "你发布的内容含违规信息。");
  imageSafetyResponse = { result: { suggest: "pass" } };

  const safeImage = await invoke(caller, "moderate-upload", {
    kind: "avatar",
    fileId: `cloud://test.bucket/avatars/${uid}/safe.jpg`,
  }, undefined, "mini");
  assert.equal(safeImage.status, 200);
  assert.equal(safeImage.data.status, "pass");
});

test("dispatches scheduled health reminders for an unpaired user", async () => {
  const caller = { uid: "platform-reminder-user", openId: "openid-reminder", appId: "wx-app" };
  await invoke(caller, "bootstrap", {}, undefined, "mini");
  await invoke(caller, "update-profile", { nickname: "提醒测试", avatar: "🐰" }, undefined, "mini");
  const china = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const time = `${String(china.getUTCHours()).padStart(2, "0")}:${String(china.getUTCMinutes()).padStart(2, "0")}`;
  await invoke(caller, "update-reminders", {
    weight: { enabled: true, time, days: [0, 1, 2, 3, 4, 5, 6] },
    poop: { enabled: false, time: "20:30", days: [0, 1, 2, 3, 4, 5, 6] },
    anniversary: { enabled: false, advanceDays: [7, 1, 0] },
  }, undefined, "mini");
  await invoke(caller, "update-notification-preferences", {
    inApp: true,
    wechat: true,
    quietHours: { enabled: false, start: "23:00", end: "08:00" },
    events: { health: true, interaction: true, tasks: true, rituals: true, village: true },
  }, undefined, "mini");
  const grant = await invoke(caller, "save-subscription-consent", {
    templateKey: "health_reminder",
    templateId: memoTemplateId,
    result: "accept",
  }, undefined, "mini");
  assert.equal(grant.status, 201);
  const sentBefore = sentSubscriptionMessages.length;
  const sweep = await main({ Type: "Timer", triggerName: "couple-reminders" });
  assert.equal(sweep.status, 200);
  assert.ok(sweep.data.scheduled.created >= 1);
  assert.equal(sentSubscriptionMessages.length, sentBefore + 1);
  const center = await invoke(caller, "notification-center", {}, undefined, "mini");
  assert.equal(center.status, 200);
  assert.ok(center.data.items.some((item) => item.type === "health_reminder"));
});

test("creates profiles and securely pairs two different accounts", async () => {
  const first = await invoke("browser-a", "bootstrap", {}, firstToken);
  assert.equal(first.status, 200);
  assert.equal(first.data.viewer.profileComplete, false);
  assert.equal(first.data.couple, null);

  await invoke("browser-a", "update-profile", { nickname: "鸡包蛋", avatar: "🐣" }, firstToken);
  await invoke("browser-b", "bootstrap", {}, secondToken);
  await invoke("browser-b", "update-profile", { nickname: "拉粑臭", avatar: "🐰" }, secondToken);

  const soloWeight = await invoke("browser-a", "add-weight", {
    weightKg: 68.8,
    occurredAt: Date.now(),
  }, firstToken);
  const soloPoop = await invoke("browser-b", "add-poop", { occurredAt: Date.now() }, secondToken);
  const soloDashboard = await invoke("browser-a", "bootstrap", {}, firstToken);
  assert.equal(soloDashboard.status, 200);
  assert.equal(soloDashboard.data.mode, "solo");
  assert.equal(soloDashboard.data.weights.length, 1);
  assert.equal(soloDashboard.data.partner, null);

  const invite = await invoke("browser-a", "create-invite", {}, firstToken);
  assert.equal(invite.status, 201);
  assert.match(invite.data.code, /^[2-9A-HJ-NP-Z]{8}$/);

  const selfPair = await invoke("browser-a", "accept-invite", { code: invite.data.code }, firstToken);
  assert.equal(selfPair.status, 400);
  assert.equal(selfPair.data.code, "SELF_PAIRING");

  const paired = await invoke("browser-b", "accept-invite", { code: invite.data.code.toLowerCase() }, secondToken);
  assert.equal(paired.status, 200);
  assert.equal(paired.data.viewer.nickname, "拉粑臭");
  assert.equal(paired.data.partner.nickname, "鸡包蛋");
  assert.ok(paired.data.couple.id.startsWith("couple_"));
  assert.equal(paired.data.weights.some((entry) => entry.id === soloWeight.data.entry.id), true);
  assert.equal(paired.data.poops.some((entry) => entry.id === soloPoop.data.entry.id), true);
  assert.ok(paired.data.dailySpark);
  assert.equal(paired.data.dailySpark.completedByUids.length, 0);

  const firstSpark = await invoke("browser-a", "complete-daily-spark", {}, firstToken);
  assert.equal(firstSpark.status, 200);
  assert.equal(firstSpark.data.spark.bothCompleted, false);
  const secondSpark = await invoke("browser-b", "complete-daily-spark", {}, secondToken);
  assert.equal(secondSpark.status, 200);
  assert.equal(secondSpark.data.spark.bothCompleted, true);

  await invoke("browser-a", "delete-weight", { id: soloWeight.data.entry.id }, firstToken);
  await invoke("browser-b", "delete-poop", { id: soloPoop.data.entry.id }, secondToken);

  const reused = await invoke("browser-b", "accept-invite", { code: invite.data.code }, secondToken);
  assert.equal(reused.status, 409);
  assert.equal(reused.data.code, "ALREADY_PAIRED");
});

test("shares couple data while enforcing record ownership", async () => {
  const created = await invoke("browser-a", "add-weight", {
    weightKg: 68.4,
    occurredAt: Date.now(),
  }, firstToken);
  assert.equal(created.status, 201);
  assert.match(created.data.entry.ownerUid, /^acct_/);

  const poop = await invoke("browser-b", "add-poop", { occurredAt: Date.now() }, secondToken);
  assert.equal(poop.status, 201);
  assert.match(poop.data.entry.ownerUid, /^acct_/);

  const reaction = await invoke("browser-b", "react", { kind: "like" }, secondToken);
  assert.equal(reaction.status, 201);
  assert.notEqual(reaction.data.reaction.toUserUid, reaction.data.reaction.fromUserUid);

  const partnerDelete = await invoke("browser-b", "delete-weight", { id: created.data.entry.id }, secondToken);
  assert.equal(partnerDelete.status, 403);
  assert.equal(partnerDelete.data.code, "RECORD_FORBIDDEN");

  const dashboard = await invoke("browser-b", "get-dashboard", {}, secondToken);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.weights.length, 1);
  assert.equal(dashboard.data.poops.length, 1);
  assert.equal(dashboard.data.reactions.length, 1);

  const ownerDelete = await invoke("browser-a", "delete-weight", { id: created.data.entry.id }, firstToken);
  assert.equal(ownerDelete.status, 200);
  const afterDelete = await invoke("browser-b", "get-dashboard", {}, secondToken);
  assert.equal(afterDelete.data.weights.length, 0);
});

test("delivers partner activity to the inbox and consumes one-time WeChat reminder grants", async () => {
  const initialCenter = await invoke("browser-b", "notification-center", {}, secondToken);
  assert.equal(initialCenter.status, 200);
  assert.ok(initialCenter.data.items.some((item) => item.type === "weight"));
  assert.ok(initialCenter.data.unreadCount >= 1);

  const readAll = await invoke("browser-b", "mark-notification-read", { all: true }, secondToken);
  assert.equal(readAll.status, 200);
  const quietOff = await invoke("browser-b", "update-notification-preferences", {
    inApp: true,
    wechat: true,
    quietHours: { enabled: false, start: "23:00", end: "08:00" },
    events: { health: true, interaction: true, tasks: true, rituals: true, village: true },
  }, secondToken);
  assert.equal(quietOff.status, 200);
  assert.equal(quietOff.data.preferences.quietHours.enabled, false);

  const miniCaller = { uid: "browser-b", openId: "openid-b", appId: "wx-app" };
  const grant = async () => invoke(
    miniCaller,
    "save-subscription-consent",
    { templateKey: "partner_activity", templateId: memoTemplateId, result: "accept" },
    secondToken,
    "mini",
  );

  const sentBefore = sentSubscriptionMessages.length;
  assert.equal((await grant()).status, 201);
  const weight = await invoke("browser-a", "add-weight", {
    weightKg: 68.1,
    occurredAt: Date.now(),
  }, firstToken);
  assert.equal(weight.status, 201);
  assert.equal(sentSubscriptionMessages.length, sentBefore + 1);
  assert.equal(sentSubscriptionMessages.at(-1).templateId, memoTemplateId);
  assert.match(sentSubscriptionMessages.at(-1).data.thing2.value, /称重打卡/);
  assert.deepEqual(sentSubscriptionMessages.at(-1).data.thing17, { value: "鸡包蛋" });

  assert.equal((await grant()).status, 201);
  const liked = await invoke("browser-a", "react", { kind: "like" }, firstToken);
  assert.equal(liked.status, 201);
  assert.equal(sentSubscriptionMessages.length, sentBefore + 2);
  assert.match(sentSubscriptionMessages.at(-1).data.thing2.value, /点了个赞/);

  assert.equal((await grant()).status, 201);
  const nudged = await invoke("browser-a", "send-nudge", { preset: "hug" }, firstToken);
  assert.equal(nudged.status, 201);
  assert.equal(sentSubscriptionMessages.length, sentBefore + 3);
  assert.match(sentSubscriptionMessages.at(-1).data.thing2.value, /抱抱/);
  const duplicateNudge = await invoke("browser-a", "send-nudge", { preset: "hug" }, firstToken);
  assert.equal(duplicateNudge.status, 429);
  assert.equal(duplicateNudge.data.code, "NUDGE_RATE_LIMITED");

  const center = await invoke("browser-b", "notification-center", {}, secondToken);
  assert.equal(center.status, 200);
  assert.ok(center.data.items.some((item) => item.type === "reaction" && item.wechatStatus === "sent"));
  assert.ok(center.data.items.some((item) => item.type === "nudge" && item.wechatStatus === "sent"));
  assert.equal(center.data.notification.availableQuota, 0);
  const dashboard = await invoke("browser-b", "get-dashboard", {}, secondToken);
  assert.equal(dashboard.data.notificationSummary.unreadCount, center.data.unreadCount);
  assert.ok(dashboard.data.weeklyPulse.cheers >= 1);
});

test("plays a server-validated couple gomoku round and notifies the partner", async () => {
  const started = await invoke("browser-a", "start-gomoku", {}, firstToken);
  assert.equal(started.status, 201);
  assert.equal(started.data.game.status, "active");
  assert.equal(started.data.game.board.length, 225);
  assert.equal(started.data.game.currentTurnUid, started.data.game.blackUid);

  let game = started.data.game;
  const missingRevision = await invoke("browser-a", "play-gomoku", { row: 0, col: 0 }, firstToken);
  assert.equal(missingRevision.status, 400);
  assert.equal(missingRevision.data.code, "GOMOKU_REVISION_REQUIRED");
  const outOfTurn = await invoke("browser-b", "play-gomoku", {
    row: 0,
    col: 0,
    revision: game.revision,
  }, secondToken);
  assert.equal(outOfTurn.status, 409);
  assert.equal(outOfTurn.data.code, "GOMOKU_NOT_YOUR_TURN");

  for (let column = 0; column < 4; column += 1) {
    const black = await invoke("browser-a", "play-gomoku", {
      row: 7,
      col: column,
      revision: game.revision,
    }, firstToken);
    assert.equal(black.status, 200);
    game = black.data.game;
    const white = await invoke("browser-b", "play-gomoku", {
      row: 8,
      col: column,
      revision: game.revision,
    }, secondToken);
    assert.equal(white.status, 200);
    game = white.data.game;
  }

  const winningMove = await invoke("browser-a", "play-gomoku", {
    row: 7,
    col: 4,
    revision: game.revision,
  }, firstToken);
  assert.equal(winningMove.status, 200);
  assert.equal(winningMove.data.game.status, "won");
  assert.equal(winningMove.data.game.winnerUid, winningMove.data.game.blackUid);
  assert.equal(winningMove.data.game.moveCount, 9);

  const partnerCenter = await invoke("browser-b", "notification-center", {}, secondToken);
  assert.ok(partnerCenter.data.items.some((item) => item.type === "game_result" && item.targetTab === "games"));
});

test("supports editable profiles, farm settings, reminders and anniversaries", async () => {
  const profile = await invoke("browser-a", "update-profile", {
    nickname: "鸡包蛋改",
    avatar: "🐻",
    color: "#2f9e62",
  }, firstToken);
  assert.equal(profile.status, 200);
  assert.equal(profile.data.viewer.nickname, "鸡包蛋改");
  assert.equal(profile.data.viewer.color, "#2f9e62");

  const couple = await invoke("browser-a", "update-couple-settings", {
    farmName: "臭蛋幸福农场",
    togetherSince: "2020-04-15",
  }, firstToken);
  assert.equal(couple.status, 200);
  assert.equal(couple.data.couple.farmName, "臭蛋幸福农场");
  assert.equal(couple.data.couple.togetherSince, "2020-04-15");

  const reminders = await invoke("browser-a", "update-reminders", {
    weight: { enabled: true, time: "07:30", days: [1, 3, 5] },
    poop: { enabled: true, time: "21:00", days: [0, 1, 2, 3, 4, 5, 6] },
    anniversary: { enabled: true, advanceDays: [14, 7, 1, 0] },
  }, firstToken);
  assert.equal(reminders.status, 200);
  assert.equal(reminders.data.reminders.weight.time, "07:30");
  assert.deepEqual(reminders.data.reminders.weight.days, [1, 3, 5]);

  const created = await invoke("browser-a", "add-anniversary", {
    title: "第一次约会",
    date: "2020-05-20",
    icon: "💞",
    note: "一起吃了火锅",
    repeatsYearly: true,
  }, firstToken);
  assert.equal(created.status, 201);
  assert.equal(created.data.anniversary.title, "第一次约会");

  const updated = await invoke("browser-b", "update-anniversary", {
    id: created.data.anniversary.id,
    title: "第一次正式约会",
    date: "2020-05-21",
    icon: "✨",
    repeatsYearly: true,
  }, secondToken);
  assert.equal(updated.status, 200);
  assert.equal(updated.data.anniversary.title, "第一次正式约会");

  const dashboard = await invoke("browser-b", "get-dashboard", {}, secondToken);
  assert.equal(dashboard.data.couple.farmName, "臭蛋幸福农场");
  assert.equal(dashboard.data.partner.nickname, "鸡包蛋改");
  assert.equal(dashboard.data.anniversaries.length, 1);
  assert.equal(dashboard.data.partner.reminders, undefined);
  assert.ok(dashboard.data.viewer.reminders);

  const removed = await invoke("browser-a", "delete-anniversary", { id: created.data.anniversary.id }, firstToken);
  assert.equal(removed.status, 200);
});

test("supports a shared notebook with assignments, recurring tasks and reminder grants", async () => {
  const firstDashboard = await invoke("browser-a", "get-dashboard", {}, firstToken);
  const firstUid = firstDashboard.data.viewer.uid;
  const secondUid = firstDashboard.data.partner.uid;
  const dueAt = Date.now() + 2 * 60 * 60 * 1000;
  const created = await invoke("browser-a", "create-shared-memo", {
    kind: "task",
    title: "一起订周末餐厅",
    note: "周五晚上之前决定",
    category: "date",
    dueAt,
    assignee: "both",
    recurrence: "daily",
    reminderEnabled: true,
    remindAt: dueAt - 60 * 60 * 1000,
  }, firstToken);
  assert.equal(created.status, 201);
  assert.equal(created.data.item.completed, false);

  const firstDone = await invoke("browser-a", "toggle-shared-memo", { id: created.data.item.id }, firstToken);
  assert.equal(firstDone.status, 200);
  assert.equal(firstDone.data.item.completed, false);
  assert.deepEqual(firstDone.data.item.completedByUids, [firstUid]);

  const secondDone = await invoke("browser-b", "toggle-shared-memo", { id: created.data.item.id }, secondToken);
  assert.equal(secondDone.status, 200);
  assert.equal(secondDone.data.item.completed, true);
  assert.ok(secondDone.data.nextItem);
  assert.equal(secondDone.data.nextItem.status, "open");
  assert.ok(secondDone.data.nextItem.dueAt > dueAt);

  const assigned = await invoke("browser-a", "create-shared-memo", {
    kind: "task",
    title: "记得带充电器",
    category: "daily",
    assignee: secondUid,
    recurrence: "none",
  }, firstToken);
  const wrongAssignee = await invoke("browser-a", "toggle-shared-memo", { id: assigned.data.item.id }, firstToken);
  assert.equal(wrongAssignee.status, 403);
  assert.equal(wrongAssignee.data.code, "MEMO_ASSIGNEE_REQUIRED");
  const partnerDone = await invoke("browser-b", "toggle-shared-memo", { id: assigned.data.item.id }, secondToken);
  assert.equal(partnerDone.status, 200);
  assert.equal(partnerDone.data.item.completed, true);

  const partnerDelete = await invoke("browser-b", "delete-shared-memo", { id: created.data.item.id }, secondToken);
  assert.equal(partnerDelete.status, 403);
  assert.equal(partnerDelete.data.code, "MEMO_DELETE_FORBIDDEN");

  const notebook = await invoke("browser-b", "shared-notebook", {}, secondToken);
  assert.equal(notebook.status, 200);
  assert.ok(notebook.data.items.some((item) => item.id === secondDone.data.nextItem.id));
  const dashboard = await invoke("browser-a", "get-dashboard", {}, firstToken);
  assert.ok(dashboard.data.sharedMemos.some((item) => item.id === secondDone.data.nextItem.id));

  const reminderMessagesBefore = sentSubscriptionMessages.length;
  const subscription = await invoke(
    { uid: "browser-a", openId: "openid-a", appId: "wx-app" },
    "save-subscription-consent",
    { templateKey: "shared_memo", templateId: memoTemplateId, result: "accept" },
    firstToken,
    "mini",
  );
  assert.equal(subscription.status, 201);

  const reminderDueAt = Date.now() + 5 * 60 * 1000;
  const reminder = await invoke("browser-a", "create-shared-memo", {
    kind: "event",
    title: "出发去看电影",
    note: "记得带票",
    location: "幸福电影院",
    category: "date",
    assignee: firstUid,
    recurrence: "none",
    dueAt: reminderDueAt,
    reminderEnabled: true,
    remindAt: Date.now() - 1000,
  }, firstToken);
  assert.equal(reminder.status, 201);

  const sweep = await main({ Type: "Timer", triggerName: "couple-reminders" });
  assert.equal(sweep.status, 200);
  assert.equal(sweep.data.sent, 1);
  assert.equal(sentSubscriptionMessages.length, reminderMessagesBefore + 1);
  assert.equal(sentSubscriptionMessages.at(-1).templateId, memoTemplateId);
  assert.deepEqual(sentSubscriptionMessages.at(-1).data.thing2, { value: "出发去看电影" });
  assert.deepEqual(sentSubscriptionMessages.at(-1).data.thing10, { value: "幸福电影院" });
  assert.deepEqual(sentSubscriptionMessages.at(-1).data.thing17, { value: "鸡包蛋改" });
  assert.match(sentSubscriptionMessages.at(-1).data.time6.value, /^\d{4}年\d{2}月\d{2}日 \d{2}:\d{2}$/);
});

test("supports daily couple rituals, restaurant decisions and membership trials", async () => {
  const date = "2026-07-16";
  const initial = await invoke("browser-a", "together-hub", { date }, firstToken);
  assert.equal(initial.status, 200);
  assert.equal(initial.data.membership.current.plan, "free");
  assert.equal(initial.data.membership.current.limits.activeRestaurantOptions, 8);

  for (let index = 0; index < 8; index += 1) {
    const option = await invoke("browser-a", "add-together-option", {
      label: `好吃餐厅${index + 1}`,
      cuisine: index % 2 ? "火锅" : "家常菜",
      budget: index % 3 === 0 ? "¥" : "¥¥",
    }, firstToken);
    assert.equal(option.status, 201);
  }
  const overFreeLimit = await invoke("browser-b", "add-together-option", {
    label: "第九家餐厅",
    budget: "¥¥¥",
  }, secondToken);
  assert.equal(overFreeLimit.status, 409);
  assert.equal(overFreeLimit.data.code, "OPTION_LIMIT_REACHED");

  const premiumBeforeTrial = await invoke("browser-a", "spin-together-decision", { mode: "fresh" }, firstToken);
  assert.equal(premiumBeforeTrial.status, 403);
  assert.equal(premiumBeforeTrial.data.code, "MEMBERSHIP_REQUIRED");

  const spun = await invoke("browser-a", "spin-together-decision", { mode: "classic" }, firstToken);
  assert.equal(spun.status, 201);
  assert.equal(spun.data.decision.status, "pending");
  const confirmed = await invoke("browser-b", "respond-together-decision", {
    id: spun.data.decision.id,
    response: "confirm",
  }, secondToken);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.decision.status, "confirmed");

  const trial = await invoke("browser-b", "claim-founder-trial", {}, secondToken);
  assert.equal(trial.status, 200);
  assert.equal(trial.data.membership.current.plan, "plus");
  assert.equal(trial.data.membership.current.source, "founder_trial");
  const ninth = await invoke("browser-b", "add-together-option", {
    label: "第九家餐厅",
    cuisine: "烧烤",
    budget: "¥¥¥",
  }, secondToken);
  assert.equal(ninth.status, 201);
  const fresh = await invoke("browser-b", "spin-together-decision", { mode: "fresh" }, secondToken);
  assert.equal(fresh.status, 201);
  const vetoed = await invoke("browser-a", "respond-together-decision", {
    id: fresh.data.decision.id,
    response: "veto",
  }, firstToken);
  assert.equal(vetoed.data.decision.status, "vetoed");

  await invoke("browser-a", "save-daily-checkin", { date, mood: 5, energy: 4, note: "今晚想一起散步" }, firstToken);
  await invoke("browser-b", "save-daily-checkin", { date, mood: 3, energy: 2, note: "今天有点累" }, secondToken);
  await invoke("browser-b", "answer-daily-question", { date, choice: "a" }, secondToken);
  const hiddenAnswer = await invoke("browser-a", "together-hub", { date }, firstToken);
  assert.equal(hiddenAnswer.data.prompt.viewerChoice, null);
  assert.equal(hiddenAnswer.data.prompt.partnerAnswered, true);
  assert.equal(hiddenAnswer.data.prompt.partnerChoice, null);
  await invoke("browser-a", "answer-daily-question", { date, choice: "a" }, firstToken);
  const revealed = await invoke("browser-a", "together-hub", { date }, firstToken);
  assert.equal(revealed.data.checkins.length, 2);
  assert.equal(revealed.data.prompt.partnerChoice, "a");
  assert.equal(revealed.data.prompt.matched, true);

  const waitlist = await invoke("browser-a", "join-membership-waitlist", { plan: "yearly" }, firstToken);
  assert.equal(waitlist.status, 200);
  assert.equal(waitlist.data.membership.current.waitlisted, true);
});

test("supports a moderated community feed with images, follows, likes, comments and blocking", async () => {
  const thirdRegistration = await invoke("browser-c", "register", {
    username: "sunny_farm",
    password: "sunnyFarm123",
  });
  const fourthRegistration = await invoke("browser-d", "register", {
    username: "moon_farm",
    password: "moonFarm456",
  });
  const thirdToken = thirdRegistration.data.sessionToken;
  const fourthToken = fourthRegistration.data.sessionToken;
  const thirdUid = thirdRegistration.data.viewer.uid;
  await invoke("browser-c", "update-profile", { nickname: "太阳", avatar: "🌻" }, thirdToken);
  await invoke("browser-d", "update-profile", { nickname: "月亮", avatar: "🐰" }, fourthToken);
  const invite = await invoke("browser-c", "create-invite", {}, thirdToken);
  const paired = await invoke("browser-d", "accept-invite", { code: invite.data.code }, fourthToken);
  const secondCoupleId = paired.data.couple.id;
  assert.deepEqual(paired.data.couple.community.publicStats, []);

  const firstMiniCaller = { uid: "browser-a", openId: "openid-a", appId: "wx-app" };
  const secondMiniCaller = { uid: "browser-c", openId: "openid-c", appId: "wx-app" };
  const firstSettings = await invoke(firstMiniCaller, "update-community-settings", {
    enabled: true,
    bio: "一起认真生活的小田地",
    publicStats: ["togetherDays", "weeklyJointDays", "weeklyCheers", "farmVitality"],
  }, firstToken, "mini");
  assert.equal(firstSettings.status, 200);

  const secondSettings = await invoke(secondMiniCaller, "update-community-settings", {
    enabled: true,
    bio: "太阳和月亮的农场",
    publicStats: ["farmVitality"],
  }, thirdToken, "mini");
  assert.equal(secondSettings.status, 200);

  const created = await invoke(secondMiniCaller, "create-community-post", {
    content: "今天一起种下了第一颗社区种子。",
    topic: "milestone",
    imageFileId: `cloud://test.bucket/community/${thirdUid}/first.jpg`,
    shareStatKey: "farmVitality",
  }, thirdToken, "mini");
  assert.equal(created.status, 201);
  assert.equal(created.data.post.authorCoupleId, secondCoupleId);
  assert.ok(created.data.post.imageFileId);

  textSafetyResponse = {};
  const failClosed = await invoke(secondMiniCaller, "create-community-post", {
    content: "审核结果不明确时不能发布。",
    topic: "daily",
  }, thirdToken, "mini");
  assert.equal(failClosed.status, 503);
  assert.equal(failClosed.data.code, "CONTENT_CHECK_UNAVAILABLE");
  textSafetyResponse = { result: { suggest: "pass" } };

  const feed = await invoke(firstMiniCaller, "community-feed", { mode: "all" }, firstToken, "mini");
  assert.equal(feed.status, 200);
  assert.equal(feed.data.serviceState, "healthy");
  assert.equal(feed.data.posts.length, 1);
  assert.equal(feed.data.posts[0].likedByViewer, false);
  assert.equal(feed.data.posts[0].shareStat.key, "farmVitality");

  const resolvedCommunityImage = await invoke(firstMiniCaller, "resolve-media-url", {
    fileId: created.data.post.imageFileId,
  }, firstToken, "mini");
  assert.equal(resolvedCommunityImage.status, 200);
  assert.match(resolvedCommunityImage.data.tempFileURL, /^https:\/\/media\.example\.invalid\//);
  const downloadedCommunityImage = await invoke(firstMiniCaller, "download-media", {
    fileId: created.data.post.imageFileId,
  }, firstToken, "mini");
  assert.equal(downloadedCommunityImage.status, 200);
  assert.equal(downloadedCommunityImage.data.contentType, "image/jpeg");
  assert.match(downloadedCommunityImage.data.base64, /^[A-Za-z0-9+/]+=*$/);
  const forbiddenImage = await invoke(firstMiniCaller, "resolve-media-url", {
    fileId: "cloud://test.bucket/community/unknown-user/private.jpg",
  }, firstToken, "mini");
  assert.equal(forbiddenImage.status, 403);
  assert.equal(forbiddenImage.data.code, "MEDIA_READ_FORBIDDEN");

  fakeCloudbase.setReadFailure("community_comments", true);
  const degradedFeed = await invoke(firstMiniCaller, "community-feed", { mode: "all" }, firstToken, "mini");
  fakeCloudbase.setReadFailure("community_comments", false);
  assert.equal(degradedFeed.status, 200);
  assert.equal(degradedFeed.data.serviceState, "degraded");
  assert.equal(degradedFeed.data.posts.length, 1);

  const followed = await invoke(firstMiniCaller, "toggle-community-follow", {
    coupleId: secondCoupleId,
  }, firstToken, "mini");
  assert.equal(followed.status, 200);
  assert.equal(followed.data.active, true);

  const liked = await invoke(firstMiniCaller, "toggle-community-like", {
    postId: created.data.post.id,
  }, firstToken, "mini");
  assert.equal(liked.status, 200);
  assert.equal(liked.data.likeCount, 1);

  const commented = await invoke(firstMiniCaller, "add-community-comment", {
    postId: created.data.post.id,
    content: "欢迎来到村口！",
  }, firstToken, "mini");
  assert.equal(commented.status, 201);

  const followingFeed = await invoke(firstMiniCaller, "community-feed", { mode: "following" }, firstToken, "mini");
  assert.equal(followingFeed.data.posts.length, 1);
  assert.equal(followingFeed.data.posts[0].comments.length, 1);
  assert.equal(followingFeed.data.posts[0].likedByViewer, true);

  const blocked = await invoke(firstMiniCaller, "block-community-farm", {
    coupleId: secondCoupleId,
  }, firstToken, "mini");
  assert.equal(blocked.status, 200);
  const afterBlock = await invoke(firstMiniCaller, "community-feed", { mode: "all" }, firstToken, "mini");
  assert.equal(afterBlock.data.posts.length, 0);

  const refollowBlocked = await invoke(firstMiniCaller, "toggle-community-follow", {
    coupleId: secondCoupleId,
  }, firstToken, "mini");
  assert.equal(refollowBlocked.status, 409);
  assert.equal(refollowBlocked.data.code, "COMMUNITY_FARM_BLOCKED");

  const createdVillage = await invoke(firstMiniCaller, "create-village", {
    name: "周末吃喝村",
    description: "只和认识的情侣一起分享生活",
  }, firstToken, "mini");
  assert.equal(createdVillage.status, 200);
  assert.equal(createdVillage.data.village.memberCount, 1);
  assert.match(createdVillage.data.village.inviteCode, /^[2-9A-HJ-NP-Z]{8}$/);

  const joinedVillage = await invoke(secondMiniCaller, "join-village", {
    code: createdVillage.data.village.inviteCode,
  }, thirdToken, "mini");
  assert.equal(joinedVillage.status, 200);
  assert.equal(joinedVillage.data.members.length, 2);

  const villagePost = await invoke(secondMiniCaller, "create-village-post", {
    content: "周六有人一起吃火锅吗？",
    topic: "daily",
    imageFileId: `cloud://test.bucket/community/${thirdUid}/village.jpg`,
  }, thirdToken, "mini");
  assert.equal(villagePost.status, 201);

  const villageFeed = await invoke(firstMiniCaller, "village-feed", {}, firstToken, "mini");
  assert.equal(villageFeed.status, 200);
  assert.equal(villageFeed.data.serviceState, "healthy");
  assert.equal(villageFeed.data.posts.length, 1);
  assert.equal(villageFeed.data.posts[0].content, "周六有人一起吃火锅吗？");
  const resolvedVillageImage = await invoke(firstMiniCaller, "resolve-media-url", {
    fileId: villagePost.data.post.imageFileId,
  }, firstToken, "mini");
  assert.equal(resolvedVillageImage.status, 200);

  const villageLike = await invoke(firstMiniCaller, "toggle-village-like", {
    postId: villagePost.data.post.id,
  }, firstToken, "mini");
  assert.equal(villageLike.status, 200);
  assert.equal(villageLike.data.likeCount, 1);
  const villageComment = await invoke(firstMiniCaller, "add-village-comment", {
    postId: villagePost.data.post.id,
    content: "报名，我们也去！",
  }, firstToken, "mini");
  assert.equal(villageComment.status, 201);
  const villageNotifications = await invoke("browser-c", "notification-center", {}, thirdToken);
  assert.equal(villageNotifications.status, 200);
  assert.ok(villageNotifications.data.items.some((item) => item.type === "village_like"));
  assert.ok(villageNotifications.data.items.some((item) => item.type === "village_comment"));

  fakeCloudbase.setReadFailure("community_comments", true);
  const degradedVillage = await invoke(firstMiniCaller, "village-feed", {}, firstToken, "mini");
  fakeCloudbase.setReadFailure("community_comments", false);
  assert.equal(degradedVillage.status, 200);
  assert.equal(degradedVillage.data.serviceState, "degraded");
  assert.equal(degradedVillage.data.posts.length, 1);

  const leftVillage = await invoke(secondMiniCaller, "leave-village", {}, thirdToken, "mini");
  assert.equal(leftVillage.status, 200);
  const afterLeave = await invoke(secondMiniCaller, "village-hub", {}, thirdToken, "mini");
  assert.equal(afterLeave.data.village, null);
  const dissolvedVillage = await invoke(firstMiniCaller, "dissolve-village", {}, firstToken, "mini");
  assert.equal(dissolvedVillage.status, 200);

  textSafetyResponse = new Error("moderation unavailable");
  const disabled = await invoke(firstMiniCaller, "update-community-settings", {
    enabled: false,
    bio: "旧的公开介绍",
    publicStats: [],
  }, firstToken, "mini");
  assert.equal(disabled.status, 200);
  textSafetyResponse = { result: { suggest: "pass" } };
  imageSafetyResponse = { result: { suggest: "pass" } };
});

test("allows owners to edit their records and clear their history", async () => {
  const weight = await invoke("browser-a", "add-weight", {
    weightKg: 67.2,
    occurredAt: Date.now() - 60_000,
  }, firstToken);
  const editedWeight = await invoke("browser-a", "update-weight", {
    id: weight.data.entry.id,
    weightKg: 66.8,
    occurredAt: Date.now(),
  }, firstToken);
  assert.equal(editedWeight.status, 200);
  assert.equal(editedWeight.data.entry.weightKg, 66.8);

  const poop = await invoke("browser-b", "add-poop", { occurredAt: Date.now() - 60_000 }, secondToken);
  const forbidden = await invoke("browser-a", "update-poop", {
    id: poop.data.entry.id,
    occurredAt: Date.now(),
  }, firstToken);
  assert.equal(forbidden.status, 403);

  const cleared = await invoke("browser-a", "clear-my-records", {}, firstToken);
  assert.equal(cleared.status, 200);
  assert.ok(cleared.data.deleted >= 1);
  const dashboard = await invoke("browser-b", "get-dashboard", {}, secondToken);
  assert.equal(dashboard.data.weights.filter((entry) => entry.ownerUid === editedWeight.data.entry.ownerUid).length, 0);
});

test("can delete and recreate a mini-program identity without credentials", async () => {
  const caller = { uid: "platform-delete-user", openId: "openid-delete", appId: "wx-app" };
  const initial = await invoke(caller, "bootstrap", {}, undefined, "mini");
  await invoke(caller, "update-profile", { nickname: "待注销", avatar: "🐱" }, undefined, "mini");
  const deleted = await invoke(caller, "delete-identity", {}, undefined, "mini");
  assert.equal(deleted.status, 200);
  const recreated = await invoke(caller, "bootstrap", {}, undefined, "mini");
  assert.equal(recreated.status, 200);
  assert.equal(recreated.data.viewer.uid, initial.data.viewer.uid);
  assert.equal(recreated.data.viewer.profileComplete, false);
});

test("ending a relationship immediately isolates the archived records", async () => {
  const result = await invoke("browser-a", "unbind", {}, firstToken);
  assert.equal(result.status, 200);

  const first = await invoke("browser-a", "bootstrap", {}, firstToken);
  const second = await invoke("browser-b", "bootstrap", {}, secondToken);
  assert.equal(first.data.couple, null);
  assert.equal(second.data.couple, null);

  const blocked = await invoke("browser-a", "get-dashboard", {}, firstToken);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, "PAIRING_REQUIRED");
});
